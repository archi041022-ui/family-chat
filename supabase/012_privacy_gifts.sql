-- 012: конфиденциальность (как в Telegram), чёрный список, подарки со звёздами, «Избранное», свои стикеры.
-- Правила видит только владелец; остальным сервер сообщает лишь итог «можно / нельзя» для них.
-- Сообщения, голосовые, приглашения в группы и подарки сервер проверяет сам.

-- ── правила: { key: { mode: "all" | "nobody", allow: [uuid], deny: [uuid] } }, а также флаги
create table if not exists public.privacy_settings (
  user_id    uuid primary key references public.profiles on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.privacy_settings enable row level security;   -- напрямую недоступна никому

create table if not exists public.blocks (
  user_id    uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for select to authenticated using (user_id = auth.uid());
grant select on public.blocks to authenticated;

-- можно ли зрителю viewer по правилу key владельца owner
create or replace function public.pv_allowed(owner uuid, viewer uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when owner is null or viewer is null then true
    when owner = viewer then true
    when exists (select 1 from blocks b where b.user_id = owner and b.blocked_id = viewer) then false
    else coalesce((
      select case when coalesce(r->>'mode', 'all') = 'nobody'
                  then coalesce(r->'allow', '[]'::jsonb) ? viewer::text
                  else not (coalesce(r->'deny', '[]'::jsonb) ? viewer::text) end
      from (select data->key as r from privacy_settings where user_id = owner) s where r is not null), true)
  end;
$$;

create or replace function public.privacy_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'data', coalesce((select data from privacy_settings where user_id = auth.uid()), '{}'::jsonb),
    'blocked', coalesce((select jsonb_agg(blocked_id order by created_at) from blocks where user_id = auth.uid()), '[]'::jsonb))
  where auth.uid() is not null;
$$;

create or replace function public.privacy_save(data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare k text; clean jsonb := '{}'::jsonb; r jsonb;
begin
  if auth.uid() is null then return 'NO_AUTH'; end if;
  if jsonb_typeof(data) <> 'object' then return 'BAD'; end if;
  for k, r in select * from jsonb_each(data) loop
    if k in ('last_seen','photo','bio','birthday','phone','forwards','calls','voice','messages','groups','gifts','gifts_show') and jsonb_typeof(r) = 'object' then
      clean := clean || jsonb_build_object(k, jsonb_build_object(
        'mode', case when r->>'mode' = 'nobody' then 'nobody' else 'all' end,
        'allow', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(r->'allow', '[]')) x where x ~ '^[0-9a-f-]{36}$'), '[]'::jsonb),
        'deny',  coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(r->'deny', '[]')) x where x ~ '^[0-9a-f-]{36}$'), '[]'::jsonb)));
    elsif k in ('read') and jsonb_typeof(r) = 'boolean' then
      clean := clean || jsonb_build_object(k, r);
    end if;
  end loop;
  insert into privacy_settings (user_id, data, updated_at) values (auth.uid(), clean, now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  return 'OK';
end $$;

create or replace function public.block_user(target uuid, block boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or target is null or target = auth.uid() then return 'BAD'; end if;
  if block then insert into blocks (user_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  else delete from blocks where user_id = auth.uid() and blocked_id = target; end if;
  return 'OK';
end $$;

-- для каждого члена семьи: что МНЕ можно (правила других не раскрываются)
create or replace function public.privacy_view() returns table (user_id uuid, r jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, jsonb_build_object(
    'last_seen', pv_allowed(p.id, auth.uid(), 'last_seen'), 'photo', pv_allowed(p.id, auth.uid(), 'photo'),
    'bio', pv_allowed(p.id, auth.uid(), 'bio'), 'birthday', pv_allowed(p.id, auth.uid(), 'birthday'),
    'phone', pv_allowed(p.id, auth.uid(), 'phone'), 'forwards', pv_allowed(p.id, auth.uid(), 'forwards'),
    'calls', pv_allowed(p.id, auth.uid(), 'calls'), 'voice', pv_allowed(p.id, auth.uid(), 'voice'),
    'messages', pv_allowed(p.id, auth.uid(), 'messages'), 'groups', pv_allowed(p.id, auth.uid(), 'groups'),
    'gifts', pv_allowed(p.id, auth.uid(), 'gifts'), 'gifts_show', pv_allowed(p.id, auth.uid(), 'gifts_show'),
    'read', coalesce((select (data->>'read')::boolean from privacy_settings s where s.user_id = p.id), true),
    'blocked_me', exists (select 1 from blocks b where b.user_id = p.id and b.blocked_id = auth.uid()))
  from profiles p where p.id <> auth.uid() and auth.uid() is not null;
$$;

-- ── сервер не пропускает личные сообщения и голосовые, если получатель запретил
create or replace function public.messages_privacy() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype; other uuid;
begin
  select * into c from chats where id = new.chat_id;
  if not found or c.is_group or coalesce(c.dm_key, '') like 'saved:%' then return new; end if;
  select m.user_id into other from chat_members m where m.chat_id = c.id and m.user_id <> new.user_id limit 1;
  if other is null then return new; end if;
  if not pv_allowed(other, new.user_id, 'messages') then raise exception 'PRIVACY_MESSAGES' using errcode = '42501'; end if;
  if new.media_type in ('audio', 'video_note') and not pv_allowed(other, new.user_id, 'voice') then
    raise exception 'PRIVACY_VOICE' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists messages_privacy on public.messages;
create trigger messages_privacy before insert on public.messages for each row execute function public.messages_privacy();

-- ── в группы и каналы добавляют только с разрешения (сам вступил / заявка одобрена — можно)
create or replace function public.members_privacy() returns trigger
language plpgsql security definer set search_path = public as $$
declare c chats%rowtype;
begin
  if auth.uid() is null or new.user_id = auth.uid() then return new; end if;
  select * into c from chats where id = new.chat_id;
  if not found or not c.is_group or c.id = '00000000-0000-0000-0000-000000000001'::uuid then return new; end if;
  if coalesce(current_setting('family.join_ok', true), '') = new.user_id::text then return new; end if;
  if not pv_allowed(new.user_id, auth.uid(), 'groups') then return null; end if;      -- молча пропускаем
  return new;
end $$;
drop trigger if exists members_privacy on public.chat_members;
create trigger members_privacy before insert on public.chat_members for each row execute function public.members_privacy();

create or replace function public.decide_join(cid uuid, target uuid, ok boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_owner(cid) or not public.is_member(cid) then return 'NOT_OWNER'; end if;
  if not exists (select 1 from join_requests where chat_id = cid and user_id = target) then return 'NO_REQUEST'; end if;
  delete from join_requests where chat_id = cid and user_id = target;
  if ok then
    perform set_config('family.join_ok', target::text, true);                     -- человек сам попросился
    insert into chat_members (chat_id, user_id)
      select cid, target where exists (select 1 from profiles where id = target and not coalesce(banned, false)) on conflict do nothing;
    insert into notices (user_id, kind, chat_id, ref, actor, title, body)
      select target, 'joined', cid, cid, auth.uid(), '🎉 Заявка одобрена', 'Вас приняли в «' || coalesce(title, 'группу') || '»'
      from chats where id = cid;
  end if;
  return 'OK';
end $$;

-- ── «Избранное»: личный чат с самим собой
create or replace function public.saved_chat() returns uuid
language plpgsql security definer set search_path = public as $$
declare k text; cid uuid;
begin
  if auth.uid() is null then raise exception 'NO_AUTH'; end if;
  k := 'saved:' || auth.uid()::text;
  insert into chats (is_group, dm_key, created_by, title) values (false, k, auth.uid(), 'Избранное') on conflict (dm_key) do nothing;
  select id into cid from chats where dm_key = k;
  insert into chat_members (chat_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;

-- ── свои стикеры (файлы в папке stickers/<id пользователя>/)
create table if not exists public.user_stickers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  path       text not null check (char_length(path) <= 300),
  emoji      text check (char_length(emoji) <= 16),
  created_at timestamptz not null default now()
);
alter table public.user_stickers enable row level security;
drop policy if exists "stickers own" on public.user_stickers;
create policy "stickers own" on public.user_stickers for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and path like 'stickers/' || auth.uid()::text || '/%');
grant select, insert, delete on public.user_stickers to authenticated;
drop policy if exists "media stickers read" on storage.objects;
drop policy if exists "media stickers upload" on storage.objects;
drop policy if exists "media stickers delete" on storage.objects;
create policy "media stickers read" on storage.objects for select to authenticated using (
  bucket_id = 'media' and name like 'stickers/' || auth.uid()::text || '/%');
create policy "media stickers upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and name like 'stickers/' || auth.uid()::text || '/%');
create policy "media stickers delete" on storage.objects for delete to authenticated using (
  bucket_id = 'media' and name like 'stickers/' || auth.uid()::text || '/%');

-- текст оповещения о стикере
create or replace function public.notice_text(b text, mt text) returns text
language sql immutable set search_path = public as $$
  select left(case
    when b = chr(8289) || 'st' then '🎟 Стикер'
    when mt = 'location' then '📍 Геолокация'
    else coalesce(case mt when 'image' then '📷 Фото' when 'video' then '🎬 Видео' when 'audio' then '🎤 Голосовое'
                          when 'file' then '📎 Файл' when 'video_note' then '⭕ Видеосообщение' end, '')
      || case when mt in ('image','video','audio','file','video_note') and t <> '' then ' · ' else '' end || t
  end, 200)
  from (select btrim(split_part(
    regexp_replace(regexp_replace(replace(coalesce(b, ''), chr(8291), ''), chr(8290) || 'fx:[a-z]+', '', 'g'),
      '^↪️ Переслано от [^' || chr(10) || ']*' || chr(10) || '?', ''),
    chr(8292), 1)) as t) x;
$$;

-- ── подарки и звёзды
create table if not exists public.gift_types (
  id text primary key, emoji text not null, name text not null, price int not null check (price > 0),
  total int, category text not null default 'Праздник', sort int not null default 0
);
alter table public.gift_types enable row level security;
drop policy if exists "gift types read" on public.gift_types;
create policy "gift types read" on public.gift_types for select to authenticated using (true);
grant select on public.gift_types to authenticated;
insert into public.gift_types (id, emoji, name, price, total, category, sort) values
  ('heart',     '❤️', 'Сердце',        15, null, 'Любовь', 1),
  ('rose',      '🌹', 'Роза',          25, null, 'Любовь', 2),
  ('bouquet',   '💐', 'Букет',         50, null, 'Любовь', 3),
  ('kiss',      '😘', 'Поцелуй',       10, null, 'Любовь', 4),
  ('ring',      '💍', 'Кольцо',       250, 10,   'Любовь', 5),
  ('cake',      '🎂', 'Торт',          50, null, 'Праздник', 10),
  ('gift',      '🎁', 'Подарок',       25, null, 'Праздник', 11),
  ('balloon',   '🎈', 'Шарик',         15, null, 'Праздник', 12),
  ('party',     '🎉', 'Хлопушка',      20, null, 'Праздник', 13),
  ('champagne', '🍾', 'Шампанское',    75, null, 'Праздник', 14),
  ('tree',      '🎄', 'Ёлка',         100, 20,   'Праздник', 15),
  ('teddy',     '🧸', 'Мишка',         50, null, 'Милое', 20),
  ('unicorn',   '🦄', 'Единорог',     100, null, 'Милое', 21),
  ('cat',       '🐱', 'Котик',         25, null, 'Милое', 22),
  ('dog',       '🐶', 'Щенок',         25, null, 'Милое', 23),
  ('coffee',    '☕', 'Кофе',          10, null, 'Вкусное', 30),
  ('chocolate', '🍫', 'Шоколадка',     15, null, 'Вкусное', 31),
  ('pizza',     '🍕', 'Пицца',         30, null, 'Вкусное', 32),
  ('trophy',    '🏆', 'Кубок',        150, null, 'Особое', 40),
  ('star',      '🌟', 'Звезда',       100, null, 'Особое', 41),
  ('crown',     '👑', 'Корона',       500, 5,    'Особое', 42),
  ('rocket',    '🚀', 'Ракета',       300, 7,    'Особое', 43),
  ('gem',       '💎', 'Бриллиант',   1000, 3,    'Особое', 44),
  ('rainbow',   '🌈', 'Радуга',        40, null, 'Особое', 45)
on conflict (id) do update set emoji = excluded.emoji, name = excluded.name, price = excluded.price, total = excluded.total,
  category = excluded.category, sort = excluded.sort;

create table if not exists public.star_wallets (
  user_id   uuid primary key references public.profiles on delete cascade,
  balance   int not null default 100 check (balance >= 0),
  bonus_day date
);
alter table public.star_wallets enable row level security;
drop policy if exists "wallet own" on public.star_wallets;
create policy "wallet own" on public.star_wallets for select to authenticated using (user_id = auth.uid());
grant select on public.star_wallets to authenticated;

create table if not exists public.user_gifts (
  id         uuid primary key default gen_random_uuid(),
  gift_id    text not null references public.gift_types,
  from_user  uuid references public.profiles on delete set null,
  to_user    uuid not null references public.profiles on delete cascade,
  message    text check (char_length(message) <= 200),
  anonymous  boolean not null default false,
  hidden     boolean not null default false,
  pinned     boolean not null default false,
  converted  boolean not null default false,
  price      int not null,
  created_at timestamptz not null default now()
);
create index if not exists user_gifts_to on public.user_gifts (to_user, created_at desc);
alter table public.user_gifts enable row level security;
drop policy if exists "gifts mine" on public.user_gifts;
create policy "gifts mine" on public.user_gifts for select to authenticated using (to_user = auth.uid());
grant select on public.user_gifts to authenticated;
alter table public.user_gifts replica identity full;
do $$ begin alter publication supabase_realtime add table public.user_gifts; exception when others then null; end $$;

create or replace function public.wallet_get() returns star_wallets
language plpgsql security definer set search_path = public as $$
declare w star_wallets;
begin
  insert into star_wallets (user_id) values (auth.uid()) on conflict do nothing;
  select * into w from star_wallets where user_id = auth.uid();
  return w;
end $$;

create or replace function public.gifts_home() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w star_wallets;
begin
  if auth.uid() is null then return null; end if;
  w := wallet_get();
  return jsonb_build_object('balance', w.balance, 'bonus', w.bonus_day is distinct from current_date,
    'catalog', (select jsonb_agg(jsonb_build_object('id', t.id, 'emoji', t.emoji, 'name', t.name, 'price', t.price, 'total', t.total, 'category', t.category,
       'left', case when t.total is null then null else greatest(0, t.total - (select count(*) from user_gifts g where g.gift_id = t.id)) end) order by t.sort)
     from gift_types t));
end $$;

create or replace function public.claim_bonus() returns int
language plpgsql security definer set search_path = public as $$
declare w star_wallets;
begin
  if auth.uid() is null then return null; end if;
  w := wallet_get();
  if w.bonus_day is not distinct from current_date then return -1; end if;
  update star_wallets set balance = balance + 20, bonus_day = current_date where user_id = auth.uid() returning balance into w.balance;
  return w.balance;
end $$;

create or replace function public.send_gift(target uuid, gift text, msg text, anon boolean) returns text
language plpgsql security definer set search_path = public as $$
declare t gift_types%rowtype; w star_wallets; who text;
begin
  if auth.uid() is null or target is null or target = auth.uid() then return 'BAD'; end if;
  if not exists (select 1 from profiles where id = target and not coalesce(banned, false)) then return 'NO_USER'; end if;
  if not pv_allowed(target, auth.uid(), 'gifts') then return 'PRIVACY'; end if;
  select * into t from gift_types where id = gift; if not found then return 'NO_GIFT'; end if;
  perform 1 from gift_types where id = gift for update;                               -- лимитированные — по очереди
  if t.total is not null and (select count(*) from user_gifts where gift_id = gift) >= t.total then return 'SOLD_OUT'; end if;
  w := wallet_get();
  if w.balance < t.price then return 'NO_STARS'; end if;
  update star_wallets set balance = balance - t.price where user_id = auth.uid();
  insert into user_gifts (gift_id, from_user, to_user, message, anonymous, price)
    values (gift, auth.uid(), target, nullif(left(btrim(coalesce(msg, '')), 200), ''), coalesce(anon, false), t.price);
  who := case when coalesce(anon, false) then 'Тайный даритель' else coalesce((select name from profiles where id = auth.uid()), 'Кто-то') end;
  insert into notices (user_id, kind, actor, title, body)
    values (target, 'gift', case when coalesce(anon, false) then null else auth.uid() end, '🎁 Вам подарок!', who || ' дарит вам «' || t.name || '» ' || t.emoji);
  return 'OK';
end $$;

-- подарки в профиле: скрытые видит только владелец; имя тайного дарителя — только получатель
create or replace function public.gifts_of(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'gift_id', g.gift_id, 'emoji', t.emoji, 'name', t.name, 'price', g.price,
      'message', case when uid = auth.uid() or not g.anonymous then g.message end,
      'from', case when g.anonymous and uid <> auth.uid() then null else g.from_user end,
      'from_name', case when g.anonymous and uid <> auth.uid() then null else (select name from profiles where id = g.from_user) end,
      'anonymous', g.anonymous, 'hidden', g.hidden, 'pinned', g.pinned, 'created_at', g.created_at,
      'limited', t.total is not null, 'convert', (g.price * 8) / 10)
    order by g.pinned desc, g.created_at desc), '[]'::jsonb)
  from user_gifts g join gift_types t on t.id = g.gift_id
  where g.to_user = uid and not g.converted and (uid = auth.uid() or (not g.hidden and pv_allowed(uid, auth.uid(), 'gifts_show')))
    and auth.uid() is not null;
$$;

create or replace function public.gift_update(gid uuid, hide boolean, pin boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  update user_gifts set hidden = coalesce(hide, hidden), pinned = coalesce(pin, pinned)
    where id = gid and to_user = auth.uid() and not converted;
  return case when found then 'OK' else 'NO_GIFT' end;
end $$;

create or replace function public.gift_convert(gid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare g user_gifts%rowtype; add int; b int;
begin
  select * into g from user_gifts where id = gid and to_user = auth.uid() and not converted for update;
  if not found then return -1; end if;
  add := (g.price * 8) / 10;
  update user_gifts set converted = true, hidden = true, pinned = false where id = gid;
  perform wallet_get();
  update star_wallets set balance = balance + add where user_id = auth.uid() returning balance into b;
  return b;
end $$;

revoke all on function public.pv_allowed(uuid, uuid, text), public.privacy_get(), public.privacy_save(jsonb), public.block_user(uuid, boolean),
  public.privacy_view(), public.saved_chat(), public.wallet_get(), public.gifts_home(), public.claim_bonus(),
  public.send_gift(uuid, text, text, boolean), public.gifts_of(uuid), public.gift_update(uuid, boolean, boolean), public.gift_convert(uuid) from public, anon;
grant execute on function public.privacy_get(), public.privacy_save(jsonb), public.block_user(uuid, boolean), public.privacy_view(),
  public.saved_chat(), public.gifts_home(), public.claim_bonus(), public.send_gift(uuid, text, text, boolean), public.gifts_of(uuid),
  public.gift_update(uuid, boolean, boolean), public.gift_convert(uuid) to authenticated;
