-- yonetim.sql — Sadece proje sahibinin Supabase panelinde göreceği okunaklı görünümler.
--
-- "yonetim" şeması Data API'ye AÇIK DEĞİLDİR: uygulama, anon ve giriş yapmış kullanıcılar
-- buraya hiçbir şekilde ulaşamaz. Sadece panelde (postgres rolü) görünür.
-- İki kez çalıştırmak sorun değildir.

create schema if not exists yonetim;
revoke all on schema yonetim from public, anon, authenticated;

-- Harcamalar: kim girdi, hangi hane, hangi kategori/kalem, nasıl ödendi
create or replace view yonetim.harcamalar as
select
  e.date                                                     as tarih,
  h.name                                                     as hane,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email, '(silinmiş kullanıcı)') as giren,
  coalesce(k.kategori, '—')                                  as kategori,
  coalesce(k.kalem, '(silinmiş kalem)')                      as kalem,
  e.amount                                                   as tutar,
  case when e.pay = 'cash' then 'Nakit'
       else '💳 ' || coalesce(kart.ad, 'silinmiş kart') end  as odeme,
  nullif(e.note, '')                                         as aciklama,
  e.created_at                                               as girilme_zamani
from public.expenses e
join public.households h on h.id = e.household_id
left join auth.users u on u.id = e.created_by
left join public.budgets b on b.household_id = e.household_id
left join lateral (
  select c ->> 'label' as kategori, it ->> 'label' as kalem
  from jsonb_array_elements(coalesce(b.data -> 'categories', '[]'::jsonb)) c,
       jsonb_array_elements(coalesce(c -> 'items', '[]'::jsonb)) it
  where it ->> 'id' = e.item_id
  limit 1
) k on true
left join lateral (
  select cd ->> 'label' as ad
  from jsonb_array_elements(coalesce(b.data -> 'cards', '[]'::jsonb)) cd
  where cd ->> 'id' = e.pay
  limit 1
) kart on true
order by e.date desc, e.created_at desc;

-- Kullanıcılar ve haneleri
create or replace view yonetim.kullanicilar as
select
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), '—') as ad,
  u.email                                                     as eposta,
  h.name                                                      as hane,
  case m.role when 'owner' then 'sahip' else 'üye' end        as rol,
  m.joined_at                                                 as katilma,
  u.last_sign_in_at                                           as son_giris,
  (select count(*) from public.expenses x
    where x.household_id = h.id and x.created_by = u.id)      as girdigi_harcama
from public.household_members m
join auth.users u      on u.id = m.user_id
join public.households h on h.id = m.household_id
order by h.name, m.joined_at;

-- Hane özeti: bu ay toplam harcama
create or replace view yonetim.haneler as
select
  h.name                                                        as hane,
  (select count(*) from public.household_members m where m.household_id = h.id) as uye_sayisi,
  (select coalesce(sum(amount), 0) from public.expenses x
    where x.household_id = h.id
      and x.date >= date_trunc('month', current_date))          as bu_ay_harcama,
  (select count(*) from public.expenses x where x.household_id = h.id) as toplam_kayit,
  h.created_at                                                  as olusturma
from public.households h
order by h.created_at;

revoke all on all tables in schema yonetim from public, anon, authenticated;
