-- Обновление 4: приглашения. Код видят участники семьи, менять может администратор.
create or replace function public.get_invite_code() returns text
language sql security definer stable set search_path = public as $$
  select case when auth.uid() is not null then (select value from app_config where key = 'invite_code') end
$$;

create or replace function public.set_invite_code(code text) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(code, '')));
begin
  if not public.is_admin() then return 'NOT_ADMIN'; end if;
  if c !~ '^[A-ZА-ЯЁ0-9-]{4,20}$' then return 'BAD_CODE'; end if;
  update app_config set value = c where key = 'invite_code';
  return 'OK';
end $$;

revoke all on function public.get_invite_code() from public;
revoke all on function public.set_invite_code(text) from public;
grant execute on function public.get_invite_code(), public.set_invite_code(text) to authenticated;

select 'ГОТОВО' as status;
