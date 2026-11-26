# Ev Bütçesi

Aile / ev bütçesi: plan, harcama takibi, kredi kartı taksitleri, krediler, brüt → net maaş (2026 vergi dilimleri), 12 aylık nakit akışı, birikim hedefleri.

- Derleme gerektirmez: düz HTML + JavaScript. GitHub Pages ile yayınlanır.
- `js/config.js` boşsa veriler sadece tarayıcıda durur. Doluysa Supabase ile giriş yapılır (Google / e-posta) ve veriler hesapta saklanır.
- Kurulum: **[KURULUM.md](KURULUM.md)**
- Veritabanı ve güvenlik kuralları (RLS): [`supabase/schema.sql`](supabase/schema.sql)

## Güvenlik notları
- Depoda gizli bilgi yoktur. `config.js`'teki publishable anahtar herkese açık olmak üzere tasarlanmıştır; erişimi veritabanındaki Row Level Security kuralları sınırlar.
- Secret / service_role anahtarı **asla** bu depoya girmez.
- İçerik güvenlik politikası (CSP) sadece bu sitenin kendi scriptlerinin çalışmasına izin verir. Supabase kütüphanesi `js/vendor/` içinde paketlidir, dış bir CDN'den yüklenmez.

Supabase JS kütüphanesi: MIT lisansı, © Supabase.
