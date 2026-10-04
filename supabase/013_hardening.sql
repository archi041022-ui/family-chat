-- 013: закрытие дыр, найденных при проверке (v3.3)

-- 1. Участник не может «перепрыгнуть» в чужой чат, меняя chat_id/user_id в своей записи
create or replace function public.members_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.chat_id is distinct from old.chat_id or new.user_id is distinct from old.user_id then
    raise exception 'IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists members_immutable on public.chat_members;
create trigger members_immutable before update on public.chat_members for each row execute function public.members_immutable();

-- 2. Сообщение нельзя «переселить» в другой чат / подменить автора / время
create or replace function public.messages_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.chat_id is distinct from old.chat_id or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists messages_immutable on public.messages;
create trigger messages_immutable before update on public.messages for each row execute function public.messages_immutable();

-- 3. Модерировать личные переписки нельзя: владелец — только создатель группы/канала (или админ семьи)
create or replace function public.chat_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats where id = cid and is_group and created_by = auth.uid()) or public.is_admin();
$$;

-- 4. Наследник группы — самый давний участник (а не тот, кто сам себе выставил last_read_at)
alter table public.chat_members add column if not exists joined_at timestamptz;
update public.chat_members set joined_at = coalesce(last_read_at, now()) where joined_at is null;
alter table public.chat_members alter column joined_at set default now();
create or replace function public.group_leave(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); heir uuid;
begin
  if cid = '00000000-0000-0000-0000-000000000001'::uuid then return 'FAMILY'; end if;
  if not exists (select 1 from chats where id = cid and is_group) then return 'NOT_GROUP'; end if;
  delete from chat_members where chat_id = cid and user_id = me;
  if exists (select 1 from chats where id = cid and created_by = me) then
    select user_id into heir from chat_members where chat_id = cid order by joined_at nulls last limit 1;
    if heir is null then delete from chats where id = cid; else update chats set created_by = heir where id = cid; end if;
  end if;
  return 'OK';
end $$;

-- 5. Кодовое слово: блокировка строки (нет перебора параллельными запросами), «нет слова» = «неверно»
create or replace function public.reset_password_with_word(login_email text, word text, new_password text) returns text
language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid; rec account_recovery%rowtype; w text := lower(trim(coalesce(word, '')));
begin
  if char_length(coalesce(new_password, '')) < 6 then return 'PASSWORD_TOO_SHORT'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(login_email));
  if uid is null then perform pg_sleep(0.5); return 'WRONG'; end if;
  select * into rec from account_recovery where user_id = uid for update;
  if rec.user_id is null or rec.secret_hash is null then perform pg_sleep(0.5); return 'WRONG'; end if;
  if rec.locked_until is not null and rec.locked_until > now() then return 'LOCKED'; end if;
  if rec.secret_hash <> crypt(w, rec.secret_hash) then
    update account_recovery
      set attempts = rec.attempts + 1,
          locked_until = case when rec.attempts + 1 >= 5 then now() + interval '1 hour' else null end
      where user_id = uid;
    perform pg_sleep(0.5);
    return 'WRONG';
  end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = uid;
  update account_recovery set attempts = 0, locked_until = null where user_id = uid;
  delete from auth.sessions where user_id = uid;
  return 'OK';
end $$;

-- 6. Ежедневный бонус — атомарно (нельзя забрать дважды параллельными запросами)
create or replace function public.claim_bonus() returns int
language plpgsql security definer set search_path = public as $$
declare b int;
begin
  if auth.uid() is null then return null; end if;
  perform wallet_get();
  update star_wallets set balance = balance + 20, bonus_day = current_date
    where user_id = auth.uid() and bonus_day is distinct from current_date returning balance into b;
  if not found then return -1; end if;
  return b;
end $$;

-- 7. Оповещение о звонке уважает чёрный список и правила «Кто может звонить»
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
      and public.pv_allowed(t, auth.uid(), 'calls')
      and not exists (select 1 from notices n where n.user_id = t and n.kind = 'call' and n.actor = auth.uid() and n.created_at > now() - interval '10 seconds');
  return 'OK';
end $$;

-- 8. Задачи: менять исполнителя и чат может только автор
create or replace function public.tasks_guard() returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id; new.created_at := old.created_at;
  if old.owner_id is distinct from auth.uid() then
    new.assignee_id := old.assignee_id; new.chat_id := old.chat_id;
  end if;
  if new.done and not old.done then new.done_at := now(); elsif not new.done then new.done_at := null; end if;
  return new;
end $$;

-- 9. Отметка просмотра истории — менять можно только эмодзи
create or replace function public.story_views_guard() returns trigger language plpgsql as $$
begin
  new.story_id := old.story_id; new.viewer_id := old.viewer_id;
  return new;
end $$;
drop trigger if exists story_views_guard on public.story_views;
create trigger story_views_guard before update on public.story_views for each row execute function public.story_views_guard();

select (select count(*) from pg_trigger where tgname in ('members_immutable','messages_immutable','story_views_guard')) || ' trg | '
  || (select count(*) from information_schema.columns where table_name = 'chat_members' and column_name = 'joined_at') || ' col' as check_result;
