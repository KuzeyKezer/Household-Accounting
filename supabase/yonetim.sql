-- yonetim.sql — Sadece proje sahibinin Supabase panelinde göreceği okunaklı tablolar.
--
-- "yonetim" şeması Data API'ye AÇIK DEĞİLDİR: uygulama, anon ve giriş yapmış kullanıcılar
-- buraya hiçbir şekilde ulaşamaz. Sadece panelde (postgres rolü) görünür.
-- Rakamlar (taksit, faiz, net maaş) uygulamanın kendi hesabından gelir: her kayıtta
-- budgets.data.ozet içine yazılır, yani kullanıcının ekranda gördüğüyle aynıdır.
-- İki kez çalıştırmak sorun değildir.

create schema if not exists yonetim;
revoke all on schema yonetim from public, anon, authenticated;

drop view if exists yonetim.kategori_harcama, yonetim.harcamalar, yonetim.kullanicilar, yonetim.haneler,
  yonetim.plan, yonetim.gelirler, yonetim.hesaplar, yonetim.kartlar,
  yonetim.kart_taksitleri, yonetim.krediler, yonetim.hedefler cascade;
drop function if exists yonetim.kisi(uuid);

-- kişinin görünen adı: uygulamada koyduğu ad > Google adı > e-posta
create function yonetim.kisi(uid uuid) returns text language sql stable
set search_path = '' as $$
  select coalesce((select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                                    nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
                   from auth.users u where u.id = uid), '(silinmiş kullanıcı)')
$$;
revoke all on function yonetim.kisi(uuid) from public, anon, authenticated;

-- Hane özeti: herkesin parası ve borcu tek satırda
create view yonetim.haneler as
select
  h.name                                                     as hane,
  yonetim.kisi(h.created_by)                                 as sahip,
  (select count(*) from public.household_members m where m.household_id = h.id) as uye,
  (b.data -> 'ozet' -> 'toplam' ->> 'net_gelir')::numeric          as net_gelir,
  (b.data -> 'ozet' -> 'toplam' ->> 'elimdeki_para')::numeric      as elimdeki_para,
  (b.data -> 'ozet' -> 'toplam' ->> 'plan_aylik')::numeric         as aylik_gider_plani,
  (b.data -> 'ozet' -> 'toplam' ->> 'borc_aylik')::numeric         as aylik_borc_odemesi,
  (b.data -> 'ozet' -> 'toplam' ->> 'birikim_aylik')::numeric      as aylik_birikim,
  (b.data -> 'ozet' -> 'toplam' ->> 'bos_kalan')::numeric          as ay_sonu_kalan,
  (b.data -> 'ozet' -> 'toplam' ->> 'kalan_kart_borcu')::numeric   as toplam_kart_borcu,
  (b.data -> 'ozet' -> 'toplam' ->> 'kalan_kredi_borcu')::numeric  as toplam_kredi_borcu,
  (select coalesce(sum(amount), 0) from public.expenses x
    where x.household_id = h.id and x.date >= date_trunc('month', current_date)) as bu_ay_harcanan,
  b.data -> 'ozet' ->> 'donem'                               as ozet_donemi,
  b.updated_at                                               as son_guncelleme
from public.households h
left join public.budgets b on b.household_id = h.id
order by b.updated_at desc nulls last;

-- Harcamalar: kim girdi, hangi kategori/kalem, nasıl ödendi
create view yonetim.harcamalar as
select
  e.date                                                     as tarih,
  h.name                                                     as hane,
  yonetim.kisi(e.created_by)                                 as giren,
  coalesce(k.kategori, '—')                                  as kategori,
  coalesce(k.kalem, '(silinmiş kalem)')                      as kalem,
  e.amount                                                   as tutar,
  case when e.pay = 'cash' then 'Nakit'
       else '💳 ' || coalesce(kart.ad, 'silinmiş kart') end  as odeme,
  nullif(e.note, '')                                         as aciklama,
  e.household_id                                             as hane_id,
  e.created_at                                               as girilme_zamani
from public.expenses e
join public.households h on h.id = e.household_id
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

-- Kategori bazında harcama: her ay, her kategoriye ne kadar harcandı, plana göre durum
create view yonetim.kategori_harcama as
with aylik as (
  select hane_id, hane, to_char(tarih, 'YYYY-MM') as ay, kategori, sum(tutar) as harcanan, count(*) as adet
  from yonetim.harcamalar group by 1, 2, 3, 4
)
select a.ay, a.hane, a.kategori, a.harcanan, a.adet, p.planlanan,
       case when p.planlanan > 0 then round(a.harcanan / p.planlanan * 100) end as plan_yuzdesi
from aylik a
left join lateral (
  select sum((pl ->> 'aylik')::numeric) as planlanan
  from public.budgets b,
       jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'plan', '[]'::jsonb)) pl
  where b.household_id = a.hane_id and pl ->> 'kategori' = a.kategori
) p on true
order by a.ay desc, a.hane, a.harcanan desc;

-- Aylık gider planı (kalemler)
create view yonetim.plan as
select h.name as hane, x ->> 'kategori' as kategori, x ->> 'kalem' as kalem,
       (x ->> 'tutar')::numeric as tutar, (x ->> 'kac_ayda')::int as kac_ayda_bir,
       (x ->> 'aylik')::numeric as aylik_karsiligi, x ->> 'odeme' as odeme, (x ->> 'taksit')::int as taksit
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'plan', '[]'::jsonb)) x
where (x ->> 'tutar')::numeric <> 0
order by h.name, 2, 6 desc;

-- Gelirler (brüt girilenin bu ayki net karşılığı dahil)
create view yonetim.gelirler as
select h.name as hane, x ->> 'ad' as gelir, x ->> 'tur' as tur,
       (x ->> 'girilen')::numeric as girilen_tutar, (x ->> 'net_bu_ay')::numeric as net_bu_ay
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'gelirler', '[]'::jsonb)) x
order by h.name, 5 desc;

-- Elimdeki para (nakit, banka hesapları)
create view yonetim.hesaplar as
select h.name as hane, x ->> 'ad' as hesap, (x ->> 'bakiye')::numeric as bakiye,
       x ->> 'tarih' as yazildigi_tarih
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'hesaplar', '[]'::jsonb)) x
order by h.name, 3 desc;

-- Kredi kartları: ekstre ve taksit durumu
create view yonetim.kartlar as
select h.name as hane, x ->> 'ad' as kart,
       (x ->> 'ekstre_borcu')::numeric       as ekstre_borcu,
       (x ->> 'bu_ay_odenecek')::numeric     as bu_ay_odenecek,
       (x ->> 'devreden')::numeric           as devreden_borc,
       (x ->> 'devreden_faiz')::numeric      as devreden_faizi,
       (x ->> 'taksit_bu_ay')::numeric       as bu_ay_taksit,
       (x ->> 'bu_ay_toplam')::numeric       as bu_ay_toplam_odeme,
       (x ->> 'kalan_taksit_borcu')::numeric as kalan_taksit_borcu
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'kartlar', '[]'::jsonb)) x
order by h.name, 3 desc;

-- Kart taksitleri tek tek
create view yonetim.kart_taksitleri as
select h.name as hane, x ->> 'kart' as kart, x ->> 'ad' as alisveris, x ->> 'tur' as tur,
       (x ->> 'tutar')::numeric as tutar, (x ->> 'taksit_sayisi')::int as taksit_sayisi,
       (x ->> 'odenen')::int as odenen, (x ->> 'kalan')::int as kalan,
       (x ->> 'aylik')::numeric as aylik_taksit, (x ->> 'kalan_tutar')::numeric as kalan_tutar,
       (x ->> 'faiz_orani')::numeric as aylik_faiz, x ->> 'plan_kalemi' as plan_kalemi
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'kart_taksitleri', '[]'::jsonb)) x
order by h.name, 2, 10 desc;

-- Krediler
create view yonetim.krediler as
select h.name as hane, x ->> 'ad' as kredi, x ->> 'tur' as tur,
       (x ->> 'anapara')::numeric as anapara, (x ->> 'aylik_faiz')::numeric as aylik_faiz,
       (x ->> 'vade')::int as vade, (x ->> 'odenen')::int as odenen, (x ->> 'kalan')::int as kalan,
       (x ->> 'aylik_taksit')::numeric as aylik_taksit, (x ->> 'kalan_tutar')::numeric as kalan_tutar
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'krediler', '[]'::jsonb)) x
order by h.name, 10 desc;

-- Birikim hedefleri
create view yonetim.hedefler as
select h.name as hane, x ->> 'ad' as hedef, (x ->> 'hedef')::numeric as hedef_tutar,
       (x ->> 'biriken')::numeric as biriken, (x ->> 'aylik')::numeric as aylik_birikim,
       (x ->> 'yuzde')::numeric as yuzde, x ->> 'bitis' as tahmini_bitis
from public.households h join public.budgets b on b.household_id = h.id,
     jsonb_array_elements(coalesce(b.data -> 'ozet' -> 'hedefler', '[]'::jsonb)) x
order by h.name, 2;

-- Kullanıcılar
create view yonetim.kullanicilar as
select
  yonetim.kisi(u.id)                                          as ad,
  u.email                                                     as eposta,
  h.name                                                      as hane,
  case m.role when 'owner' then 'sahip' else 'üye' end        as rol,
  m.joined_at                                                 as katilma,
  u.last_sign_in_at                                           as son_giris,
  (select count(*) from public.expenses x
    where x.household_id = h.id and x.created_by = u.id)      as girdigi_harcama
from public.household_members m
join auth.users u        on u.id = m.user_id
join public.households h on h.id = m.household_id
order by h.name, m.joined_at;

revoke all on all tables in schema yonetim from public, anon, authenticated;
