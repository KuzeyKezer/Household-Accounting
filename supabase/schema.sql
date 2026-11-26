-- =====================================================================
-- Ev Bütçesi · Supabase veritabanı kurulumu
-- Supabase panelinde: SQL Editor → New query → bu dosyanın TAMAMINI
-- yapıştır → Run. Bir kez çalıştırman yeterli.
--
-- Güvenlik modeli:
--  * Her bütçe bir "ev"e (household) aittir. Bir kullanıcı sadece üyesi
--    olduğu evlerin verisini görebilir/değiştirebilir (Row Level Security).
--  * Giriş yapmamış (anon) kullanıcının hiçbir tabloya erişimi yoktur.
--  * Ev oluşturma, davet kodu üretme ve davetle katılma sadece aşağıdaki
--    fonksiyonlar üzerinden yapılır; tablolara doğrudan eklenemez.
-- =====================================================================

-- ---------------------------------------------------------------- tablolar
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Evim' check (char_length(name) between 1 and 80),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members (user_id);

-- Bütçe planı, kartlar, krediler, hedefler, ayarlar: tek bir JSON belge.
-- version: aynı anda iki kişi kaydederse birinin değişikliği sessizce ezilmesin diye.
create table if not exists public.budgets (
  household_id uuid primary key references public.households (id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  constraint budgets_data_size check (pg_column_size(data) < 1000000)
);

-- Harcamalar ayrı satırlar: telefondan biri harcama eklerken diğeri planı
-- düzenlese bile kimsenin kaydı kaybolmaz.
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date         date not null,
  item_id      text check (char_length(item_id) <= 40),
  amount       numeric(14, 2) not null check (amount > 0 and amount < 10000000000),
  note         text not null default '' check (char_length(note) <= 200),
  pay          text not null default 'cash' check (char_length(pay) <= 40),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists expenses_household_date_idx on public.expenses (household_id, date);

create table if not exists public.invites (
  code         text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '7 days',
  used_by      uuid references auth.users (id) on delete set null,
  used_at      timestamptz
);

-- ---------------------------------------------------------------- yardımcı
-- Kullanıcı bu evin üyesi mi? (RLS kurallarında kullanılır)
create or replace function public.is_member(hid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------- RLS
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.budgets           enable row level security;
alter table public.expenses          enable row level security;
alter table public.invites           enable row level security;

drop policy if exists "uye evini gorur" on public.households;
create policy "uye evini gorur" on public.households
  for select to authenticated using (public.is_member(id));

drop policy if exists "uye ev adini degistirir" on public.households;
create policy "uye ev adini degistirir" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "uye diger uyeleri gorur" on public.household_members;
create policy "uye diger uyeleri gorur" on public.household_members
  for select to authenticated using (public.is_member(household_id));

-- Kişi evden kendisi ayrılabilir; ev sahibi başkasını çıkarabilir.
drop policy if exists "ayril veya cikar" on public.household_members;
create policy "ayril veya cikar" on public.household_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.household_members o
      where o.household_id = household_members.household_id
        and o.user_id = (select auth.uid()) and o.role = 'owner'
    )
  );

drop policy if exists "uye butceyi gorur" on public.budgets;
create policy "uye butceyi gorur" on public.budgets
  for select to authenticated using (public.is_member(household_id));

drop policy if exists "uye harcamalari gorur" on public.expenses;
create policy "uye harcamalari gorur" on public.expenses
  for select to authenticated using (public.is_member(household_id));

drop policy if exists "uye harcama ekler" on public.expenses;
create policy "uye harcama ekler" on public.expenses
  for insert to authenticated
  with check (public.is_member(household_id) and created_by = (select auth.uid()));

drop policy if exists "uye harcama duzenler" on public.expenses;
create policy "uye harcama duzenler" on public.expenses
  for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "uye harcama siler" on public.expenses;
create policy "uye harcama siler" on public.expenses
  for delete to authenticated using (public.is_member(household_id));

drop policy if exists "uye davetleri gorur" on public.invites;
create policy "uye davetleri gorur" on public.invites
  for select to authenticated using (public.is_member(household_id));

-- ---------------------------------------------------------------- fonksiyonlar
-- Yeni ev + sahibi olarak üyelik + boş bütçe (tek seferde)
create or replace function public.create_household(p_name text default 'Evim', p_data jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'giris gerekli'; end if;
  if (select count(*) from public.households h where h.created_by = uid) >= 5 then
    raise exception 'en fazla 5 ev olusturabilirsin';
  end if;
  insert into public.households (name, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Evim'), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  insert into public.budgets (household_id, data, updated_by) values (hid, coalesce(p_data, '{}'::jsonb), uid);
  return hid;
end;
$$;

-- Bütçeyi kaydet; başkası araya girip kaydettiyse 'conflict' döner (veri ezilmez)
create or replace function public.save_budget(p_household uuid, p_data jsonb, p_version integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  newv integer;
begin
  if not public.is_member(p_household) then raise exception 'yetki yok'; end if;
  update public.budgets
     set data = p_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
   where household_id = p_household and version = p_version
  returning version into newv;
  if newv is null then raise exception 'conflict'; end if;
  return newv;
end;
$$;

-- Davet kodu üret (7 gün geçerli, tek kullanımlık)
create or replace function public.create_invite(p_household uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c text;
begin
  if not public.is_member(p_household) then raise exception 'yetki yok'; end if;
  delete from public.invites where household_id = p_household and (expires_at < now() or used_by is not null);
  if (select count(*) from public.invites i where i.household_id = p_household) >= 10 then
    raise exception 'cok fazla aktif davet var';
  end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  c := substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
  insert into public.invites (code, household_id, created_by) values (c, p_household, auth.uid());
  return c;
end;
$$;

-- Davet koduyla bir eve katıl
create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invites%rowtype;
begin
  if uid is null then raise exception 'giris gerekli'; end if;
  select * into inv from public.invites
   where code = upper(trim(p_code)) and expires_at > now() and used_by is null
   for update;
  if not found then raise exception 'kod gecersiz veya suresi dolmus'; end if;
  insert into public.household_members (household_id, user_id, role)
    values (inv.household_id, uid, 'member') on conflict do nothing;
  update public.invites set used_by = uid, used_at = now() where code = inv.code;
  return inv.household_id;
end;
$$;

-- ---------------------------------------------------------------- yetkiler
-- Yeni Supabase projelerinde tablolar Data API'ye kendiliğinden açılmaz;
-- burada sadece gerekeni, sadece giriş yapmış kullanıcıya açıyoruz.
revoke all on public.households, public.household_members, public.budgets,
              public.expenses, public.invites from anon, authenticated;
grant select, update                 on public.households        to authenticated;
grant select, delete                 on public.household_members to authenticated;
grant select                         on public.budgets           to authenticated;
grant select, insert, update, delete on public.expenses          to authenticated;
grant select                         on public.invites           to authenticated;

revoke all on function public.is_member(uuid)                         from public, anon;
revoke all on function public.create_household(text, jsonb)           from public, anon;
revoke all on function public.save_budget(uuid, jsonb, integer)       from public, anon;
revoke all on function public.create_invite(uuid)                     from public, anon;
revoke all on function public.join_household(text)                    from public, anon;
grant execute on function public.is_member(uuid)                      to authenticated;
grant execute on function public.create_household(text, jsonb)        to authenticated;
grant execute on function public.save_budget(uuid, jsonb, integer)    to authenticated;
grant execute on function public.create_invite(uuid)                  to authenticated;
grant execute on function public.join_household(text)                 to authenticated;
