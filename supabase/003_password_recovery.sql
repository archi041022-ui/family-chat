-- ═══════════════════════════════════════════════════════════════
--  Обновление 3: восстановление пароля.
--  1) Кодовое слово: пользователь задаёт его сам и по нему меняет пароль.
--  2) Администратор семьи может задать новый пароль любому участнику.
--  Supabase → SQL Editor → вставить → Run. Можно запускать повторно.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- Хеши кодовых слов и счётчик неудачных попыток. Клиентам таблица не видна.
create table if not exists public.account_recovery (
  user_id      uuid primary key references auth.users on delete cascade,
  secret_hash  text,
  attempts     int not null default 0,
  locked_until timestamptz
);
alter table public.account_recovery enable row level security;
revoke all on public.account_recovery from anon, authenticated;

-- Администратор семьи — по умолчанию тот, кто зарегистрировался первым
insert into public.app_config (key, value)
  select 'admin_id', id::text from public.profiles order by created_at asc limit 1
  on conflict (key) do nothing;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from app_config where key = 'admin_id' and value = auth.uid()::text)
$$;

-- Задать или сменить своё кодовое слово
create or replace function public.set_recovery_word(word text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare w text := lower(trim(coalesce(word, '')));
begin
  if auth.uid() is null then raise exception 'NO_AUTH'; end if;
  if char_length(w) < 3 then raise exception 'WORD_TOO_SHORT'; end if;
  insert into account_recovery (user_id, secret_hash, attempts, locked_until)
    values (auth.uid(), crypt(w, gen_salt('bf')), 0, null)
    on conflict (user_id) do update set secret_hash = excluded.secret_hash, attempts = 0, locked_until = null;
end $$;

create or replace function public.has_recovery_word() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from account_recovery where user_id = auth.uid() and secret_hash is not null)
$$;

-- Смена пароля по кодовому слову (без входа). 5 ошибок — блокировка на час.
create or replace function public.reset_password_with_word(login_email text, word text, new_password text) returns text
language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid; rec account_recovery%rowtype; w text := lower(trim(coalesce(word, '')));
begin
  if char_length(coalesce(new_password, '')) < 6 then return 'PASSWORD_TOO_SHORT'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(login_email));
  if uid is null then perform pg_sleep(0.5); return 'WRONG'; end if;
  select * into rec from account_recovery where user_id = uid;
  if rec.user_id is null or rec.secret_hash is null then return 'NO_WORD'; end if;
  if rec.locked_until is not null and rec.locked_until > now() then return 'LOCKED'; end if;
  if rec.secret_hash <> crypt(w, rec.secret_hash) then
    update account_recovery
      set attempts = rec.attempts + 1,
          locked_until = case when rec.attempts + 1 >= 5 then now() + interval '1 hour' else null end
      where user_id = uid;
    perform pg_sleep(0.5);
    return 'WRONG';
  end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = uid;
  update account_recovery set attempts = 0, locked_until = null where user_id = uid;
  delete from auth.sessions where user_id = uid;      -- выход на всех остальных устройствах
  return 'OK';
end $$;

-- Администратор задаёт новый пароль участнику
create or replace function public.admin_reset_password(target uuid, new_password text) returns text
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if char_length(coalesce(new_password, '')) < 6 then return 'PASSWORD_TOO_SHORT'; end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
  if not found then return 'NO_USER'; end if;
  update account_recovery set attempts = 0, locked_until = null where user_id = target;
  delete from auth.sessions where user_id = target;
  return 'OK';
end $$;

-- Логин участника (для подсказки администратору)
create or replace function public.admin_user_login(target uuid) returns text
language sql security definer stable set search_path = public, auth as $$
  select case when public.is_admin() then split_part(email, '@', 1) end from auth.users where id = target
$$;

revoke all on function public.reset_password_with_word(text, text, text) from public;
revoke all on function public.admin_reset_password(uuid, text) from public;
revoke all on function public.set_recovery_word(text) from public;
revoke all on function public.admin_user_login(uuid) from public;
grant execute on function public.reset_password_with_word(text, text, text) to anon, authenticated;
grant execute on function public.set_recovery_word(text), public.has_recovery_word(), public.is_admin(),
  public.admin_reset_password(uuid, text), public.admin_user_login(uuid) to authenticated;

select 'ГОТОВО' as status,
  (select p.name from public.profiles p join public.app_config c on c.key = 'admin_id' and c.value = p.id::text) as admin;
