-- ═══════════════════════════════════════════════════════════════
--  Обновление 5: чёрный список и удаление участников, видео-кружочки, геолокация.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists banned boolean not null default false;

-- Заблокированный участник не видит чатов и не может писать
create or replace function public.is_member(c uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from chat_members where chat_id = c and user_id = auth.uid())
     and not exists (select 1 from profiles where id = auth.uid() and banned)
$$;
create or replace function public.is_member_text(c text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from chat_members where chat_id::text = c and user_id = auth.uid())
     and not exists (select 1 from profiles where id = auth.uid() and banned)
$$;

-- Новые виды сообщений: видео-кружок и геолокация
alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages add constraint messages_media_type_check
  check (media_type in ('image', 'video', 'audio', 'file', 'video_note', 'location'));

-- Чёрный список: блокирует вход и доступ к перепискам (администратор)
create or replace function public.admin_set_ban(target uuid, ban boolean) returns text
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if target = auth.uid() then return 'SELF'; end if;
  update profiles set banned = ban where id = target;
  if not found then return 'NO_USER'; end if;
  update auth.users set banned_until = case when ban then 'infinity'::timestamptz else null end where id = target;
  if ban then delete from auth.sessions where user_id = target; end if;
  return 'OK';
end $$;

-- Удалить участника из семьи насовсем (вместе с его сообщениями)
create or replace function public.admin_delete_user(target uuid) returns text
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if target = auth.uid() then return 'SELF'; end if;
  delete from auth.users where id = target;
  if not found then return 'NO_USER'; end if;
  return 'OK';
end $$;

revoke all on function public.admin_set_ban(uuid, boolean) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_set_ban(uuid, boolean), public.admin_delete_user(uuid) to authenticated;

-- Участник не может сам снять с себя блокировку через изменение профиля
create or replace function public.protect_banned() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.banned is distinct from old.banned and current_user in ('authenticated', 'anon') then
    new.banned := old.banned;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_banned on public.profiles;
create trigger profiles_protect_banned before update on public.profiles
  for each row execute function public.protect_banned();

select 'ГОТОВО' as status;
