-- 018: оповещения для iPhone и браузеров (Web Push).
-- Телефон (или компьютер) один раз подписывается: адрес подписки хранится здесь.
-- Новые оповещения из notices отправляет функция webpush — текст идёт в зашифрованном виде
-- (ключ знает только само устройство), поэтому ни Apple, ни Google его прочитать не могут.

create table if not exists public.web_push_subs (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz not null default now()
);
create index if not exists web_push_subs_user on public.web_push_subs (user_id);
alter table public.web_push_subs enable row level security;   -- напрямую недоступна никому

insert into public.app_config (key, value) values ('webpush_url', 'https://roqpbkwpuvlavmiscoxs.supabase.co/functions/v1/webpush')
  on conflict (key) do nothing;

-- подписаться (адрес принимается только от известных служб push — иначе сервер можно было бы заставить стучаться куда угодно)
create or replace function public.save_web_push(ep text, k text, a text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'NO_AUTH'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then return 'BANNED'; end if;
  if ep is null or length(ep) > 1000 or ep !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^\s]+$'
    then return 'BAD_ENDPOINT'; end if;
  if k is null or k !~ '^[A-Za-z0-9_-]{80,100}$' or a is null or a !~ '^[A-Za-z0-9_-]{16,32}$' then return 'BAD_KEYS'; end if;
  insert into web_push_subs (endpoint, user_id, p256dh, auth_key) values (ep, auth.uid(), k, a)
    on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth_key = excluded.auth_key, seen_at = now();
  -- не больше 10 устройств на человека
  delete from web_push_subs where user_id = auth.uid() and endpoint in
    (select endpoint from web_push_subs where user_id = auth.uid() order by seen_at desc offset 10);
  return 'OK';
end $$;

create or replace function public.drop_web_push(ep text) returns void
language sql security definer set search_path = public as $$
  delete from web_push_subs where endpoint = ep and user_id = auth.uid();
$$;

create or replace function public.web_push_status() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from web_push_subs where user_id = auth.uid();
$$;

-- новые оповещения → функция webpush (только тем, у кого есть подписка)
create or replace function public.notices_webpush() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare items jsonb; url text; anon text; secret text;
begin
  begin
    select jsonb_agg(jsonb_build_object('u', nt.user_id, 't', left(nt.title, 120), 'b', left(coalesce(nt.body, ''), 200), 'k', nt.kind, 'c', nt.chat_id))
      into items
      from (select * from nt where exists (select 1 from web_push_subs s where s.user_id = nt.user_id) limit 200) nt;
    if items is null then return null; end if;
    select value into url from app_config where key = 'webpush_url';
    select value into anon from app_config where key = 'anon_key';
    select value into secret from app_config where key = 'push_hook_secret';
    if url is null or anon is null or secret is null then return null; end if;
    perform net.http_post(
      url := url,
      body := jsonb_build_object('items', items),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon, 'apikey', anon, 'x-push-secret', secret),
      timeout_milliseconds := 8000);
  exception when others then raise warning 'notices_webpush: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_webpush on public.notices;
create trigger notices_webpush after insert on public.notices referencing new table as nt
  for each statement execute function public.notices_webpush();

revoke all on function public.save_web_push(text, text, text), public.drop_web_push(text), public.web_push_status() from public, anon;
grant execute on function public.save_web_push(text, text, text), public.drop_web_push(text), public.web_push_status() to authenticated;
