-- КИРПРОФ: восстановление пароля по кодовому слову и вход для разработчика.
-- Supabase → SQL Editor → вставить → Run. Можно запускать повторно.
--
-- После запуска владелец один раз задаёт секретный код разработчика (его знает только он):
--   select kp_set_dev_code('придумайте-длинный-код');
-- Забыли и кодовое слово — владелец может сам выдать клиенту новый пароль:
--   select kp_admin_set_password('client@mail.ru', 'новый-пароль-8+');
create extension if not exists pgcrypto with schema extensions;

alter table public.kp_users add column if not exists rec_hash text;
alter table public.kp_users add column if not exists rec_fails int not null default 0;
alter table public.kp_users add column if not exists rec_locked timestamptz;
alter table public.kp_users add column if not exists is_dev boolean not null default false;

-- Хеш секретного кода разработчика (одна строка). Клиентам таблица не видна.
create table if not exists public.kp_dev (
  id int primary key default 1 check (id = 1),
  hash text,
  fails int not null default 0,
  locked_until timestamptz
);
alter table public.kp_dev enable row level security;
revoke all on public.kp_dev from anon, authenticated;

-- Задать или сменить кодовое слово (клиент входит в кабинет и задаёт сам)
create or replace function public.kp_set_word(tok text, word text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok); w text := lower(btrim(coalesce(word, '')));
begin
  if uid is null then raise exception 'auth'; end if;
  if char_length(w) < 3 or char_length(w) > 60 then raise exception 'bad_word'; end if;
  update kp_users set rec_hash = crypt(w, gen_salt('bf', 10)), rec_fails = 0, rec_locked = null where id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kp_has_word(tok text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select rec_hash is not null from kp_users where id = kp_uid(tok)), false)
$$;

-- Новый пароль по кодовому слову (без входа). 5 ошибок подряд — блокировка на час.
-- Ошибки возвращаются значением, чтобы счётчик попыток не откатывался вместе с транзакцией.
create or replace function public.kp_reset_password(em text, word text, pw text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u kp_users; w text := lower(btrim(coalesce(word, '')));
begin
  em := lower(btrim(coalesce(em, '')));
  if pw is null or char_length(pw) < 8 or char_length(pw) > 72 then return jsonb_build_object('error', 'bad_password'); end if;
  select * into u from kp_users where email = em and not is_dev;
  if not found then perform crypt(w, gen_salt('bf', 10)); return jsonb_build_object('error', 'wrong'); end if;
  if u.rec_hash is null then return jsonb_build_object('error', 'no_word'); end if;
  if u.rec_locked is not null and u.rec_locked > now() then return jsonb_build_object('error', 'locked_word'); end if;
  if crypt(w, u.rec_hash) <> u.rec_hash then
    update kp_users set rec_locked = case when rec_fails + 1 >= 5 then now() + interval '1 hour' else rec_locked end,
      rec_fails = case when rec_fails + 1 >= 5 then 0 else rec_fails + 1 end where id = u.id;
    return jsonb_build_object('error', 'wrong');
  end if;
  update kp_users set pass = crypt(pw, gen_salt('bf', 10)), rec_fails = 0, rec_locked = null, fails = 0, locked_until = null where id = u.id;
  delete from kp_sessions where user_id = u.id;                 -- старые входы закрываем
  return jsonb_build_object('token', kp_new_session(u.id), 'name', u.name);
end $$;

-- Только для владельца (SQL Editor): новый пароль любому клиенту
create or replace function public.kp_admin_set_password(em text, pw text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if pw is null or char_length(pw) < 8 or char_length(pw) > 72 then raise exception 'bad_password'; end if;
  update kp_users set pass = crypt(pw, gen_salt('bf', 10)), fails = 0, locked_until = null where email = lower(btrim(em));
  get diagnostics n = row_count;
  if n = 0 then return 'не найден'; end if;
  delete from kp_sessions where user_id = (select id from kp_users where email = lower(btrim(em)));
  return 'пароль изменён';
end $$;

-- Только для владельца (SQL Editor): секретный код разработчика
create or replace function public.kp_set_dev_code(code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if code is null or char_length(code) < 8 then raise exception 'код короче 8 символов'; end if;
  insert into kp_dev (id, hash, fails, locked_until) values (1, crypt(code, gen_salt('bf', 10)), 0, null)
    on conflict (id) do update set hash = excluded.hash, fails = 0, locked_until = null;
  return 'код разработчика сохранён';
end $$;

-- Вход разработчика по секретному коду: без регистрации и пароля, вход на год.
-- Пока владелец не задал код, вход выключен. 5 ошибок — блокировка на 15 минут.
create or replace function public.kp_dev_login(code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare d kp_dev; uid uuid; tok text := encode(gen_random_bytes(24), 'hex');
begin
  select * into d from kp_dev where id = 1;
  if not found or d.hash is null then return jsonb_build_object('error', 'off'); end if;
  if d.locked_until is not null and d.locked_until > now() then return jsonb_build_object('error', 'locked_dev'); end if;
  if code is null or crypt(code, d.hash) <> d.hash then
    update kp_dev set locked_until = case when fails + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
      fails = case when fails + 1 >= 5 then 0 else fails + 1 end where id = 1;
    return jsonb_build_object('error', 'bad_code');
  end if;
  update kp_dev set fails = 0, locked_until = null where id = 1;
  select id into uid from kp_users where is_dev limit 1;
  if uid is null then
    insert into kp_users (email, pass, name, is_dev) values ('developer@kirprof.local', crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf', 10)), 'Разработчик', true) returning id into uid;
  end if;
  delete from kp_sessions where expires_at < now();
  insert into kp_sessions (token_hash, user_id, expires_at) values (encode(sha256(convert_to(tok, 'utf8')), 'hex'), uid, now() + interval '365 days');
  return jsonb_build_object('token', tok, 'name', 'Разработчик', 'dev', true);
end $$;

revoke all on function public.kp_set_word(text, text), public.kp_has_word(text), public.kp_reset_password(text, text, text),
  public.kp_admin_set_password(text, text), public.kp_set_dev_code(text), public.kp_dev_login(text) from public, anon, authenticated;
grant execute on function public.kp_set_word(text, text), public.kp_has_word(text), public.kp_reset_password(text, text, text), public.kp_dev_login(text) to anon, authenticated;
