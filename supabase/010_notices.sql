-- 010: надёжные оповещения. Сервер сам записывает оповещение каждому получателю
-- (сообщения, публикации в каналах, истории, реакции, задачи, заявки), а телефон забирает их:
-- приложение — сразу по realtime, фоновая служба Android — сама по ключу устройства,
-- даже если страница мессенджера уснула. Каждое оповещение выдаётся ровно один раз.

create table if not exists public.notices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null,          -- message, pending, approved, story, story_react, reaction, task, join, joined
  chat_id    uuid,
  ref        uuid,                   -- сообщение / история / задача
  actor      uuid,
  title      text not null,
  body       text,
  created_at timestamptz not null default now()
);
create index if not exists notices_user on public.notices (user_id, id);
create index if not exists notices_time on public.notices (created_at);
alter table public.notices enable row level security;
drop policy if exists "notices read" on public.notices;
create policy "notices read" on public.notices for select to authenticated using (user_id = auth.uid());
grant select on public.notices to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.notices;
exception when others then null; end $$;

-- устройства (ключ хранится только в виде хэша)
create table if not exists public.push_devices (
  key_hash   text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
alter table public.push_devices enable row level security;   -- напрямую недоступна никому

-- короткий текст сообщения для оповещения (без служебных знаков)
create or replace function public.notice_text(b text, mt text) returns text
language sql immutable set search_path = public as $$
  select left(case
    when mt = 'location' then '📍 Геолокация'
    else coalesce(case mt when 'image' then '📷 Фото' when 'video' then '🎬 Видео' when 'audio' then '🎤 Голосовое'
                          when 'file' then '📎 Файл' when 'video_note' then '⭕ Видеосообщение' end, '')
      || case when mt in ('image','video','audio','file','video_note') and t <> '' then ' · ' else '' end || t
  end, 200)
  from (select btrim(split_part(
    regexp_replace(regexp_replace(replace(coalesce(b, ''), chr(8291), ''), chr(8290) || 'fx:[a-z]+', '', 'g'),
      '^↪️ Переслано от [^' || chr(10) || ']*' || chr(10) || '?', ''),
    chr(8292), 1)) as t) x;
$$;

create or replace function public.notice_chat_title(cid uuid, author uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when c.is_group then coalesce(nullif(c.title, ''), 'Группа')
              else coalesce((select name from profiles where id = author), 'Сообщение') end
  from chats c where c.id = cid;
$$;

-- новое сообщение / публикация
create or replace function public.notices_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype; who text; ttl text; txt text;
begin
  begin
    if new.deleted then return null; end if;
    select * into c from chats where id = new.chat_id;
    if not found then return null; end if;
    who := coalesce((select name from profiles where id = new.user_id), 'Кто-то');
    ttl := notice_chat_title(c.id, new.user_id);
    txt := notice_text(new.body, new.media_type);
    if txt = '' then txt := 'Новое сообщение'; end if;
    if tg_op = 'INSERT' and new.approved then
      insert into notices (user_id, kind, chat_id, ref, actor, title, body)
        select m.user_id, 'message', c.id, new.id, new.user_id, ttl,
               case when c.is_group and not c.is_channel then who || ': ' || txt
                    when c.is_channel and new.user_id <> coalesce(c.created_by, new.user_id) then who || ': ' || txt
                    else txt end
        from chat_members m where m.chat_id = c.id and m.user_id <> new.user_id;
    elsif tg_op = 'INSERT' then
      insert into notices (user_id, kind, chat_id, ref, actor, title, body)
        select m.user_id, 'pending', c.id, new.id, new.user_id, '⏳ На одобрение: ' || ttl, who || ': ' || txt
        from chat_members m
        where m.chat_id = c.id and m.user_id <> new.user_id
          and (m.user_id = c.created_by or m.user_id::text = (select value from app_config where key = 'admin_id'));
    elsif tg_op = 'UPDATE' and new.approved and not old.approved then
      insert into notices (user_id, kind, chat_id, ref, actor, title, body)
        select m.user_id, 'message', c.id, new.id, new.user_id, ttl, case when c.is_channel then txt else who || ': ' || txt end
        from chat_members m where m.chat_id = c.id and m.user_id <> new.user_id and m.user_id is distinct from auth.uid();
      insert into notices (user_id, kind, chat_id, ref, actor, title, body)
        values (new.user_id, 'approved', c.id, new.id, auth.uid(), '✅ Опубликовано в «' || ttl || '»', txt);
    end if;
  exception when others then raise warning 'notices_on_message: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_msg_ins on public.messages;
create trigger notices_msg_ins after insert on public.messages for each row execute function public.notices_on_message();
drop trigger if exists notices_msg_upd on public.messages;
create trigger notices_msg_upd after update of approved on public.messages for each row execute function public.notices_on_message();

-- новая история — всей семье
create or replace function public.notices_on_story() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  begin
    who := coalesce((select name from profiles where id = new.user_id), 'Кто-то');
    insert into notices (user_id, kind, ref, actor, title, body)
      select p.id, 'story', new.id, new.user_id, '📸 ' || who || ' — новая история',
             coalesce(nullif(left(btrim(new.body), 120), ''), case new.media_type when 'video' then '🎬 Видео' else '📷 Фото' end)
      from profiles p where p.id <> new.user_id and not coalesce(p.banned, false);
  exception when others then raise warning 'notices_on_story: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_story on public.stories;
create trigger notices_story after insert on public.stories for each row execute function public.notices_on_story();

-- реакция на мою историю
create or replace function public.notices_on_story_view() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  begin
    if new.emoji is null or (tg_op = 'UPDATE' and new.emoji is not distinct from old.emoji) then return null; end if;
    select user_id into owner from stories where id = new.story_id;
    if owner is null or owner = new.viewer_id then return null; end if;
    insert into notices (user_id, kind, ref, actor, title, body)
      values (owner, 'story_react', new.story_id, new.viewer_id,
              coalesce((select name from profiles where id = new.viewer_id), 'Кто-то'), new.emoji || ' — реакция на вашу историю');
  exception when others then raise warning 'notices_on_story_view: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_story_view on public.story_views;
create trigger notices_story_view after insert or update on public.story_views for each row execute function public.notices_on_story_view();

-- реакция на моё сообщение
create or replace function public.notices_on_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare m messages%rowtype;
begin
  begin
    select * into m from messages where id = new.message_id;
    if not found or m.user_id = new.user_id or m.deleted then return null; end if;
    insert into notices (user_id, kind, chat_id, ref, actor, title, body)
      values (m.user_id, 'reaction', m.chat_id, m.id, new.user_id,
              coalesce((select name from profiles where id = new.user_id), 'Кто-то'),
              new.emoji || ' к вашему сообщению: ' || left(coalesce(nullif(notice_text(m.body, m.media_type), ''), '…'), 80));
  exception when others then raise warning 'notices_on_reaction: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_reaction on public.reactions;
create trigger notices_reaction after insert on public.reactions for each row execute function public.notices_on_reaction();

-- поручили задачу
create or replace function public.notices_on_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.assignee_id is null or new.assignee_id = new.owner_id then return null; end if;
    if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return null; end if;
    insert into notices (user_id, kind, chat_id, ref, actor, title, body)
      values (new.assignee_id, 'task', new.chat_id, new.id, new.owner_id,
              '📝 Новая задача от: ' || coalesce((select name from profiles where id = new.owner_id), 'Кто-то'), new.title);
  exception when others then raise warning 'notices_on_task: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_task on public.tasks;
create trigger notices_task after insert or update of assignee_id on public.tasks for each row execute function public.notices_on_task();

-- заявка на вступление — создателю
create or replace function public.notices_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  begin
    select * into c from chats where id = new.chat_id;
    if not found then return null; end if;
    insert into notices (user_id, kind, chat_id, ref, actor, title, body)
      select m.user_id, 'join', c.id, c.id, new.user_id, '🙋 Заявка: ' || coalesce(c.title, 'группа'),
             coalesce((select name from profiles where id = new.user_id), 'Кто-то') || ' просит вступить'
      from chat_members m
      where m.chat_id = c.id and m.user_id <> new.user_id
        and (m.user_id = c.created_by or m.user_id::text = (select value from app_config where key = 'admin_id'));
  exception when others then raise warning 'notices_on_join: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_join on public.join_requests;
create trigger notices_join after insert on public.join_requests for each row execute function public.notices_on_join();

-- одобрение заявки: приглашённому — «Вас приняли»
create or replace function public.decide_join(cid uuid, target uuid, ok boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_owner(cid) or not public.is_member(cid) then return 'NOT_OWNER'; end if;
  if not exists (select 1 from join_requests where chat_id = cid and user_id = target) then return 'NO_REQUEST'; end if;
  delete from join_requests where chat_id = cid and user_id = target;
  if ok then
    insert into chat_members (chat_id, user_id)
      select cid, target where exists (select 1 from profiles where id = target and not coalesce(banned, false)) on conflict do nothing;
    insert into notices (user_id, kind, chat_id, ref, actor, title, body)
      select target, 'joined', cid, cid, auth.uid(), '🎉 Заявка одобрена', 'Вас приняли в «' || coalesce(title, 'группу') || '»'
      from chats where id = cid;
  end if;
  return 'OK';
end $$;

-- забрать свои оповещения (приложение)
create or replace function public.claim_notices() returns setof public.notices
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from notices where created_at < now() - interval '3 days';
  return query with d as (delete from notices where user_id = auth.uid() returning *) select * from d order by id;
end $$;

-- устройство: регистрация ключа и забор оповещений фоновой службой без входа
create or replace function public.register_device(key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'NO_AUTH'; end if;
  if key is null or length(key) < 32 then return 'BAD_KEY'; end if;
  insert into push_devices (key_hash, user_id) values (encode(sha256(convert_to(key, 'UTF8')), 'hex'), auth.uid())
    on conflict (key_hash) do update set user_id = excluded.user_id, seen_at = now();
  return 'OK';
end $$;

create or replace function public.unregister_device(key text) returns text
language sql security definer set search_path = public as $$
  delete from push_devices where key_hash = encode(sha256(convert_to(coalesce(key, ''), 'UTF8')), 'hex') and user_id = auth.uid() returning 'OK';
$$;

create or replace function public.device_pull(key text) returns setof public.notices
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if key is null or length(key) < 32 then return; end if;
  update push_devices d set seen_at = now()
    where d.key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex')
      and not exists (select 1 from profiles p where p.id = d.user_id and coalesce(p.banned, false))
    returning d.user_id into u;
  if u is null then return; end if;
  return query with d as (delete from notices where user_id = u returning *) select * from d order by id;
end $$;

revoke all on function public.notice_chat_title(uuid, uuid), public.claim_notices(), public.register_device(text),
  public.unregister_device(text), public.device_pull(text) from public, anon;
grant execute on function public.claim_notices(), public.register_device(text), public.unregister_device(text) to authenticated;
grant execute on function public.device_pull(text) to anon, authenticated;
