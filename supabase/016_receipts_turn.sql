-- v3.6: отметки о прочтении без сбоев + свой сервер звонков (TURN)

-- 1. Время прочтения ставит сервер (часы телефона могли отставать — галочки «✓✓» не появлялись)
create or replace function public.chat_members_read_time() returns trigger
language plpgsql as $$
begin
  if new.last_read_at is distinct from old.last_read_at then new.last_read_at := now(); end if;
  return new;
end $$;
drop trigger if exists chat_members_read_time on public.chat_members;
create trigger chat_members_read_time before update of last_read_at on public.chat_members
  for each row execute function public.chat_members_read_time();

-- 2. Отметки прочтения приходят сразу (без зависимости от «вещания»)
do $$ begin alter publication supabase_realtime add table public.chat_members; exception when others then null; end $$;

-- 3. Сервер звонков: задаёт администратор, получают все участники семьи
create or replace function public.set_turn(cfg jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare u text; n text; c text;
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if cfg is null or cfg = 'null'::jsonb then delete from app_config where key = 'turn'; return 'OK'; end if;
  u := btrim(coalesce(cfg->>'url', '')); n := btrim(coalesce(cfg->>'username', '')); c := btrim(coalesce(cfg->>'credential', ''));
  if u !~* '^(turns?|stuns?):[A-Za-z0-9.\-]+(:[0-9]{2,5})?(\?transport=(udp|tcp))?$' then return 'BAD_URL'; end if;
  if char_length(n) > 200 or char_length(c) > 400 then return 'BAD'; end if;
  insert into app_config (key, value) values ('turn', jsonb_build_object('url', u, 'username', n, 'credential', c)::text)
    on conflict (key) do update set value = excluded.value;
  return 'OK';
end $$;

create or replace function public.get_turn() returns jsonb
language sql stable security definer set search_path = public as $$
  select value::jsonb from app_config where key = 'turn' and auth.uid() is not null
$$;
create or replace function public.turn_status() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from app_config where key = 'turn')
$$;
revoke all on function public.set_turn(jsonb), public.get_turn(), public.turn_status() from public, anon;
grant execute on function public.set_turn(jsonb), public.get_turn(), public.turn_status() to authenticated;
