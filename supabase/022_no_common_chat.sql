-- ═══════════════════════════════════════════════════════════════
--  Обновление 4.4: регистрация без общего чата «Семья».
--  Новый участник больше не добавляется в общий чат; все остальные получают оповещение «👋 … теперь с нами».
--  Сам общий чат владелец удаляет отдельной командой (внизу, в комментарии): она необратимая.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select value into code from app_config where key = 'invite_code';
  if coalesce(new.raw_user_meta_data ->> 'invite', '') <> coalesce(code, '') then
    raise exception 'INVALID_INVITE';
  end if;
  insert into profiles (id, name)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Без имени'));
  return new;
end $$;

create or replace function public.log_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into admin_log(actor, kind, ref, title) values (new.id, 'join', new.id, new.name);
  insert into notices(user_id, kind, actor, title, body)
    select p.id, 'welcome', new.id, '👋 Новый участник', new.name || ' теперь с нами. Поздоровайтесь!'
    from profiles p where p.id <> new.id and not coalesce(p.banned, false);
  return new;
end $$;

-- Удалить общий чат НАВСЕГДА вместе с перепиской (выполнять вручную, когда будете готовы):
--   delete from chats where id = '00000000-0000-0000-0000-000000000001';
