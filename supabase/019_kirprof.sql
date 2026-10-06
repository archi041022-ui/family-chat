-- Отзывы для сайта КИРПРОФ (открытый сайт, вход не нужен).
-- Таблица закрыта: напрямую к ней обращаться нельзя, только через функции ниже.
-- Автор отзыва определяется секретным кодом, который хранится в браузере клиента (в базе лежит только его хэш).
create table if not exists public.kp_reviews (
  id uuid primary key default gen_random_uuid(),
  author_hash text not null unique,
  name text not null check (char_length(name) between 1 and 40),
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 600),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kp_reviews enable row level security;
revoke all on public.kp_reviews from anon, authenticated;

create or replace function public.kp_hash(tok text) returns text
language sql immutable as $$ select encode(sha256(convert_to(tok, 'utf8')), 'hex') $$;

-- Список: средняя оценка и последние 60 отзывов (без фото, только их число). mine = отзыв этого браузера.
create or replace function public.kp_reviews_list(tok text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h text := case when tok is not null and char_length(tok) between 16 and 100 then kp_hash(tok) end;
begin
  return jsonb_build_object(
    'n', (select count(*) from kp_reviews),
    'avg', (select coalesce(round(avg(rating)::numeric, 2), 0) from kp_reviews),
    'items', coalesce((select jsonb_agg(x order by (x->>'ts')::timestamptz desc) from (
      select jsonb_build_object('id', id, 'name', name, 'rating', rating, 'text', body,
        'pc', jsonb_array_length(photos), 'ts', created_at, 'mine', (h is not null and author_hash = h)) x
      from kp_reviews order by created_at desc limit 60) t), '[]'::jsonb));
end $$;

-- Фото одного отзыва (запрашиваются по мере показа).
create or replace function public.kp_review_photos(rid uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select photos from kp_reviews where id = rid), '[]'::jsonb)
$$;

-- Мой отзыв целиком (для редактирования).
create or replace function public.kp_review_mine(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r kp_reviews;
begin
  if tok is null or char_length(tok) not between 16 and 100 then return null; end if;
  select * into r from kp_reviews where author_hash = kp_hash(tok);
  if not found then return null; end if;
  return jsonb_build_object('name', r.name, 'rating', r.rating, 'text', r.body, 'photos', r.photos);
end $$;

-- Создать или изменить свой отзыв. Не больше 40 новых отзывов в час на весь сайт (защита от спама).
create or replace function public.kp_review_save(tok text, nm text, rt int, tx text, ph jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public as $$
declare h text; p jsonb; total int := 0; s text;
begin
  if tok is null or char_length(tok) not between 16 and 100 then raise exception 'bad_token'; end if;
  nm := btrim(coalesce(nm, '')); tx := btrim(coalesce(tx, ''));
  if char_length(nm) not between 1 and 40 then raise exception 'bad_name'; end if;
  if rt is null or rt not between 1 and 5 then raise exception 'bad_rating'; end if;
  if char_length(tx) not between 10 and 600 then raise exception 'bad_text'; end if;
  ph := coalesce(ph, '[]'::jsonb);
  if jsonb_typeof(ph) <> 'array' or jsonb_array_length(ph) > 3 then raise exception 'bad_photos'; end if;
  for p in select * from jsonb_array_elements(ph) loop
    if jsonb_typeof(p) <> 'string' then raise exception 'bad_photos'; end if;
    s := p #>> '{}';
    if char_length(s) > 120000 or left(s, 23) <> 'data:image/jpeg;base64,' or substr(s, 24) !~ '^[A-Za-z0-9+/=]+$' then raise exception 'bad_photos'; end if;
    total := total + char_length(s);
  end loop;
  if total > 300000 then raise exception 'bad_photos'; end if;
  h := kp_hash(tok);
  if exists (select 1 from kp_reviews where author_hash = h) then
    update kp_reviews set name = nm, rating = rt, body = tx, photos = ph, updated_at = now() where author_hash = h;
  else
    if (select count(*) from kp_reviews where created_at > now() - interval '1 hour') >= 40 then raise exception 'limit'; end if;
    insert into kp_reviews(author_hash, name, rating, body, photos) values (h, nm, rt, tx, ph);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kp_review_delete(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if tok is null or char_length(tok) not between 16 and 100 then raise exception 'bad_token'; end if;
  delete from kp_reviews where author_hash = kp_hash(tok);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.kp_hash(text) from public, anon, authenticated;
revoke all on function public.kp_reviews_list(text), public.kp_review_photos(uuid), public.kp_review_mine(text),
  public.kp_review_save(text, text, int, text, jsonb), public.kp_review_delete(text) from public;
grant execute on function public.kp_reviews_list(text), public.kp_review_photos(uuid), public.kp_review_mine(text),
  public.kp_review_save(text, text, int, text, jsonb), public.kp_review_delete(text) to anon, authenticated;
