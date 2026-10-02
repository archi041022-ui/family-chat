-- ═══════════════════════════════════════════════════════════════
--  Обновление 2: истории (на 24 часа) и статус.
--  Supabase → SQL Editor → вставить → Run. Можно запускать повторно.
-- ═══════════════════════════════════════════════════════════════

-- Статус пользователя
alter table public.profiles add column if not exists status text check (char_length(status) <= 100);
alter table public.profiles add column if not exists status_at timestamptz;

-- Истории
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  media_path text,
  media_type text check (media_type in ('image', 'video')),
  body       text check (char_length(body) <= 500),
  bg         text check (char_length(bg) <= 20),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (media_path is not null or body is not null)
);
create index if not exists stories_alive on public.stories (expires_at desc);

create table if not exists public.story_views (
  story_id  uuid references public.stories on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles on delete cascade,
  emoji     text check (char_length(emoji) <= 16),
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table public.stories     enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "stories read"   on public.stories;
drop policy if exists "stories add"    on public.stories;
drop policy if exists "stories remove" on public.stories;
create policy "stories read"   on public.stories for select to authenticated using (expires_at > now() or user_id = auth.uid());
create policy "stories add"    on public.stories for insert to authenticated with check (user_id = auth.uid());
create policy "stories remove" on public.stories for delete to authenticated using (user_id = auth.uid());

-- Просмотры: свои отметки видит каждый, а автор истории видит, кто её смотрел
drop policy if exists "views read"   on public.story_views;
drop policy if exists "views add"    on public.story_views;
drop policy if exists "views update" on public.story_views;
create policy "views read" on public.story_views for select to authenticated using (
  viewer_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
);
create policy "views add" on public.story_views for insert to authenticated with check (
  viewer_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
);
create policy "views update" on public.story_views for update to authenticated using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

grant select, insert, delete on public.stories to authenticated;
grant select, insert, update on public.story_views to authenticated;

-- Файлы историй: stories/<автор>/<файл>
drop policy if exists "media read"   on storage.objects;
drop policy if exists "media upload" on storage.objects;
drop policy if exists "media delete own stories" on storage.objects;
create policy "media read" on storage.objects for select to authenticated using (
  bucket_id = 'media' and (
    (storage.foldername(name))[1] in ('avatars', 'stories') or public.is_member_text((storage.foldername(name))[1])
  )
);
create policy "media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    name like 'avatars/' || auth.uid()::text || '%'
    or name like 'stories/' || auth.uid()::text || '/%'
    or public.is_member_text((storage.foldername(name))[1])
  )
);
create policy "media delete own stories" on storage.objects for delete to authenticated using (
  bucket_id = 'media' and name like 'stories/' || auth.uid()::text || '/%'
);

-- Мгновенное появление новых историй и статусов
do $$ begin
  begin alter publication supabase_realtime add table public.stories;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end $$;

select 'ГОТОВО' as status;
