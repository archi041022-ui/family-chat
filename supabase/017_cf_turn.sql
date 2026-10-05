-- v3.8: Cloudflare Realtime TURN — ключ задаёт администратор в приложении, клиентам он не отдаётся
create or replace function public.set_cf_turn(key_id text, token text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if (key_id is null or btrim(key_id) = '') and (token is null or btrim(token) = '') then
    delete from app_config where key in ('cf_turn_id', 'cf_turn_token'); return 'OK';
  end if;
  if btrim(coalesce(key_id, '')) !~ '^[A-Za-z0-9_-]{16,80}$' then return 'BAD_ID'; end if;
  if btrim(coalesce(token, '')) !~ '^[A-Za-z0-9_.-]{20,255}$' then return 'BAD_TOKEN'; end if;
  insert into app_config (key, value) values ('cf_turn_id', btrim(key_id)) on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('cf_turn_token', btrim(token)) on conflict (key) do update set value = excluded.value;
  return 'OK';
end $$;
create or replace function public.cf_turn_status() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from app_config where key = 'cf_turn_id') and exists (select 1 from app_config where key = 'cf_turn_token')
$$;
revoke all on function public.set_cf_turn(text, text), public.cf_turn_status() from public, anon;
grant execute on function public.set_cf_turn(text, text), public.cf_turn_status() to authenticated;
