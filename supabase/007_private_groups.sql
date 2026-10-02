-- 007: приватные группы. Группу видят только её участники (правило "chats read" уже это обеспечивает).
-- Создатель группы может менять название, описание и фото, добавлять и убирать участников, удалить группу.
-- Любой участник может выйти. Общий чат «Семья» покинуть или удалить нельзя.

alter table public.chats add column if not exists description text check (char_length(description) <= 300);
alter table public.chats add column if not exists avatar_path text;

create or replace function public.group_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats where id = cid and is_group and created_by = auth.uid())
      or (public.is_admin() and exists (select 1 from chats where id = cid and is_group and public.is_member(cid)));
$$;

create or replace function public.group_update(cid uuid, new_title text, new_description text, new_avatar text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.group_owner(cid) then return 'NOT_OWNER'; end if;
  if new_avatar is not null and new_avatar <> '' and split_part(new_avatar, '/', 1) <> cid::text then return 'BAD_AVATAR'; end if;
  update chats set
    title = coalesce(nullif(left(trim(new_title), 80), ''), title),
    description = nullif(left(trim(coalesce(new_description, '')), 300), ''),
    avatar_path = case when new_avatar is null then avatar_path when new_avatar = '' then null else new_avatar end
  where id = cid;
  return 'OK';
end $$;

create or replace function public.group_add_members(cid uuid, members uuid[]) returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.group_owner(cid) then return 'NOT_OWNER'; end if;
  foreach m in array members loop
    insert into chat_members (chat_id, user_id)
      select cid, m where exists (select 1 from profiles where id = m and not coalesce(banned, false)) on conflict do nothing;
  end loop;
  return 'OK';
end $$;

create or replace function public.group_remove_member(cid uuid, target uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if cid = '00000000-0000-0000-0000-000000000001'::uuid then return 'FAMILY'; end if;
  if not public.group_owner(cid) then return 'NOT_OWNER'; end if;
  if target = auth.uid() then return 'SELF'; end if;
  delete from chat_members where chat_id = cid and user_id = target;
  return 'OK';
end $$;

create or replace function public.group_leave(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); heir uuid;
begin
  if cid = '00000000-0000-0000-0000-000000000001'::uuid then return 'FAMILY'; end if;
  if not exists (select 1 from chats where id = cid and is_group) then return 'NOT_GROUP'; end if;
  delete from chat_members where chat_id = cid and user_id = me;
  -- уходит создатель — группа переходит к самому давнему участнику; пустая группа удаляется
  if exists (select 1 from chats where id = cid and created_by = me) then
    select user_id into heir from chat_members where chat_id = cid order by last_read_at nulls last limit 1;
    if heir is null then delete from chats where id = cid; else update chats set created_by = heir where id = cid; end if;
  end if;
  return 'OK';
end $$;

create or replace function public.group_delete(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if cid = '00000000-0000-0000-0000-000000000001'::uuid then return 'FAMILY'; end if;
  if not exists (select 1 from chats where id = cid and is_group and created_by = auth.uid()) then return 'NOT_OWNER'; end if;
  delete from chats where id = cid;
  return 'OK';
end $$;

revoke all on function public.group_owner(uuid), public.group_update(uuid, text, text, text), public.group_add_members(uuid, uuid[]),
  public.group_remove_member(uuid, uuid), public.group_leave(uuid), public.group_delete(uuid) from public, anon;
grant execute on function public.group_owner(uuid), public.group_update(uuid, text, text, text), public.group_add_members(uuid, uuid[]),
  public.group_remove_member(uuid, uuid), public.group_leave(uuid), public.group_delete(uuid) to authenticated;
