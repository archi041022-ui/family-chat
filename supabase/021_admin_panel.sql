-- ═══════════════════════════════════════════════════════════════
--  Обновление 4.3: панель администратора (только владелец приложения), ограничения участников,
--  журнал «кто что создал», надёжное приветствие новичков.
--  Администратор = запись admin_id в app_config; все функции ниже проверяют is_admin() на сервере.
-- ═══════════════════════════════════════════════════════════════

-- ограничения участника (меняет только администратор; сам участник снять их не может)
alter table public.profiles add column if not exists lim_create   boolean not null default false;  -- нельзя создавать группы и каналы
alter table public.profiles add column if not exists lim_media    boolean not null default false;  -- нельзя отправлять фото, видео, голосовые, файлы
alter table public.profiles add column if not exists lim_readonly boolean not null default false;  -- только чтение: писать нельзя нигде

create or replace function public.protect_banned() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.banned is distinct from old.banned then new.banned := old.banned; end if;
    new.lim_create := old.lim_create; new.lim_media := old.lim_media; new.lim_readonly := old.lim_readonly;
  end if;
  return new;
end $$;

-- журнал событий (читает только администратор через admin_log_list)
create table if not exists public.admin_log (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  actor uuid,
  kind  text not null,
  ref   uuid,
  title text
);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
create index if not exists admin_log_at on public.admin_log (at desc);

create or replace function public.log_chat_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_group and new.id <> '00000000-0000-0000-0000-000000000001'::uuid then
    insert into admin_log(actor, kind, ref, title) values (new.created_by, case when coalesce(new.is_channel, false) then 'channel' else 'group' end, new.id, new.title);
  end if;
  return new;
end $$;
drop trigger if exists log_chat_created on public.chats;
create trigger log_chat_created after insert on public.chats for each row execute function public.log_chat_created();

create or replace function public.log_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into admin_log(actor, kind, ref, title) values (new.id, 'join', new.id, new.name);
  return new;
end $$;
drop trigger if exists log_profile_created on public.profiles;
create trigger log_profile_created after insert on public.profiles for each row execute function public.log_profile_created();

-- общий выключатель: создавать группы и каналы может только администратор
create or replace function public.creation_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_admin() and (
    coalesce((select lim_create from profiles where id = auth.uid()), false)
    or exists (select 1 from app_config where key = 'create_admin_only' and value = 'on'))
$$;

create or replace function public.create_group(title text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid(); m uuid;
begin
  if me is null then raise exception 'NO_AUTH'; end if;
  if public.creation_blocked() then raise exception 'LIMITED_CREATE'; end if;
  insert into chats (title, is_group, created_by) values (left(trim(title), 80), true, me) returning id into cid;
  insert into chat_members (chat_id, user_id) values (cid, me);
  foreach m in array members loop
    insert into chat_members (chat_id, user_id)
      select cid, m where exists (select 1 from profiles where id = m) on conflict do nothing;
  end loop;
  return cid;
end $$;

create or replace function public.create_channel(title text, description text, private boolean, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid(); m uuid;
begin
  if me is null then raise exception 'NO_AUTH'; end if;
  if public.creation_blocked() then raise exception 'LIMITED_CREATE'; end if;
  insert into chats (title, is_group, is_channel, is_private, description, created_by)
    values (left(trim(title), 80), true, true, coalesce(private, true), nullif(left(trim(coalesce(description, '')), 300), ''), me)
    returning id into cid;
  insert into chat_members (chat_id, user_id) values (cid, me);
  foreach m in array coalesce(members, '{}') loop
    insert into chat_members (chat_id, user_id)
      select cid, m where exists (select 1 from profiles where id = m and not coalesce(banned, false)) on conflict do nothing;
  end loop;
  return cid;
end $$;

-- ограничения на отправку сообщений
create or replace function public.messages_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = new.user_id;
  if p.id is null or public.is_admin() then return new; end if;
  if p.lim_readonly then raise exception 'LIMITED_READONLY'; end if;
  if p.lim_media and new.media_type is not null and new.media_type not in ('location') then raise exception 'LIMITED_MEDIA'; end if;
  return new;
end $$;
drop trigger if exists messages_limits on public.messages;
create trigger messages_limits before insert on public.messages for each row execute function public.messages_limits();

-- ───────── Функции администратора ─────────
create or replace function public.admin_overview() returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return jsonb_build_object(
    'create_admin_only', exists (select 1 from app_config where key = 'create_admin_only' and value = 'on'),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'banned', coalesce(p.banned, false), 'joined', p.created_at, 'last_seen', p.last_seen,
        'lim_create', p.lim_create, 'lim_media', p.lim_media, 'lim_readonly', p.lim_readonly,
        'groups', (select count(*) from chats c where c.created_by = p.id and c.is_group and not coalesce(c.is_channel, false) and c.id <> '00000000-0000-0000-0000-000000000001'::uuid),
        'channels', (select count(*) from chats c where c.created_by = p.id and coalesce(c.is_channel, false)),
        'msgs', (select count(*) from messages m where m.user_id = p.id)) order by p.created_at) from profiles p), '[]'::jsonb),
    'chats', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'channel', coalesce(c.is_channel, false), 'private', coalesce(c.is_private, false), 'by', c.created_by, 'at', c.created_at,
        'members', (select count(*) from chat_members cm where cm.chat_id = c.id),
        'msgs', (select count(*) from messages m where m.chat_id = c.id),
        'family', c.id = '00000000-0000-0000-0000-000000000001'::uuid) order by c.created_at desc)
      from chats c where c.is_group), '[]'::jsonb));
end $$;

create or replace function public.admin_log_list(lim int default 60) returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor', l.actor, 'kind', l.kind, 'ref', l.ref, 'title', l.title) order by l.at desc)
    from (select * from admin_log order by at desc limit least(greatest(coalesce(lim, 60), 1), 200)) l), '[]'::jsonb);
end $$;

create or replace function public.admin_set_limits(target uuid, l_create boolean, l_media boolean, l_readonly boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if target = auth.uid() then return 'SELF'; end if;
  update profiles set lim_create = coalesce(l_create, false), lim_media = coalesce(l_media, false), lim_readonly = coalesce(l_readonly, false) where id = target;
  if not found then return 'NO_USER'; end if;
  insert into admin_log(actor, kind, ref, title) values (auth.uid(), 'limits', target,
    (select name from profiles where id = target) || ': ' || concat_ws(', ', case when l_create then 'без создания чатов' end, case when l_media then 'без медиа' end, case when l_readonly then 'только чтение' end));
  return 'OK';
end $$;

create or replace function public.admin_set_create_only(on_ boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if on_ then insert into app_config(key, value) values ('create_admin_only', 'on') on conflict (key) do update set value = 'on';
  else delete from app_config where key = 'create_admin_only'; end if;
  insert into admin_log(actor, kind, title) values (auth.uid(), 'setting', case when on_ then 'Группы и каналы создаёт только администратор' else 'Создание групп и каналов разрешено всем' end);
  return 'OK';
end $$;

create or replace function public.admin_delete_chat(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if cid = '00000000-0000-0000-0000-000000000001'::uuid then return 'FAMILY'; end if;
  select title into t from chats where id = cid and is_group;
  if not found then return 'NO_CHAT'; end if;
  delete from chats where id = cid;
  insert into admin_log(actor, kind, title) values (auth.uid(), 'deleted', t);
  return 'OK';
end $$;

-- Приветствие новичка: одно сообщение в общем чате, не больше одного раза, даже если приложение закрыли раньше времени
create or replace function public.welcome_me() returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); fam constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if me is null then return 'NO_AUTH'; end if;
  if not exists (select 1 from profiles where id = me and created_at > now() - interval '3 days') then return 'OLD'; end if;
  if not exists (select 1 from chat_members where chat_id = fam and user_id = me) then return 'NO_FAMILY'; end if;
  if exists (select 1 from messages where chat_id = fam and user_id = me and media_type is null and body = E'\U0001F44B Я теперь в «Семье»!') then return 'DONE'; end if;
  insert into messages(chat_id, user_id, body) values (fam, me, E'\U0001F44B Я теперь в «Семье»!');
  return 'OK';
end $$;

revoke all on function public.admin_overview(), public.admin_log_list(int), public.admin_set_limits(uuid, boolean, boolean, boolean),
  public.admin_set_create_only(boolean), public.admin_delete_chat(uuid), public.welcome_me(), public.creation_blocked() from public;
grant execute on function public.admin_overview(), public.admin_log_list(int), public.admin_set_limits(uuid, boolean, boolean, boolean),
  public.admin_set_create_only(boolean), public.admin_delete_chat(uuid), public.welcome_me(), public.creation_blocked() to authenticated;
-- в Supabase новые функции по умолчанию доступны и анониму: закрываем явно
revoke execute on function public.admin_overview(), public.admin_log_list(int), public.admin_set_limits(uuid, boolean, boolean, boolean),
  public.admin_set_create_only(boolean), public.admin_delete_chat(uuid), public.welcome_me(), public.creation_blocked() from anon;
