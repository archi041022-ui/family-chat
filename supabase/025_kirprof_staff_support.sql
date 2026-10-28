-- КИРПРОФ: каталог (изделия, интерьер, инструменты), сотрудники с правами, чат с оператором, обратный звонок.
-- Supabase → SQL Editor → вставить → Run. Можно запускать повторно. Нужны миграции 020–024.
-- ВАЖНО: если когда-нибудь заново запустите 024, после неё запустите 025 ещё раз (она заменяет проверку прав).
create extension if not exists pgcrypto with schema extensions;

-- ── права сотрудников ──
-- Права: orders (заявки), reviews (отзывы), users (клиенты), catalog (материалы/изделия/интерьер/инструменты),
--        support (чат и обратные звонки), info (информация о мастерской), codes (промокоды и сертификаты).
-- Владелец (разработчик или is_admin) может всё и выдаёт права в кабинете: раздел «Сотрудники».
alter table public.kp_users add column if not exists perms text[] not null default '{}';

create or replace function public.kp_can(tok text, p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select is_dev or is_admin or (p = '*' and cardinality(perms) > 0) or p = any(perms) from kp_users where id = kp_uid(tok)), false)
$$;
create or replace function public.kp_is_owner(tok text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select is_dev or is_admin from kp_users where id = kp_uid(tok)), false)
$$;
-- что доступно этому входу: false или {owner, perms, name}
drop function if exists public.kp_admin_check(text);
create function public.kp_admin_check(tok text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when u.id is null or not (u.is_dev or u.is_admin or cardinality(u.perms) > 0) then 'false'::jsonb
    else jsonb_build_object('owner', u.is_dev or u.is_admin, 'dev', u.is_dev, 'perms', to_jsonb(u.perms), 'name', u.name) end
  from (select 1) x left join kp_users u on u.id = kp_uid(tok)
$$;

-- старые функции кабинета: заменяем общую проверку на конкретное право
do $$
declare m record; def text;
begin
  for m in select * from (values
    ('kp_adm_stats', '*'), ('kp_adm_orders', 'orders'), ('kp_adm_order_status', 'orders'),
    ('kp_adm_reviews', 'reviews'), ('kp_adm_review_delete', 'reviews'),
    ('kp_adm_users', 'users'), ('kp_adm_user_password', 'users'),
    ('kp_adm_materials', 'catalog'), ('kp_adm_material_save', 'catalog'), ('kp_adm_material_delete', 'catalog'),
    ('kp_adm_setting_set', 'info'), ('kp_adm_mint', 'codes'), ('kp_adm_codes', 'codes')
  ) v(fn, perm) loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = m.fn limit 1;
    if def is null then raise exception 'нет функции % (нужна миграция 024)', m.fn; end if;
    def := replace(def, 'kp_is_admin(tok)', 'kp_can(tok, ' || quote_literal(m.perm) || ')');
    execute def;
  end loop;
end $$;

-- ── изделия, интерьер, инструменты ──
create table if not exists public.kp_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('product', 'interior', 'tool')),
  title text not null check (char_length(title) between 1 and 80),
  descr text check (char_length(descr) <= 600),
  price int check (price between 0 and 10000000),
  photo text check (char_length(photo) <= 260000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.kp_items enable row level security;
revoke all on public.kp_items from anon, authenticated;

create or replace function public.kp_items_list(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'descr', descr, 'price', price, 'photo', photo) order by created_at desc), '[]'::jsonb)
  from kp_items where active and kind = k
$$;
create or replace function public.kp_adm_items(tok text, k text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'catalog') then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'descr', descr, 'price', price, 'photo', photo, 'active', active) order by created_at desc)
    from kp_items where kind = k), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_item_save(tok text, k text, m jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare iid uuid := nullif(m->>'id', '')::uuid; nid uuid;
begin
  if not kp_can(tok, 'catalog') then raise exception 'forbidden'; end if;
  if k not in ('product', 'interior', 'tool') then raise exception 'bad_kind'; end if;
  if iid is null then
    insert into kp_items (kind, title, descr, price, photo, active)
      values (k, btrim(m->>'title'), nullif(btrim(m->>'descr'), ''), nullif(m->>'price', '')::int, nullif(m->>'photo', ''), coalesce((m->>'active')::boolean, true)) returning id into nid;
  else
    update kp_items set title = btrim(m->>'title'), descr = nullif(btrim(m->>'descr'), ''), price = nullif(m->>'price', '')::int,
      photo = case when m ? 'photo' then nullif(m->>'photo', '') else photo end, active = coalesce((m->>'active')::boolean, active)
      where id = iid and kind = k;
    nid := iid;
  end if;
  return jsonb_build_object('id', nid);
end $$;
create or replace function public.kp_adm_item_delete(tok text, iid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'catalog') then raise exception 'forbidden'; end if;
  delete from kp_items where id = iid;
  return jsonb_build_object('ok', true);
end $$;

-- ── сотрудники ──
create or replace function public.kp_adm_staff(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_is_owner(tok) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', name, 'perms', to_jsonb(perms), 'owner', is_admin, 'dev', is_dev) order by is_dev desc, is_admin desc, name)
    from kp_users where is_dev or is_admin or cardinality(perms) > 0), '[]'::jsonb);
end $$;
-- perms — список прав; own — сделать владельцем (только разработчик); пустой список и own=false — забрать доступ
create or replace function public.kp_adm_staff_set(tok text, em text, pr text[], own boolean default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; bad text[];
begin
  if not kp_is_owner(tok) then raise exception 'forbidden'; end if;
  select id into uid from kp_users where email = lower(btrim(em)) and not is_dev;
  if uid is null then raise exception 'not_found'; end if;
  pr := coalesce(pr, '{}');
  select array_agg(x) into bad from unnest(pr) x where x not in ('orders', 'reviews', 'users', 'catalog', 'support', 'info', 'codes');
  if bad is not null then raise exception 'bad_perm'; end if;
  update kp_users set perms = (select coalesce(array_agg(distinct x), '{}') from unnest(pr) x) where id = uid;
  if own is not null then
    if not coalesce((select is_dev from kp_users where id = kp_uid(tok)), false) then raise exception 'dev_only'; end if;
    update kp_users set is_admin = own where id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── чат с оператором ──
create table if not exists public.kp_chats (
  id uuid primary key default gen_random_uuid(),
  ckey text not null unique check (char_length(ckey) between 16 and 64),
  user_id uuid references public.kp_users(id) on delete set null,
  name text,
  closed boolean not null default false,
  staff_seen bigint not null default 0,
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.kp_chat_msgs (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.kp_chats(id) on delete cascade,
  staff boolean not null default false,
  who text,
  body text not null check (char_length(body) between 1 and 1000),
  ts timestamptz not null default now()
);
create index if not exists kp_chat_msgs_chat on public.kp_chat_msgs (chat_id, id);
alter table public.kp_chats enable row level security;
alter table public.kp_chat_msgs enable row level security;
revoke all on public.kp_chats, public.kp_chat_msgs from anon, authenticated;

-- клиент пишет оператору; ck — случайный ключ, который сайт хранит у себя
create or replace function public.kp_chat_send(ck text, tok text, nm text, tx text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c uuid; uid uuid := kp_uid(tok); t text := btrim(coalesce(tx, ''));
begin
  if ck is null or char_length(ck) not between 16 and 64 then return jsonb_build_object('error', 'bad_key'); end if;
  if char_length(t) not between 1 and 1000 then return jsonb_build_object('error', 'bad_text'); end if;
  select id into c from kp_chats where ckey = ck;
  if c is null then
    if (select count(*) from kp_chats where created_at > now() - interval '1 hour') > 200 then return jsonb_build_object('error', 'busy'); end if;
    insert into kp_chats (ckey, user_id, name) values (ck, uid, left(btrim(coalesce(nm, '')), 40)) returning id into c;
  elsif (select count(*) from kp_chat_msgs where chat_id = c and not staff and ts > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('error', 'too_fast');
  end if;
  update kp_chats set closed = false, last_at = now(), user_id = coalesce(uid, user_id), name = coalesce(nullif(left(btrim(coalesce(nm, '')), 40), ''), name) where id = c;
  insert into kp_chat_msgs (chat_id, staff, body) values (c, false, t);
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.kp_chat_get(ck text, after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare c record;
begin
  select id, closed into c from kp_chats where ckey = ck;
  if c.id is null then return jsonb_build_object('items', '[]'::jsonb, 'closed', false); end if;
  return jsonb_build_object('closed', c.closed, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'staff', staff, 'who', who, 'body', body, 'ts', ts) order by id)
    from (select * from kp_chat_msgs where chat_id = c.id and id > coalesce(after, 0) order by id limit 200) m), '[]'::jsonb));
end $$;

create or replace function public.kp_adm_chats(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), 'Гость'), 'closed', c.closed, 'ts', c.last_at,
      'last', (select left(body, 80) from kp_chat_msgs where chat_id = c.id order by id desc limit 1),
      'unread', (select count(*) from kp_chat_msgs where chat_id = c.id and not staff and id > c.staff_seen)) order by c.last_at desc)
    from (select * from kp_chats order by last_at desc limit 100) c), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_chat_get(tok text, cid uuid, after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare mx bigint;
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  select coalesce(max(id), 0) into mx from kp_chat_msgs where chat_id = cid;
  update kp_chats set staff_seen = greatest(staff_seen, mx) where id = cid;
  return jsonb_build_object('closed', coalesce((select closed from kp_chats where id = cid), false),
    'name', (select coalesce(nullif(name, ''), 'Гость') from kp_chats where id = cid),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'staff', staff, 'who', who, 'body', body, 'ts', ts) order by id)
      from (select * from kp_chat_msgs where chat_id = cid and id > coalesce(after, 0) order by id limit 300) m), '[]'::jsonb));
end $$;
create or replace function public.kp_adm_chat_send(tok text, cid uuid, tx text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t text := btrim(coalesce(tx, '')); nm text;
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  if char_length(t) not between 1 and 1000 then raise exception 'bad_text'; end if;
  select name into nm from kp_users where id = kp_uid(tok);
  insert into kp_chat_msgs (chat_id, staff, who, body) values (cid, true, nm, t);
  update kp_chats set last_at = now(), closed = false, staff_seen = (select max(id) from kp_chat_msgs where chat_id = cid) where id = cid;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.kp_adm_chat_close(tok text, cid uuid, cl boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  update kp_chats set closed = coalesce(cl, true) where id = cid;
  return jsonb_build_object('ok', true);
end $$;

-- ── обратный звонок ──
create table if not exists public.kp_callbacks (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 40),
  phone text not null check (char_length(phone) between 6 and 30),
  pref text check (char_length(pref) <= 40),
  note text check (char_length(note) <= 300),
  user_id uuid references public.kp_users(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
alter table public.kp_callbacks enable row level security;
revoke all on public.kp_callbacks from anon, authenticated;

create or replace function public.kp_callback_create(tok text, nm text, ph text, pf text, nt text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare digits text := regexp_replace(coalesce(ph, ''), '\D', '', 'g');
begin
  if char_length(btrim(coalesce(nm, ''))) not between 1 and 40 then return jsonb_build_object('error', 'bad_name'); end if;
  if char_length(digits) not between 10 and 15 then return jsonb_build_object('error', 'bad_phone'); end if;
  if (select count(*) from kp_callbacks where regexp_replace(phone, '\D', '', 'g') = digits and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from kp_callbacks where created_at > now() - interval '1 hour') > 100 then return jsonb_build_object('error', 'too_fast'); end if;
  insert into kp_callbacks (name, phone, pref, note, user_id) values (btrim(nm), btrim(ph), left(btrim(coalesce(pf, '')), 40), left(btrim(coalesce(nt, '')), 300), kp_uid(tok));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.kp_adm_callbacks(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'pref', pref, 'note', note, 'status', status, 'ts', created_at) order by (status = 'new') desc, created_at desc)
    from (select * from kp_callbacks order by created_at desc limit 200) c), '[]'::jsonb);
end $$;
create or replace function public.kp_adm_callback_status(tok text, cid bigint, st text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'support') then raise exception 'forbidden'; end if;
  if st not in ('new', 'done') then raise exception 'bad_status'; end if;
  update kp_callbacks set status = st where id = cid;
  return jsonb_build_object('ok', true);
end $$;
-- сколько ждёт ответа: для значка в меню
create or replace function public.kp_adm_support_counts(tok text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not kp_can(tok, 'support') then return jsonb_build_object('chats', 0, 'calls', 0); end if;
  return jsonb_build_object(
    'chats', (select count(*) from kp_chats c where exists (select 1 from kp_chat_msgs m where m.chat_id = c.id and not m.staff and m.id > c.staff_seen)),
    'calls', (select count(*) from kp_callbacks where status = 'new'));
end $$;

grant execute on function public.kp_can(text, text), public.kp_is_owner(text), public.kp_admin_check(text),
  public.kp_items_list(text), public.kp_adm_items(text, text), public.kp_adm_item_save(text, text, jsonb), public.kp_adm_item_delete(text, uuid),
  public.kp_adm_staff(text), public.kp_adm_staff_set(text, text, text[], boolean),
  public.kp_chat_send(text, text, text, text), public.kp_chat_get(text, bigint),
  public.kp_adm_chats(text), public.kp_adm_chat_get(text, uuid, bigint), public.kp_adm_chat_send(text, uuid, text), public.kp_adm_chat_close(text, uuid, boolean),
  public.kp_callback_create(text, text, text, text, text), public.kp_adm_callbacks(text), public.kp_adm_callback_status(text, bigint, text), public.kp_adm_support_counts(text)
  to anon, authenticated;
