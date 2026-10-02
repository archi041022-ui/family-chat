-- 006: анкета участника «О себе»: кто в семье, о себе, день рождения, город, телефон.
-- Видят все участники семьи, менять может только сам владелец (действующее правило "profiles update").
alter table public.profiles add column if not exists family_role text check (char_length(family_role) <= 40);
alter table public.profiles add column if not exists bio         text check (char_length(bio) <= 500);
alter table public.profiles add column if not exists birthday    date;
alter table public.profiles add column if not exists city        text check (char_length(city) <= 80);
alter table public.profiles add column if not exists phone       text check (char_length(phone) <= 30);
