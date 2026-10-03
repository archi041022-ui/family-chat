-- 011: мгновенные оповещения через Firebase Cloud Messaging (FCM).
-- Google передаёт телефону только короткий сигнал «проснись» — текст сообщений через Google не идёт:
-- проснувшись, телефон сам забирает оповещения с сервера семьи (device_pull из 010).
-- Ключи Firebase загружает администратор в приложении (Настройки → Мгновенные оповещения);
-- закрытый ключ хранится в app_config, к которой у приложений нет доступа.

create extension if not exists pg_net with schema extensions;

alter table public.push_devices add column if not exists fcm_token text;
create index if not exists push_devices_user on public.push_devices (user_id);

insert into public.app_config (key, value) values ('push_hook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;
insert into public.app_config (key, value) values ('push_url', 'https://roqpbkwpuvlavmiscoxs.supabase.co/functions/v1/push')
  on conflict (key) do nothing;
-- открытый ключ anon (он и так есть в приложении) — чтобы сервер мог вызвать функцию push
insert into public.app_config (key, value) values ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcXBia3dwdXZsYXZtaXNjb3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MDI4MjIsImV4cCI6MjEwNjQ3ODgyMn0.Uqpg7hmm7OWuTv1xMYp6Zw80RjI0BG9wPF8Ivav1LAw')
  on conflict (key) do nothing;

-- телефон сообщает свой адрес FCM (по ключу устройства, без входа)
create or replace function public.device_token(key text, token text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if key is null or length(key) < 32 then return 'BAD_KEY'; end if;
  if token is not null and (length(token) < 20 or length(token) > 4096) then return 'BAD_TOKEN'; end if;
  -- один адрес — одно устройство
  if token is not null then
    update push_devices set fcm_token = null where fcm_token = token and key_hash <> encode(sha256(convert_to(key, 'UTF8')), 'hex');
  end if;
  update push_devices set fcm_token = token, seen_at = now() where key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex');
  get diagnostics n = row_count;
  return case when n > 0 then 'OK' else 'NO_DEVICE' end;
end $$;

-- настройки Firebase для приложения (только открытая часть)
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (select value::jsonb from app_config where key = 'fcm_client') end;
$$;

-- администратор загружает ключи Firebase
create or replace function public.set_push_config(client jsonb, service jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if client is null and service is null then
    delete from app_config where key in ('fcm_client', 'fcm_service_account');
    update push_devices set fcm_token = null;
    return 'OFF';
  end if;
  if coalesce(client->>'app_id', '') = '' or coalesce(client->>'api_key', '') = '' or coalesce(client->>'project_id', '') = ''
     or coalesce(client->>'sender_id', '') = '' then return 'BAD_CLIENT'; end if;
  if coalesce(service->>'type', '') <> 'service_account' or coalesce(service->>'private_key', '') = ''
     or coalesce(service->>'client_email', '') = '' then return 'BAD_SERVICE'; end if;
  if service->>'project_id' <> client->>'project_id' then return 'PROJECT_MISMATCH'; end if;
  insert into app_config (key, value) values ('fcm_client', client::text) on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('fcm_service_account', service::text) on conflict (key) do update set value = excluded.value;
  return 'OK';
end $$;

create or replace function public.push_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'configured', exists (select 1 from app_config where key = 'fcm_service_account'),
    'project', (select value::jsonb->>'project_id' from app_config where key = 'fcm_client'),
    'devices', (select count(*) from push_devices where fcm_token is not null),
    'people', (select count(distinct user_id) from push_devices where fcm_token is not null),
    'mine', (select count(*) from push_devices where fcm_token is not null and user_id = auth.uid()))
  where auth.uid() is not null;
$$;

-- звонок: разбудить телефоны тех, кому звоним (не чаще раза в 10 секунд)
create or replace function public.wake_call(targets uuid[], video boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if auth.uid() is null then return 'NO_AUTH'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then return 'BANNED'; end if;
  who := coalesce((select name from profiles where id = auth.uid()), 'Кто-то');
  insert into notices (user_id, kind, actor, title, body)
    select t, 'call', auth.uid(), who, case when video then 'Входящий видеозвонок' else 'Входящий звонок' end
    from unnest(targets[1:30]) t
    where t <> auth.uid() and exists (select 1 from profiles p where p.id = t and not coalesce(p.banned, false))
      and not exists (select 1 from notices n where n.user_id = t and n.kind = 'call' and n.actor = auth.uid() and n.created_at > now() - interval '10 seconds');
  return 'OK';
end $$;

-- новые оповещения → один вызов функции push на всю пачку
create or replace function public.notices_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare users uuid[]; is_call boolean; url text; anon text; secret text;
begin
  begin
    if not exists (select 1 from app_config where key = 'fcm_service_account') then return null; end if;
    select array_agg(distinct nt.user_id), coalesce(bool_or(nt.kind = 'call'), false) into users, is_call
      from nt where exists (select 1 from push_devices d where d.user_id = nt.user_id and d.fcm_token is not null);
    if users is null then return null; end if;
    select value into url from app_config where key = 'push_url';
    select value into anon from app_config where key = 'anon_key';
    select value into secret from app_config where key = 'push_hook_secret';
    perform net.http_post(
      url := url,
      body := jsonb_build_object('users', to_jsonb(users), 'call', is_call),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon, 'apikey', anon, 'x-push-secret', secret),
      timeout_milliseconds := 8000);
  exception when others then raise warning 'notices_push: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notices_push on public.notices;
create trigger notices_push after insert on public.notices referencing new table as nt
  for each statement execute function public.notices_push();


revoke all on function public.device_token(text, text), public.push_config(), public.set_push_config(jsonb, jsonb),
  public.push_status(), public.wake_call(uuid[], boolean) from public, anon;
grant execute on function public.device_token(text, text) to anon, authenticated;
grant execute on function public.push_config(), public.set_push_config(jsonb, jsonb), public.push_status(),
  public.wake_call(uuid[], boolean) to authenticated;
