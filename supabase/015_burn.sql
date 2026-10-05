-- v3.5: исчезающие сообщения — удаление через выбранное время после прочтения
alter table public.chats add column if not exists burn_after integer check (burn_after is null or burn_after between 1 and 2592000);
alter table public.chats add column if not exists burn_since timestamptz;

-- таймер удаления: клиентам не виден (RLS включён, политик нет)
create table if not exists public.message_burn (
  message_id uuid primary key references public.messages on delete cascade,
  due_at     timestamptz not null
);
alter table public.message_burn enable row level security;
create index if not exists message_burn_due on public.message_burn (due_at);

-- когда сообщение прочитано всеми, кроме автора, — запускаем таймер
create or replace function public.burn_on_read() returns trigger
language plpgsql security definer set search_path = public as $$
declare secs integer; since timestamptz;
begin
  select burn_after, burn_since into secs, since from chats where id = new.chat_id;
  if secs is null then return new; end if;
  insert into message_burn (message_id, due_at)
  select m.id, now() + make_interval(secs => secs)
  from messages m
  where m.chat_id = new.chat_id and m.user_id <> new.user_id
    and m.created_at <= new.last_read_at and m.created_at >= coalesce(since, '-infinity')
    and not exists (select 1 from chat_members cm where cm.chat_id = m.chat_id and cm.user_id <> m.user_id and cm.last_read_at < m.created_at)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists burn_on_read on public.chat_members;
create trigger burn_on_read after update of last_read_at on public.chat_members
  for each row when (old.last_read_at is distinct from new.last_read_at) execute function public.burn_on_read();

-- включить / выключить (личный чат — любой из двоих; группа — её создатель или админ)
create or replace function public.set_burn(cid uuid, secs integer) returns text
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  select * into c from chats where id = cid;
  if not found or not public.is_member(cid) then return 'NO_CHAT'; end if;
  if c.is_group and not public.chat_owner(cid) then return 'NOT_OWNER'; end if;
  if secs is not null and (secs < 1 or secs > 2592000) then return 'BAD'; end if;
  update chats set burn_after = secs, burn_since = case when secs is null then null else now() end where id = cid;
  if secs is null then delete from message_burn where message_id in (select id from messages where chat_id = cid); end if;
  return 'OK';
end $$;

-- удалить всё, чей срок вышел (в чатах, где вызывающий — участник)
create or replace function public.burn_sweep() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gone as (
    delete from messages where id in (
      select m.id from message_burn b join messages m on m.id = b.message_id
      where b.due_at <= now() and exists (select 1 from chat_members cm where cm.chat_id = m.chat_id and cm.user_id = auth.uid()))
    returning id)
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.set_burn(uuid, integer), public.burn_sweep() from public, anon;
grant execute on function public.set_burn(uuid, integer), public.burn_sweep() to authenticated;

-- серверный уборщик раз в минуту (если pg_cron доступен); иначе чистят приложения
create or replace function public.burn_sweep_all() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gone as (delete from messages where id in (select message_id from message_burn where due_at <= now()) returning id)
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.burn_sweep_all() from public, anon, authenticated;
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('burn_sweep', '* * * * *', 'select public.burn_sweep_all()');
exception when others then raise notice 'pg_cron недоступен: %', sqlerrm; end $$;
