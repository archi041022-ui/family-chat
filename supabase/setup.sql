-- ═══════════════════════════════════════════════════════════════
--  Семейный мессенджер — настройка базы Supabase.
--  Вставьте ВЕСЬ этот файл в Supabase → SQL Editor → New query → Run.
--  Код приглашения поменяйте в строке ниже (SEMYA-4825) на свой.
-- ═══════════════════════════════════════════════════════════════

-- Код приглашения: без него зарегистрироваться нельзя
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;          -- клиенты его не видят
insert into public.app_config values ('invite_code', 'SEMYA-4825')
  on conflict (key) do update set value = excluded.value;

-- ───────── Таблицы ─────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,
  avatar_path text,
  last_seen   timestamptz default now(),
  created_at  timestamptz default now()
);

create table if not exists public.chats (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  is_group        boolean not null default false,
  dm_key          text unique,
  created_by      uuid references public.profiles on delete set null,
  created_at      timestamptz default now(),
  last_message_at timestamptz default now()
);

create table if not exists public.chat_members (
  chat_id      uuid references public.chats on delete cascade,
  user_id      uuid references public.profiles on delete cascade,
  last_read_at timestamptz default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  body       text check (char_length(body) <= 8000),
  media_path text,
  media_type text check (media_type in ('image', 'video', 'audio', 'file')),
  media_name text,
  reply_to   uuid references public.messages on delete set null,
  deleted    boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists messages_chat_time on public.messages (chat_id, created_at desc);

create table if not exists public.reactions (
  message_id uuid references public.messages on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  chat_id    uuid references public.chats on delete cascade,
  emoji      text not null check (char_length(emoji) <= 16),
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

-- ───────── Проверка участия в чате ─────────
create or replace function public.is_member(c uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from chat_members where chat_id = c and user_id = auth.uid())
$$;

create or replace function public.is_member_text(c text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from chat_members where chat_id::text = c and user_id = auth.uid())
$$;

-- ───────── Регистрация: проверка кода и вход в общий чат «Семья» ─────────
insert into public.chats (id, title, is_group)
  values ('00000000-0000-0000-0000-000000000001', 'Семья', true)
  on conflict (id) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select value into code from app_config where key = 'invite_code';
  if coalesce(new.raw_user_meta_data ->> 'invite', '') <> coalesce(code, '') then
    raise exception 'INVALID_INVITE';
  end if;
  insert into profiles (id, name)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Без имени'));
  insert into chat_members (chat_id, user_id)
    values ('00000000-0000-0000-0000-000000000001', new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Время последнего сообщения в чате + chat_id у реакции
create or replace function public.touch_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chats set last_message_at = new.created_at where id = new.chat_id;
  return new;
end $$;
drop trigger if exists on_message_insert on public.messages;
create trigger on_message_insert after insert on public.messages
  for each row execute function public.touch_chat();

create or replace function public.fill_reaction_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select chat_id into new.chat_id from messages where id = new.message_id;
  return new;
end $$;
drop trigger if exists on_reaction_insert on public.reactions;
create trigger on_reaction_insert before insert on public.reactions
  for each row execute function public.fill_reaction_chat();

-- ───────── Личные и групповые чаты ─────────
create or replace function public.get_or_create_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare k text; cid uuid; me uuid := auth.uid();
begin
  if me is null or other is null or other = me then raise exception 'BAD_USER'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  insert into chats (is_group, dm_key, created_by) values (false, k, me)
    on conflict (dm_key) do nothing;
  select id into cid from chats where dm_key = k;
  insert into chat_members (chat_id, user_id) values (cid, me), (cid, other) on conflict do nothing;
  return cid;
end $$;

create or replace function public.create_group(title text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; me uuid := auth.uid(); m uuid;
begin
  if me is null then raise exception 'NO_AUTH'; end if;
  insert into chats (title, is_group, created_by) values (left(trim(title), 80), true, me) returning id into cid;
  insert into chat_members (chat_id, user_id) values (cid, me);
  foreach m in array members loop
    insert into chat_members (chat_id, user_id)
      select cid, m where exists (select 1 from profiles where id = m) on conflict do nothing;
  end loop;
  return cid;
end $$;

-- ───────── Права доступа (RLS) ─────────
alter table public.profiles     enable row level security;
alter table public.chats        enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages     enable row level security;
alter table public.reactions    enable row level security;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "chats read" on public.chats;
create policy "chats read" on public.chats for select to authenticated using (public.is_member(id));

drop policy if exists "members read"   on public.chat_members;
drop policy if exists "members update" on public.chat_members;
create policy "members read"   on public.chat_members for select to authenticated using (public.is_member(chat_id));
create policy "members update" on public.chat_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages send"   on public.messages;
drop policy if exists "messages update" on public.messages;
create policy "messages read"   on public.messages for select to authenticated using (public.is_member(chat_id));
create policy "messages send"   on public.messages for insert to authenticated with check (user_id = auth.uid() and public.is_member(chat_id));
create policy "messages update" on public.messages for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reactions read"   on public.reactions;
drop policy if exists "reactions add"    on public.reactions;
drop policy if exists "reactions remove" on public.reactions;
create policy "reactions read"   on public.reactions for select to authenticated using (public.is_member(chat_id));
create policy "reactions add"    on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.chat_id)));
create policy "reactions remove" on public.reactions for delete to authenticated using (user_id = auth.uid());

-- Явные права для API (на случай, если автоматическая выдача прав выключена)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.chats, public.chat_members, public.messages, public.reactions to authenticated;
grant execute on function public.get_or_create_dm(uuid), public.create_group(text, uuid[]), public.is_member(uuid), public.is_member_text(text) to authenticated;
revoke all on public.app_config from anon, authenticated;

-- ───────── Хранилище фото / видео / голосовых ─────────
insert into storage.buckets (id, name, public, file_size_limit)
  values ('media', 'media', false, 52428800)          -- до 50 МБ на файл
  on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "media read"   on storage.objects;
drop policy if exists "media upload" on storage.objects;
create policy "media read" on storage.objects for select to authenticated using (
  bucket_id = 'media' and (
    (storage.foldername(name))[1] = 'avatars' or public.is_member_text((storage.foldername(name))[1])
  )
);
create policy "media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    name like 'avatars/' || auth.uid()::text || '%' or public.is_member_text((storage.foldername(name))[1])
  )
);

-- ───────── Мгновенная доставка ─────────
alter table public.reactions replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.messages;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chats;     exception when duplicate_object then null; end;
end $$;
