// config.js — Supabase bağlantı bilgileri
//
// İkisi de BOŞ bırakılırsa uygulama eskisi gibi sadece bu tarayıcıda çalışır (giriş yok).
// Doldurulursa giriş ekranı açılır ve veriler hesaba kaydedilir.
//
// Bu iki değerin GitHub'da herkese açık durması güvenlidir: Supabase'in kendi belgelerine göre
// "publishable" anahtar tarayıcıda durmak için yapılmıştır; verini koruyan şey veritabanındaki
// RLS kurallarıdır (supabase/schema.sql).
//
// !!! BURAYA ASLA "sb_secret_..." ile başlayan anahtarı ya da eski "service_role" anahtarını YAZMA.
// O anahtar bütün güvenlik kurallarını atlar. Yanlışlıkla yazarsan uygulama çalışmayı reddeder.
window.APP_CONFIG = {
  supabaseUrl: "",  // örnek: "https://abcdefghijklmnop.supabase.co"
  supabaseKey: ""   // örnek: "sb_publishable_xxxxxxxxxxxxxxxxxxxx"
};
