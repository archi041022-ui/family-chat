-- 008: каналы (открытые и приватные), эмодзи-статус, защита от копирования, список задач.

-- ── Каналы: пишет только автор канала (и администратор семьи), остальные читают.
--    Открытый канал виден всей семье и в него можно вступить; приватный — только по приглашению автора.
alter table public.chats add column if not exists is_channel boolean not null default false;
alter table public.chats add column if not exists is_private boolean not null default true;
-- защита: запрет копирования, пересылки, сохранения и снимков экрана
alter table public.chats add column if not exists protected boolean not null default false;

-- эмодзи-статус рядом с именем (и до какого времени он показывается)
alter table public.profiles add column if not exists emoji_status text check (char_length(emoji_status) <= 16);
alter table public.profiles add column if not exists emoji_status_until timestamptz;

create or replace function public.can_post(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(cid) and (
    not coalesce((select is_channel from chats where id = cid), false)
    or exists (select 1 from chats where id = cid and created_by = auth.uid())
    or public.is_admin());
$$;

drop policy if exists "messages send" on public.messages;
create policy "messages send" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_post(chat_id));

create or replace function public.create_channel(title text, description text, private boolean, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid(); m uuid;
begin
  if me is null then raise exception 'NO_AUTH'; end if;
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

-- открытые каналы, в которых меня ещё нет
create or replace function public.public_channels() returns table (id uuid, title text, description text, avatar_path text, members bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.description, c.avatar_path, (select count(*) from chat_members m where m.chat_id = c.id)
  from chats c
  where c.is_channel and not c.is_private and auth.uid() is not null
    and not exists (select 1 from profiles p where p.id = auth.uid() and coalesce(p.banned, false))
    and not exists (select 1 from chat_members m where m.chat_id = c.id and m.user_id = auth.uid())
  order by c.last_message_at desc nulls last;
$$;

create or replace function public.channel_join(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chats where id = cid and is_channel and not is_private) then return 'PRIVATE'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then return 'BANNED'; end if;
  insert into chat_members (chat_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return 'OK';
end $$;

-- настройки канала/группы/чата: приватность канала (автор) и защита содержимого
-- (в группе и канале — создатель, в личной переписке — любой из двоих)
create or replace function public.chat_settings(cid uuid, private boolean, protect boolean) returns text
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  select * into c from chats where id = cid;
  if not found or not public.is_member(cid) then return 'NO_CHAT'; end if;
  if c.is_group and c.created_by is distinct from auth.uid() and not public.is_admin() then return 'NOT_OWNER'; end if;
  update chats set
    is_private = case when c.is_channel and private is not null then private else is_private end,
    protected = coalesce(protect, protected)
  where id = cid;
  return 'OK';
end $$;

-- ── Список задач: личные и общие (в чате/группе). Ассистент добавляет задачи голосом.
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  chat_id     uuid references public.chats on delete cascade,      -- null — личная задача
  assignee_id uuid references public.profiles on delete set null,
  title       text not null check (char_length(title) between 1 and 300),
  note        text check (char_length(note) <= 1000),
  due_at      timestamptz,
  remind      boolean not null default true,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create or replace function public.tasks_guard() returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id; new.created_at := old.created_at;      -- автора задачи поменять нельзя
  if new.done and not old.done then new.done_at := now(); elsif not new.done then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks for each row execute function public.tasks_guard();
create index if not exists tasks_owner on public.tasks (owner_id);
create index if not exists tasks_assignee on public.tasks (assignee_id);
create index if not exists tasks_chat on public.tasks (chat_id);
alter table public.tasks enable row level security;

drop policy if exists "tasks read" on public.tasks;
drop policy if exists "tasks add" on public.tasks;
drop policy if exists "tasks change" on public.tasks;
drop policy if exists "tasks remove" on public.tasks;
create policy "tasks read" on public.tasks for select to authenticated using (
  owner_id = auth.uid() or assignee_id = auth.uid() or (chat_id is not null and public.is_member(chat_id)));
create policy "tasks add" on public.tasks for insert to authenticated with check (
  owner_id = auth.uid() and (chat_id is null or public.is_member(chat_id)));
create policy "tasks change" on public.tasks for update to authenticated using (
  owner_id = auth.uid() or assignee_id = auth.uid() or (chat_id is not null and public.is_member(chat_id)))
  with check (chat_id is null or public.is_member(chat_id));
create policy "tasks remove" on public.tasks for delete to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.tasks to authenticated;
alter table public.tasks replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when others then null; end $$;

revoke all on function public.can_post(uuid), public.create_channel(text, text, boolean, uuid[]), public.public_channels(),
  public.channel_join(uuid), public.chat_settings(uuid, boolean, boolean) from public, anon;
grant execute on function public.can_post(uuid), public.create_channel(text, text, boolean, uuid[]), public.public_channels(),
  public.channel_join(uuid), public.chat_settings(uuid, boolean, boolean) to authenticated;
