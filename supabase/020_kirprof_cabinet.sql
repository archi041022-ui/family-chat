-- КИРПРОФ: личный кабинет, скидки, купоны, подарочные сертификаты, заказы.
-- Все таблицы закрыты (RLS без политик), работа только через функции ниже.
-- Владелец выдаёт коды в панели Supabase (SQL Editor):
--   select kp_mint_certificate(5000);                                    -- подарочный сертификат на 5000 ₽
--   select kp_mint_coupon('OSEN10', 10, null, 30);                       -- общий промокод -10%, без лимита использований, 30 дней
--   update kp_orders set status = 'done' where num = 7;                  -- заказ выполнен: идёт в уровень лояльности клиента
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.kp_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass text not null,
  name text not null check (char_length(name) between 1 and 40),
  phone text,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.kp_sessions (
  token_hash text primary key,
  user_id uuid not null references public.kp_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.kp_codes (
  code text primary key,
  kind text not null check (kind in ('coupon', 'certificate')),
  percent int check (percent between 1 and 90),
  amount int,
  balance int,
  user_id uuid references public.kp_users(id) on delete set null,
  uses_left int,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.kp_orders (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,
  user_id uuid references public.kp_users(id) on delete set null,
  name text not null, phone text not null, email text, address text, comment text,
  items jsonb not null, total int not null, discount int not null default 0, cert int not null default 0, final int not null,
  code text, status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.kp_users enable row level security;
alter table public.kp_sessions enable row level security;
alter table public.kp_codes enable row level security;
alter table public.kp_orders enable row level security;
revoke all on public.kp_users, public.kp_sessions, public.kp_codes, public.kp_orders from anon, authenticated;

create or replace function public.kp_uid(tok text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select user_id from kp_sessions where tok is not null and char_length(tok) between 32 and 100
    and token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex') and expires_at > now()
$$;

create or replace function public.kp_level(done int) returns jsonb
language sql immutable as $$
  select case when done >= 5 then jsonb_build_object('name', 'Золото', 'percent', 7, 'next', null)
              when done >= 3 then jsonb_build_object('name', 'Серебро', 'percent', 5, 'next', 5)
              when done >= 1 then jsonb_build_object('name', 'Постоянный клиент', 'percent', 3, 'next', 3)
              else jsonb_build_object('name', 'Клиент', 'percent', 0, 'next', 1) end
$$;

create or replace function public.kp_new_session(uid uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(gen_random_bytes(24), 'hex');
begin
  delete from kp_sessions where expires_at < now();
  insert into kp_sessions(token_hash, user_id, expires_at)
    values (encode(sha256(convert_to(tok, 'utf8')), 'hex'), uid, now() + interval '30 days');
  return tok;
end $$;

create or replace function public.kp_register(em text, pw text, nm text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; c text;
begin
  em := lower(btrim(coalesce(em, ''))); nm := btrim(coalesce(nm, ''));
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 120 then raise exception 'bad_email'; end if;
  if pw is null or char_length(pw) < 8 or char_length(pw) > 72 then raise exception 'bad_password'; end if;
  if char_length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
  if exists (select 1 from kp_users where email = em) then raise exception 'exists'; end if;
  if (select count(*) from kp_users where created_at > now() - interval '1 hour') >= 30 then raise exception 'limit'; end if;
  insert into kp_users(email, pass, name) values (em, crypt(pw, gen_salt('bf', 10)), nm) returning id into uid;
  c := 'HELLO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into kp_codes(code, kind, percent, user_id, uses_left, expires_at, note)
    values (c, 'coupon', 5, uid, 1, now() + interval '90 days', 'Приветственная скидка 5%');
  return jsonb_build_object('token', kp_new_session(uid), 'name', nm);
end $$;

create or replace function public.kp_login(em text, pw text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u kp_users;
begin
  em := lower(btrim(coalesce(em, '')));
  select * into u from kp_users where email = em;
  if not found then perform crypt(coalesce(pw, ''), gen_salt('bf', 10)); return jsonb_build_object('error', 'bad_login'); end if;
  -- ошибки возвращаются значением, а не исключением: иначе откат транзакции сбросил бы счётчик неудачных попыток
  if u.locked_until is not null and u.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  if pw is null or crypt(pw, u.pass) <> u.pass then
    update kp_users set locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' else locked_until end,
      fails = case when fails + 1 >= 5 then 0 else fails + 1 end where id = u.id;
    return jsonb_build_object('error', 'bad_login');
  end if;
  update kp_users set fails = 0, locked_until = null where id = u.id;
  return jsonb_build_object('token', kp_new_session(u.id), 'name', u.name);
end $$;

create or replace function public.kp_logout(tok text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from kp_sessions where tok is not null and token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kp_me(tok text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok); u kp_users; done int; lv jsonb;
begin
  if uid is null then return null; end if;
  select * into u from kp_users where id = uid;
  select count(*) into done from kp_orders where user_id = uid and status = 'done';
  lv := kp_level(done);
  return jsonb_build_object('name', u.name, 'email', u.email, 'phone', u.phone, 'done', done, 'level', lv,
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'percent', percent, 'balance', balance,
        'amount', amount, 'until', expires_at, 'note', note) order by created_at desc)
      from kp_codes where user_id = uid and (expires_at is null or expires_at > now())
        and ((kind = 'coupon' and (uses_left is null or uses_left > 0)) or (kind = 'certificate' and balance > 0))), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('num', num, 'ts', created_at, 'final', final, 'status', status) order by created_at desc)
      from (select * from kp_orders where user_id = uid order by created_at desc limit 10) o), '[]'::jsonb));
end $$;

create or replace function public.kp_profile_save(tok text, nm text, ph text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok);
begin
  if uid is null then raise exception 'auth'; end if;
  nm := btrim(coalesce(nm, '')); ph := left(btrim(coalesce(ph, '')), 30);
  if char_length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
  update kp_users set name = nm, phone = nullif(ph, '') where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- Привязать сертификат или личный купон к своему кабинету.
create or replace function public.kp_code_add(tok text, cd text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok); r kp_codes;
begin
  if uid is null then raise exception 'auth'; end if;
  cd := upper(btrim(coalesce(cd, '')));
  select * into r from kp_codes where code = cd for update;
  if not found or char_length(cd) < 5 then raise exception 'not_found'; end if;
  if r.user_id is not null and r.user_id <> uid then raise exception 'not_yours'; end if;
  if r.user_id is null and r.kind = 'coupon' then raise exception 'public_code'; end if;
  update kp_codes set user_id = uid where code = cd;
  return jsonb_build_object('ok', true, 'kind', r.kind);
end $$;

-- Проверка кода в корзине: что он даёт.
create or replace function public.kp_code_check(tok text, cd text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok); r kp_codes;
begin
  cd := upper(btrim(coalesce(cd, '')));
  select * into r from kp_codes where code = cd;
  if not found then raise exception 'not_found'; end if;
  if r.expires_at is not null and r.expires_at < now() then raise exception 'expired'; end if;
  if r.user_id is not null and r.user_id is distinct from uid then raise exception 'not_yours'; end if;
  if r.kind = 'coupon' and r.uses_left is not null and r.uses_left <= 0 then raise exception 'used'; end if;
  if r.kind = 'certificate' and coalesce(r.balance, 0) <= 0 then raise exception 'used'; end if;
  return jsonb_build_object('ok', true, 'kind', r.kind, 'percent', r.percent, 'balance', r.balance);
end $$;

-- Оформить заказ. Сумма считается на сервере по позициям. Скидка: большая из «лояльности» и купона (не суммируются), затем сертификат.
create or replace function public.kp_order_create(tok text, nm text, ph text, em text, ad text, cm text, items jsonb, cd text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := kp_uid(tok); it jsonb; tot int := 0; q int; p int; loy int := 0; cp int := 0; disc int; cert int := 0; fin int;
  r kp_codes; done int; num_ bigint; codeused text;
begin
  nm := btrim(coalesce(nm, '')); ph := btrim(coalesce(ph, '')); em := nullif(btrim(coalesce(em, '')), '');
  ad := left(nullif(btrim(coalesce(ad, '')), ''), 200); cm := left(nullif(btrim(coalesce(cm, '')), ''), 1000);
  if char_length(nm) not between 1 and 60 then raise exception 'bad_name'; end if;
  if char_length(regexp_replace(ph, '\D', '', 'g')) < 10 or char_length(ph) > 30 then raise exception 'bad_phone'; end if;
  if em is not null and (em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 120) then raise exception 'bad_email'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'bad_items'; end if;
  for it in select * from jsonb_array_elements(items) loop
    if jsonb_typeof(it) <> 'object' or jsonb_typeof(it->'t') <> 'string' or char_length(it->>'t') > 200
       or (it->>'q') !~ '^\d{1,2}$' or (it->>'p') !~ '^\d{1,7}$' then raise exception 'bad_items'; end if;
    q := (it->>'q')::int; p := (it->>'p')::int;
    if q < 1 then raise exception 'bad_items'; end if;
    tot := tot + q * p;
  end loop;
  if tot <= 0 or tot > 5000000 then raise exception 'bad_items'; end if;
  if (select count(*) from kp_orders where created_at > now() - interval '1 hour') >= 60 then raise exception 'limit'; end if;
  if uid is not null then
    select count(*) into done from kp_orders where user_id = uid and status = 'done';
    loy := (kp_level(done)->>'percent')::int;
  end if;
  cd := upper(btrim(coalesce(cd, '')));
  if cd <> '' then
    select * into r from kp_codes where code = cd for update;
    if not found then raise exception 'not_found'; end if;
    if r.expires_at is not null and r.expires_at < now() then raise exception 'expired'; end if;
    if r.user_id is not null and r.user_id is distinct from uid then raise exception 'not_yours'; end if;
    if r.kind = 'coupon' then
      if r.uses_left is not null and r.uses_left <= 0 then raise exception 'used'; end if;
      cp := r.percent;
    else
      if coalesce(r.balance, 0) <= 0 then raise exception 'used'; end if;
    end if;
  end if;
  disc := (tot * greatest(loy, cp)) / 100;
  fin := tot - disc;
  if cd <> '' then
    if r.kind = 'certificate' then
      cert := least(r.balance, fin); fin := fin - cert;
      update kp_codes set balance = balance - cert, user_id = coalesce(user_id, uid) where code = cd;
    elsif cp > 0 then
      if r.uses_left is not null then update kp_codes set uses_left = uses_left - 1 where code = cd; end if;
    end if;
    codeused := cd;
  end if;
  insert into kp_orders(user_id, name, phone, email, address, comment, items, total, discount, cert, final, code)
    values (uid, nm, ph, em, ad, cm, items, tot, disc, cert, fin, codeused) returning num into num_;
  return jsonb_build_object('num', num_, 'total', tot, 'discount', disc, 'cert', cert, 'final', fin);
end $$;

-- Только для владельца (из SQL Editor): выпуск кодов.
create or replace function public.kp_mint_certificate(amt int) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text := 'KP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
begin
  if amt is null or amt < 100 then raise exception 'bad_amount'; end if;
  insert into kp_codes(code, kind, amount, balance, expires_at, note) values (c, 'certificate', amt, amt, now() + interval '1 year', 'Подарочный сертификат');
  return c;
end $$;
create or replace function public.kp_mint_coupon(cd text, pct int, uses int default null, days int default 30) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  cd := upper(btrim(cd));
  insert into kp_codes(code, kind, percent, uses_left, expires_at, note) values (cd, 'coupon', pct, uses, now() + make_interval(days => days), 'Промокод ' || pct || '%');
  return cd;
end $$;

revoke all on function public.kp_uid(text), public.kp_level(int), public.kp_new_session(uuid), public.kp_register(text, text, text), public.kp_login(text, text),
  public.kp_logout(text), public.kp_me(text), public.kp_profile_save(text, text, text), public.kp_code_add(text, text), public.kp_code_check(text, text),
  public.kp_order_create(text, text, text, text, text, text, jsonb, text), public.kp_mint_certificate(int), public.kp_mint_coupon(text, int, int, int) from public, anon, authenticated;
grant execute on function public.kp_register(text, text, text), public.kp_login(text, text), public.kp_logout(text), public.kp_me(text),
  public.kp_profile_save(text, text, text), public.kp_code_add(text, text), public.kp_code_check(text, text),
  public.kp_order_create(text, text, text, text, text, text, jsonb, text) to anon, authenticated;
