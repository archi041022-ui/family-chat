-- 014: GIF (свои и найденные), ключ GIPHY для администратора, «правка ≠ новое сообщение»

-- правка старого сообщения не должна выглядеть у остальных как новое: realtime присылает прежнюю строку
alter table public.messages replica identity full;

-- коллекция «Мои GIF»
create table if not exists public.user_gifs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  path       text not null check (char_length(path) <= 300),
  title      text check (char_length(title) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists user_gifs_user on public.user_gifs (user_id, created_at desc);
alter table public.user_gifs enable row level security;
drop policy if exists "gifs own" on public.user_gifs;
create policy "gifs own" on public.user_gifs for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and path like 'gifs/' || auth.uid()::text || '/%');
grant select, insert, delete on public.user_gifs to authenticated;
drop policy if exists "media gifs read" on storage.objects;
drop policy if exists "media gifs upload" on storage.objects;
drop policy if exists "media gifs delete" on storage.objects;
create policy "media gifs read" on storage.objects for select to authenticated using (
  bucket_id = 'media' and name like 'gifs/' || auth.uid()::text || '/%');
create policy "media gifs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and name like 'gifs/' || auth.uid()::text || '/%');
create policy "media gifs delete" on storage.objects for delete to authenticated using (
  bucket_id = 'media' and name like 'gifs/' || auth.uid()::text || '/%');

-- ключ GIPHY: задаёт только администратор; сам ключ клиентам не отдаётся
create or replace function public.set_gif_key(k text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if k is null or btrim(k) = '' then delete from app_config where key = 'giphy_key'; return 'OK'; end if;
  if btrim(k) !~ '^[A-Za-z0-9]{16,64}$' then return 'BAD_KEY'; end if;
  insert into app_config (key, value) values ('giphy_key', btrim(k)) on conflict (key) do update set value = excluded.value;
  return 'OK';
end $$;

create or replace function public.gif_status() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from app_config where key = 'giphy_key');
$$;

revoke all on function public.set_gif_key(text), public.gif_status() from public, anon;
grant execute on function public.set_gif_key(text), public.gif_status() to authenticated;

select (select count(*) from pg_proc where proname in ('set_gif_key','gif_status')) || ' f | tbl=' ||
  (select count(*) from information_schema.tables where table_name = 'user_gifs') || ' | pol=' ||
  (select count(*) from pg_policies where policyname like 'media gifs%') as check_result;
