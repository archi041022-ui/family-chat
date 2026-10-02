-- 009: в открытых каналах пишут все подписчики; в приватных каналах и группах (по выбору создателя)
-- сообщения участников публикуются после одобрения; вступление в приватные группы/каналы — по заявке.

alter table public.chats add column if not exists members_can_post boolean not null default false;  -- каналы: могут ли писать подписчики
alter table public.chats add column if not exists moderated boolean not null default false;         -- сообщения участников — после одобрения
alter table public.chats add column if not exists listed boolean not null default false;            -- приватную группу/канал видно в поиске, вступление по заявке
alter table public.messages add column if not exists approved boolean not null default true;

-- уже созданные каналы: открытые — пишут все, приватные — пишут после одобрения
update public.chats set members_can_post = true, moderated = is_private where is_channel and not members_can_post;

create or replace function public.chat_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats where id = cid and created_by = auth.uid()) or public.is_admin();
$$;

create or replace function public.can_post(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(cid) and (
    not coalesce((select is_channel from chats where id = cid), false)
    or coalesce((select members_can_post from chats where id = cid), false)
    or public.chat_owner(cid));
$$;

-- одобрение: сообщение участника в «модерируемом» чате сначала видят только автор и создатель
create or replace function public.messages_moderate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.approved := not exists (select 1 from chats c where c.id = new.chat_id and c.moderated)
               or public.chat_owner(new.chat_id);
  return new;
end $$;
drop trigger if exists messages_moderate on public.messages;
create trigger messages_moderate before insert on public.messages for each row execute function public.messages_moderate();

-- автор не может сам себе «одобрить» сообщение правкой
create or replace function public.messages_keep_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved and not old.approved and not public.chat_owner(old.chat_id) then new.approved := false; end if;
  return new;
end $$;
drop trigger if exists messages_keep_approval on public.messages;
create trigger messages_keep_approval before update on public.messages for each row execute function public.messages_keep_approval();

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (
  public.is_member(chat_id) and (approved or user_id = auth.uid() or public.chat_owner(chat_id)));

create or replace function public.moderate_message(mid uuid, ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select chat_id into cid from messages where id = mid;
  if cid is null then return 'NO_MESSAGE'; end if;
  if not public.chat_owner(cid) or not public.is_member(cid) then return 'NOT_OWNER'; end if;
  if ok then update messages set approved = true where id = mid;
  else delete from messages where id = mid; end if;
  return 'OK';
end $$;

-- ── заявки на вступление
create table if not exists public.join_requests (
  chat_id    uuid not null references public.chats on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
alter table public.join_requests enable row level security;
drop policy if exists "join requests read" on public.join_requests;
create policy "join requests read" on public.join_requests for select to authenticated using (
  user_id = auth.uid() or public.chat_owner(chat_id));
grant select on public.join_requests to authenticated;
alter table public.join_requests replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.join_requests;
exception when others then null; end $$;

-- каталог: открытые каналы и приватные группы/каналы, в которые можно подать заявку
create or replace function public.directory() returns table (id uuid, title text, description text, avatar_path text,
  is_channel boolean, is_private boolean, members bigint, requested boolean, owner_name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.description, c.avatar_path, c.is_channel, c.is_private,
    (select count(*) from chat_members m where m.chat_id = c.id),
    exists (select 1 from join_requests r where r.chat_id = c.id and r.user_id = auth.uid()),
    (select name from profiles p where p.id = c.created_by)
  from chats c
  where c.is_group and c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    and ((c.is_channel and not c.is_private) or c.listed)
    and auth.uid() is not null
    and not exists (select 1 from profiles p where p.id = auth.uid() and coalesce(p.banned, false))
    and not exists (select 1 from chat_members m where m.chat_id = c.id and m.user_id = auth.uid())
  order by c.last_message_at desc nulls last;
$$;

create or replace function public.request_join(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  select * into c from chats where id = cid;
  if not found or not c.is_group then return 'NO_CHAT'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then return 'BANNED'; end if;
  if exists (select 1 from chat_members where chat_id = cid and user_id = auth.uid()) then return 'MEMBER'; end if;
  if c.is_channel and not c.is_private then
    insert into chat_members (chat_id, user_id) values (cid, auth.uid()) on conflict do nothing;
    return 'JOINED';
  end if;
  if not c.listed then return 'PRIVATE'; end if;
  insert into join_requests (chat_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return 'REQUESTED';
end $$;

create or replace function public.cancel_join(cid uuid) returns text
language sql security definer set search_path = public as $$
  delete from join_requests where chat_id = cid and user_id = auth.uid() returning 'OK';
$$;

create or replace function public.decide_join(cid uuid, target uuid, ok boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_owner(cid) or not public.is_member(cid) then return 'NOT_OWNER'; end if;
  if not exists (select 1 from join_requests where chat_id = cid and user_id = target) then return 'NO_REQUEST'; end if;
  delete from join_requests where chat_id = cid and user_id = target;
  if ok then
    insert into chat_members (chat_id, user_id)
      select cid, target where exists (select 1 from profiles where id = target and not coalesce(banned, false)) on conflict do nothing;
  end if;
  return 'OK';
end $$;

-- настройки чата (создатель): приватность, защита, кто пишет, одобрение сообщений, видимость в поиске
create or replace function public.chat_settings2(cid uuid, settings jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  select * into c from chats where id = cid;
  if not found or not public.is_member(cid) then return 'NO_CHAT'; end if;
  if c.is_group and not public.chat_owner(cid) then return 'NOT_OWNER'; end if;
  if not c.is_group and (settings ? 'private' or settings ? 'members_can_post' or settings ? 'moderated' or settings ? 'listed') then return 'NOT_GROUP'; end if;
  if cid = '00000000-0000-0000-0000-000000000001'::uuid and (settings ? 'moderated' or settings ? 'listed') then return 'FAMILY'; end if;
  update chats set
    is_private       = case when c.is_channel and settings ? 'private' then (settings->>'private')::boolean else is_private end,
    protected        = coalesce((settings->>'protected')::boolean, protected),
    members_can_post = case when c.is_channel and settings ? 'members_can_post' then (settings->>'members_can_post')::boolean else members_can_post end,
    moderated        = coalesce((settings->>'moderated')::boolean, moderated),
    listed           = coalesce((settings->>'listed')::boolean, listed)
  where id = cid;
  -- если одобрение выключили — всё ожидающее публикуется
  if (settings->>'moderated')::boolean is false then update messages set approved = true where chat_id = cid and not approved; end if;
  return 'OK';
end $$;

revoke all on function public.chat_owner(uuid), public.moderate_message(uuid, boolean), public.directory(), public.request_join(uuid),
  public.cancel_join(uuid), public.decide_join(uuid, uuid, boolean), public.chat_settings2(uuid, jsonb) from public, anon;
grant execute on function public.chat_owner(uuid), public.moderate_message(uuid, boolean), public.directory(), public.request_join(uuid),
  public.cancel_join(uuid), public.decide_join(uuid, uuid, boolean), public.chat_settings2(uuid, jsonb) to authenticated;
