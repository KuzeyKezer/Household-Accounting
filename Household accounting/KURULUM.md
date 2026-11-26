# Ev Bütçesi — Kurulum Rehberi (adım adım)

Bu rehberin sonunda uygulama **telefonda ve bilgisayarda aynı verilerle** çalışacak, herkes kendi hesabıyla girecek ve kimse başkasının bütçesini göremeyecek.

Toplam süre: yaklaşık **45–60 dakika**. Sırayla git, adım atlama.

---

## 0. Önce kavramlar (2 dakikalık sözlük)

| Ne | Ne işe yarıyor | Benzetme |
|---|---|---|
| **GitHub** | Kodun durduğu yer | Dosyaların bulut klasörü |
| **GitHub Pages** | O kodu bir web sitesi olarak yayınlar (`https://kullaniciadin.github.io/ev-butcesi`) | Klasörü vitrine koymak |
| **Supabase** | Verilerin (harcamalar, plan) durduğu veritabanı + giriş sistemi | Kasası olan bir banka şubesi |
| **RLS (Row Level Security)** | Veritabanındaki kural: "herkes sadece kendi evinin verisini görür" | Kasada herkesin sadece kendi kutusunu açabilmesi |
| **Google OAuth** | "Google ile giriş yap" butonunun arkasındaki sistem | Kimliğini Google'a gösterip içeri girmek |

**İki anahtar meselesi (en önemli kısım):**
- Supabase sana iki çeşit anahtar verir.
- 🟢 **Publishable key** (`sb_publishable_...` ile başlar): Sitenin içinde durabilir, herkes görse sorun değil. Kapının adresi gibidir; içeri girmek için yine giriş yapmak ve RLS kurallarına takılmamak gerekir.
- 🔴 **Secret key** (`sb_secret_...` ile başlar) ya da eski adıyla **service_role**: Bütün kuralları atlayan **ana anahtardır.** Asla koda, GitHub'a, mesaja yazma. Kimseye verme. Uygulama bu anahtarı görürse çalışmayı zaten reddeder.
- Google'dan alacağın **Client secret** da gizlidir. Sadece Supabase paneline yapıştırılır, başka hiçbir yere yazılmaz.

---

## 1. GitHub — kodu yükle

### 1.1 Hesap ve güvenlik
1. <https://github.com> → hesabın yoksa **Sign up**.
2. Sağ üstte profil resmin → **Settings** → **Password and authentication** → **Two-factor authentication**'ı aç (telefon uygulaması ile). *Hesabın çalınırsa kodu da değiştirebilirler, bu yüzden şart.*

### 1.2 Depo (repository) aç
1. Sağ üstte **+** → **New repository**.
2. **Repository name:** `ev-butcesi`
3. **Public** seç. *(Ücretsiz GitHub'da Pages sadece herkese açık depolarda çalışır. Kod açık olur ama içinde hiçbir gizli bilgi ve kimsenin verisi yok; veriler Supabase'de, kilitli.)*
4. **Create repository**.

### 1.3 Dosyaları yükle
1. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
2. Bilgisayarında **Masaüstü → Household accounting** klasörünü aç.
3. Klasörün **içindeki her şeyi** (index.html, style.css, manifest.webmanifest, KURULUM.md, README.md, .gitignore, **js** klasörü, **icons** klasörü, **supabase** klasörü) seç ve GitHub sayfasına sürükle.
   - Klasörlerle birlikte sürüklemek Chrome'da sorunsuz çalışır. Safari klasörleri almazsa Chrome'dan yap ya da **GitHub Desktop** uygulamasını kullan.
   - `.gitignore` gizli dosyadır, Finder'da görünmez (Cmd + Shift + . ile görünür). Yüklenmese de olur.
4. Aşağıda **Commit changes**.
5. Depo sayfasında `js`, `icons`, `supabase` klasörlerini ve `index.html`'i görüyorsan tamam.

### 1.4 GitHub Pages'i aç
1. Depoda üstte **Settings** → soldan **Pages**.
2. **Source:** `Deploy from a branch`
3. **Branch:** `main` ve yanında `/ (root)` → **Save**.
4. 1–2 dakika bekle, sayfayı yenile. Üstte **"Your site is live at https://KULLANICIADIN.github.io/ev-butcesi/"** yazacak.
5. 📝 **Bu adresi bir yere not et.** Rehberde buna **SİTE ADRESİ** diyeceğiz.

Şu an siteyi açarsan uygulama eskisi gibi "sadece bu tarayıcıda" modunda açılır. Normal, henüz Supabase'i bağlamadık.

---

## 2. Supabase — veritabanı ve giriş sistemi

### 2.1 Proje aç
1. <https://supabase.com> → **Start your project** → **Continue with GitHub** (aynı hesapla girmek en kolayı).
2. **New project**:
   - **Name:** `ev-butcesi`
   - **Database Password:** **Generate a password**'e bas, çıkan şifreyi şifre yöneticine kaydet. *(Uygulamada kullanmayacağız ama kaybetme.)*
   - **Region:** **Central EU (Frankfurt)**. *Türkiye'ye en yakın ve verin Avrupa'da durur.*
   - Ücretsiz plan (**Free**) yeterli.
3. **Create new project** → 1–2 dakika kurulmasını bekle.

### 2.2 Veritabanını kur (tek seferlik)
1. Sol menüde **SQL Editor** → **New query**.
2. GitHub'daki ya da bilgisayarındaki `supabase/schema.sql` dosyasını aç, **tamamını** kopyala, buraya yapıştır.
3. Sağ altta **Run**.
4. Altta **"Success. No rows returned"** görmelisin. *(Kırmızı hata çıkarsa ekran görüntüsünü bana at.)*
5. Kontrol: Sol menüde **Table Editor** → `households`, `household_members`, `budgets`, `expenses`, `invites` tablolarını görmelisin.
6. Kontrol: Sol menüde **Advisors → Security Advisor**. "RLS disabled" türünde **kırmızı uyarı olmamalı.**

### 2.3 Adresi ve anahtarı al, uygulamaya yaz
1. Supabase'de üstte **Connect** butonuna ya da **Project Settings → API Keys**'e git.
2. İki şeyi kopyala:
   - **Project URL** → `https://xxxxxxxx.supabase.co` gibi
   - **Publishable key** → `sb_publishable_...` ile başlayan 🟢
   - ⚠️ `sb_secret_...` olanı **kopyalama.**
3. GitHub'da deponda `js/config.js` dosyasını aç → sağ üstte **kalem ✏️ (Edit)**.
4. İki satırı doldur:
   ```js
   supabaseUrl: "https://xxxxxxxx.supabase.co",
   supabaseKey: "sb_publishable_xxxxxxxxxxxx"
   ```
5. **Commit changes** → **Commit changes**.

### 2.4 Giriş ayarları
1. Sol menü **Authentication** → **URL Configuration**:
   - **Site URL:** SİTE ADRESİ (örnek `https://kuzey.github.io/ev-butcesi/`)
   - **Redirect URLs** → **Add URL** → yine SİTE ADRESİ → Save.
   - *Bilgisayarda yerel sunucuyla da denemek istersen `http://127.0.0.1:PORT/` adresini de ekle.*
2. **Authentication → Sign In / Providers → Email**:
   - **Enable Email provider:** açık
   - **Confirm email:** açık *(sahte e-postayla hesap açılmasın)*
   - **Minimum password length:** 8
3. Not: Supabase'in ücretsiz e-posta gönderici servisi **saatte sadece birkaç e-posta** atabilir. Çevren için yeterli. İleride çok kişi aynı anda kayıt olursa "kendi SMTP'ni bağla" ayarı gerekir. Asıl giriş yöntemi Google olduğu için büyük ihtimalle gerek kalmaz.

---

## 3. Google ile giriş (Google OAuth)

Burada Google'a "benim bir uygulamam var, insanlar Google hesaplarıyla girebilsin" diyoruz.

### 3.1 Google Cloud projesi
1. <https://console.cloud.google.com> → kendi Google hesabınla gir.
2. Üstte proje seçici → **New Project** → isim: `Ev Butcesi` → **Create** → oluşan projeyi seç.

### 3.2 Uygulama bilgileri (onay ekranı)
1. Üstteki arama kutusuna **Google Auth Platform** yaz ve aç → **Get started**.
2. **App name:** `Ev Bütçesi` · **User support email:** kendi e-postan → Next
3. **Audience:** **External** → Next
4. **Contact information:** kendi e-postan → Next → şartları kabul et → **Create**
5. **Data Access** kısmına bir şey ekleme. Varsayılanlar (e-posta, profil) yeterli. Fazla izin istemediğimiz için Google'ın uzun inceleme sürecine gerek yok.

### 3.3 Client (anahtar) oluştur
1. Önce Supabase'den bir adres alacağız. Yeni sekmede Supabase → **Authentication → Sign In / Providers → Google**'ı aç. Orada yazan **Callback URL**'yi kopyala (`https://xxxxxxxx.supabase.co/auth/v1/callback`). Bu sekmeyi kapatma.
2. Google'a dön: **Google Auth Platform → Clients → Create client**
   - **Application type:** `Web application`
   - **Name:** `Ev Butcesi Web`
   - **Authorized JavaScript origins** → **Add URI** → `https://KULLANICIADIN.github.io` *(sondaki `/ev-butcesi` olmadan, sadece bu kadar)*
   - **Authorized redirect URIs** → **Add URI** → Supabase'den kopyaladığın **Callback URL**
   - **Create**
3. Çıkan pencerede **Client ID** ve **Client secret** var. 🔴 Client secret gizlidir.

### 3.4 Supabase'e bağla
1. Supabase'deki Google sekmesine dön:
   - **Enable Sign in with Google:** aç
   - **Client ID** → yapıştır
   - **Client Secret** → yapıştır
   - **Save**
2. Client secret'ı başka hiçbir yere yazma. Bu pencereyi kapatınca bir daha göstermeyebilir, sorun değil; gerekirse Google'da yenisini oluşturursun.

### 3.5 Uygulamayı "yayına" al
1. Google'da **Google Auth Platform → Audience** → **Publish app** → onayla.
2. Durum **In production** olmalı. *Bunu yapmazsan sadece "Test users" listesine elle eklediğin kişiler girebilir.*

---

## 4. Dene

1. Telefonda SİTE ADRESİ'ni aç. *(Yeni sürüm görünmüyorsa: bilgisayarda Option + Cmd + R, telefonda sekmeyi kapatıp tekrar aç.)*
2. **Google ile devam et** → hesabını seç → uygulama açılmalı. İlk girişte boş bir bütçe oluşur.
   - Bu tarayıcıda daha önce girdiğin veriler varsa "hesabına taşınsın mı?" diye sorar.
3. Üstte sağda **☁ Kaydedildi** yazısı görünecek. Telefonda bir harcama gir, bilgisayarda aç: aynı harcamayı görmelisin.
4. **Telefona uygulama gibi ekle:**
   - **iPhone (Safari):** alttaki Paylaş butonu → **Ana Ekrana Ekle**
   - **Android (Chrome):** sağ üstte ⋮ → **Ana ekrana ekle** / **Uygulamayı yükle**

### Annenle ortak bütçe
1. Sen: **Ayarlar → Davet kodu oluştur** → `ABCD-1234-EF56` gibi bir kod çıkar (7 gün geçerli, tek kullanımlık).
2. Annen: kendi Google hesabıyla girer → **Ayarlar → Bir davet koduyla katıl** → kodu yazar → **Koda katıl**.
3. Artık ikiniz aynı bütçeyi görüyorsunuz. Herkesin kendi bütçesi de durur, **Ayarlar → Bütçe değiştir**'den geçilir.

---

## 5. Güvenlik kontrol listesi ✅

- [ ] `js/config.js`'te sadece **publishable** anahtar var, `sb_secret_` yok.
- [ ] GitHub, Google ve Supabase hesaplarında **iki adımlı doğrulama** açık.
- [ ] Supabase **Security Advisor**'da kırmızı uyarı yok.
- [ ] **Kendi testin:** İkinci bir Google hesabıyla gir. Kendi bütçeni göremediğini, sadece boş bir bütçe açıldığını gör.
- [ ] Google'da uygulama **In production**.
- [ ] Ara ara **Ayarlar → Yedeği indir**. Supabase'in ücretsiz planında otomatik yedek yok.

### Bilmen gereken sınırlar
- **Supabase ücretsiz planı, 7 gün boyunca kimse kullanmazsa projeyi duraklatır.** Duraklatmadan önce e-posta gelir. Duraklatılırsa Supabase panelinden **Restore** ile geri açarsın, veriler silinmez.
- Kayıt herkese açık: Linki bulan herkes hesap açabilir **ama sadece kendi boş bütçesini görür.** Linki yayma. İleride istersen kaydı kapatmak tek ayar: **Authentication → Sign In / Providers → Allow new users to sign up**.
- Aynı bütçeyi iki kişi **aynı anda** düzenlerse ikinci kaydeden "başka cihazda değişiklik yapıldı" uyarısı alır, en güncel hal yüklenir ve son değişikliğini tekrar yapar. Hiçbir veri sessizce ezilmez. Harcamalar ayrı ayrı kaydedildiği için harcama eklerken bu sorun hiç yaşanmaz.

---

## 6. Sorun çözme

| Gördüğün | Sebebi | Çözüm |
|---|---|---|
| Google'da **redirect_uri_mismatch** | Google'a yazdığın Callback URL, Supabase'dekiyle birebir aynı değil | 3.3'teki adresi tekrar kopyala-yapıştır, sonunda boşluk ya da `/` farkı olmasın |
| Google'da **origin_mismatch** | JavaScript origin yanlış | `https://KULLANICIADIN.github.io` (sonunda `/ev-butcesi` yok) |
| Girişten sonra **localhost** gibi garip bir adrese gidiyor | Supabase Site URL yanlış | 2.4'teki Site URL'yi SİTE ADRESİ yap |
| "E-postanı henüz doğrulamadın" | E-posta onayı bekleniyor | Gelen kutusu / spam'deki bağlantıya tıkla |
| "permission denied" / veriler yüklenemedi | SQL çalıştırılmamış ya da hata vermiş | 2.2'yi tekrar yap (iki kez çalıştırmak zarar vermez) |
| Girişte "GİZLİ anahtar yazılmış" | config.js'e secret key yazılmış | Supabase'de o anahtarı **hemen yenile (rotate)**, config.js'e publishable anahtarı yaz |
| Uygulama eski görünüyor | Tarayıcı önbelleği | Option + Cmd + R (Mac), telefonda sekmeyi kapatıp aç |

---

## 7. Güncelleme yaparken

- Yeni dosyaları GitHub'a aynı şekilde yükle (**Add file → Upload files**). Aynı isimli dosyaların üstüne yazılır.
- `js/config.js`'i **üstüne yazma**, içinde senin anahtarların var. Yeni sürümle gelen config.js boştur.
- `supabase/schema.sql` değişirse SQL Editor'da tekrar çalıştır. Mevcut verilere dokunmaz.
