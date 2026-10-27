-- КИРПРОФ: кабинет мастера (статистика, заявки, отзывы, клиенты, материалы, настройки, коды).
-- Supabase → SQL Editor → вставить → Run. Можно запускать повторно. Нужна миграция 023 (вход разработчика).
-- Доступ: учётная запись разработчика (вход по секретному коду) и клиенты, которым владелец дал права:
--   update kp_users set is_admin = true where email = 'master@mail.ru';
-- Все функции проверяют права на сервере по сессии; без прав возвращают ошибку forbidden.
create extension if not exists pgcrypto with schema extensions;

alter table public.kp_users add column if not exists is_admin boolean not null default false;

-- ── материалы мастерской ──
create table if not exists public.kp_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'rog' check (kind in ('rog','vel','chen','jac','eco','lea','other')),
  color text not null default '#808080' check (color ~ '^#[0-9a-fA-F]{6}$'),
  article text,
  price int check (price between 0 and 1000000),
  stock text,
  note text check (char_length(note) <= 400),
  photo text check (char_length(photo) <= 220000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.kp_settings (
  key text primary key check (char_length(key) <= 40),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.kp_materials enable row level security;
alter table public.kp_settings enable row level security;
revoke all on public.kp_materials, public.kp_settings from anon, authenticated;

create or replace function public.kp_is_admin(tok text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select is_dev or is_admin from kp_users where id = kp_uid(tok)), false)
$$;
create or replace function public.kp_admin_check(tok text) returns boolean
language sql stable security definer set search_path = public, extensions as $$ select kp_is_admin(tok) $$;

-- ── открытые данные для сайта ──
create or replace function public.kp_materials_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'color', color, 'article', article, 'price', price,
    'stock', stock, 'note', note, 'photo', photo) order by created_at desc), '[]'::jsonb) from kp_materials where active
$$;
create or replace function public.kp_settings_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from kp_settings
$$;

-- ── статистика ──
create or replace function public.kp_adm_stats(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from kp_users where not is_dev),
    'users7', (select count(*) from kp_users where not is_dev and created_at > now() - interval '7 days'),
    'orders', (select count(*) from kp_orders),
    'o_new', (select count(*) from kp_orders where status = 'new'),
    'o_work', (select count(*) from kp_orders where status = 'work'),
    'o_done', (select count(*) from kp_orders where status = 'done'),
    'o_cancel', (select count(*) from kp_orders where status = 'cancel'),
    'revenue', (select coalesce(sum(final), 0) from kp_orders where status = 'done'),
    'pipeline', (select coalesce(sum(final), 0) from kp_orders where status in ('new', 'work')),
    'reviews', (select count(*) from kp_reviews),
    'avg', (select coalesce(round(avg(rating)::numeric, 2), 0) from kp_reviews),
    'coupons', (select count(*) from kp_codes where kind = 'coupon' and (expires_at is null or expires_at > now()) and (uses_left is null or uses_left > 0)),
    'cert_balance', (select coalesce(sum(balance), 0) from kp_codes where kind = 'certificate' and (expires_at is null or expires_at > now())),
    'materials', (select count(*) from kp_materials where active),
    'days', (select jsonb_agg(jsonb_build_object('d', to_char(g, 'DD.MM'), 'n', coalesce(x.c, 0)) order by g)
             from generate_series(current_date - 13, current_date, interval '1 day') g
             left join (select created_at::date dd, count(*) c from kp_orders where created_at >= current_date - 13 group by 1) x on x.dd = g::date));
end $$;

-- ── заявки ──
create or replace function public.kp_adm_orders(tok text, st text default null, lim int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('num', num, 'ts', created_at, 'name', name, 'phone', phone, 'email', email, 'address', address,
      'comment', comment, 'items', items, 'total', total, 'discount', discount, 'cert', cert, 'final', final, 'code', code, 'status', status) order by created_at desc)
    from (select * from kp_orders where st is null or status = st order by created_at desc limit least(greatest(coalesce(lim, 100), 1), 1000)) o), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_order_status(tok text, n bigint, st text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  if st not in ('new', 'work', 'done', 'cancel') then raise exception 'bad_status'; end if;
  update kp_orders set status = st where num = n;
  return jsonb_build_object('ok', true);
end $$;

-- ── отзывы (модерация) ──
create or replace function public.kp_adm_reviews(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'rating', rating, 'text', body, 'pc', jsonb_array_length(photos), 'ts', created_at) order by created_at desc)
    from (select * from kp_reviews order by created_at desc limit 200) r), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_review_delete(tok text, rid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  delete from kp_reviews where id = rid;
  return jsonb_build_object('ok', true);
end $$;

-- ── клиенты ──
create or replace function public.kp_adm_users(tok text, q text default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', name, 'phone', phone, 'ts', created_at, 'admin', is_admin,
      'orders', (select count(*) from kp_orders o where o.user_id = u.id), 'done', (select count(*) from kp_orders o where o.user_id = u.id and o.status = 'done')) order by created_at desc)
    from (select * from kp_users where not is_dev and (q is null or q = '' or email ilike '%' || q || '%' or name ilike '%' || q || '%' or phone ilike '%' || q || '%')
          order by created_at desc limit 200) u), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_user_password(tok text, em text, pw text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  if pw is null or char_length(pw) < 8 or char_length(pw) > 72 then raise exception 'bad_password'; end if;
  update kp_users set pass = crypt(pw, gen_salt('bf', 10)), fails = 0, locked_until = null where email = lower(btrim(em)) and not is_dev;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('error', 'not_found'); end if;
  delete from kp_sessions where user_id = (select id from kp_users where email = lower(btrim(em)));
  return jsonb_build_object('ok', true);
end $$;

-- ── материалы ──
create or replace function public.kp_adm_materials(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'color', color, 'article', article, 'price', price,
    'stock', stock, 'note', note, 'photo', photo, 'active', active) order by created_at desc) from kp_materials), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_material_save(tok text, m jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare mid uuid := nullif(m->>'id', '')::uuid; nid uuid;
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  if mid is null then
    insert into kp_materials (name, kind, color, article, price, stock, note, photo, active)
      values (btrim(m->>'name'), coalesce(nullif(m->>'kind', ''), 'rog'), coalesce(nullif(m->>'color', ''), '#808080'), nullif(btrim(m->>'article'), ''),
        nullif(m->>'price', '')::int, nullif(btrim(m->>'stock'), ''), nullif(btrim(m->>'note'), ''), nullif(m->>'photo', ''), coalesce((m->>'active')::boolean, true))
      returning id into nid;
  else
    update kp_materials set name = btrim(m->>'name'), kind = coalesce(nullif(m->>'kind', ''), kind), color = coalesce(nullif(m->>'color', ''), color),
      article = nullif(btrim(m->>'article'), ''), price = nullif(m->>'price', '')::int, stock = nullif(btrim(m->>'stock'), ''), note = nullif(btrim(m->>'note'), ''),
      photo = case when m ? 'photo' then nullif(m->>'photo', '') else photo end, active = coalesce((m->>'active')::boolean, active)
      where id = mid;
    nid := mid;
  end if;
  return jsonb_build_object('id', nid);
end $$;
create or replace function public.kp_adm_material_delete(tok text, mid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  delete from kp_materials where id = mid;
  return jsonb_build_object('ok', true);
end $$;

-- ── информация о мастерской ──
create or replace function public.kp_adm_setting_set(tok text, k text, v jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  if k not in ('shop', 'banner', 'about') then raise exception 'bad_key'; end if;
  if char_length(v::text) > 4000 then raise exception 'too_big'; end if;
  insert into kp_settings (key, value, updated_at) values (k, v, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ── коды: выпуск и список ──
create or replace function public.kp_adm_mint(tok text, kind text, val int, cd text default null, uses int default null, days int default 30) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  if kind = 'certificate' then c := kp_mint_certificate(val);
  elsif kind = 'coupon' then
    if cd is null or char_length(btrim(cd)) < 3 or val not between 1 and 90 then raise exception 'bad_coupon'; end if;
    c := kp_mint_coupon(cd, val, uses, days);
  else raise exception 'bad_kind'; end if;
  return jsonb_build_object('code', c);
end $$;
create or replace function public.kp_adm_codes(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_admin(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'percent', percent, 'balance', balance, 'amount', amount,
    'uses', uses_left, 'until', expires_at, 'personal', user_id is not null) order by created_at desc)
    from (select * from kp_codes where user_id is null order by created_at desc limit 100) c), '[]'::jsonb);
end $$;

revoke all on function public.kp_is_admin(text), public.kp_admin_check(text), public.kp_materials_list(), public.kp_settings_get(), public.kp_adm_stats(text),
  public.kp_adm_orders(text, text, int), public.kp_adm_order_status(text, bigint, text), public.kp_adm_reviews(text), public.kp_adm_review_delete(text, uuid),
  public.kp_adm_users(text, text), public.kp_adm_user_password(text, text, text), public.kp_adm_materials(text), public.kp_adm_material_save(text, jsonb),
  public.kp_adm_material_delete(text, uuid), public.kp_adm_setting_set(text, text, jsonb), public.kp_adm_mint(text, text, int, text, int, int), public.kp_adm_codes(text)
  from public, anon, authenticated;
grant execute on function public.kp_admin_check(text), public.kp_materials_list(), public.kp_settings_get(), public.kp_adm_stats(text),
  public.kp_adm_orders(text, text, int), public.kp_adm_order_status(text, bigint, text), public.kp_adm_reviews(text), public.kp_adm_review_delete(text, uuid),
  public.kp_adm_users(text, text), public.kp_adm_user_password(text, text, text), public.kp_adm_materials(text), public.kp_adm_material_save(text, jsonb),
  public.kp_adm_material_delete(text, uuid), public.kp_adm_setting_set(text, text, jsonb), public.kp_adm_mint(text, text, int, text, int, int), public.kp_adm_codes(text)
  to anon, authenticated;
