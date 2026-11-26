// backup.js — download everything as a .json file / restore from one (works in both modes)
// Needs: everything above main.js.

const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

function downloadBackup() {
  const payload = { app: "ev-butcesi", format: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ev-butcesi-yedek-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function restoreBackup(file) {
  const msg = document.getElementById("backup-msg");
  msg.className = "settings-help";
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Dosya çok büyük (en fazla 5 MB).");
    const obj = JSON.parse(await file.text());
    if (!obj || obj.app !== "ev-butcesi" || !obj.data || !Array.isArray(obj.data.categories)) {
      throw new Error("Bu dosya bir Ev Bütçesi yedeği değil.");
    }
    const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString("tr-TR") : "bilinmeyen tarih";
    if (!confirm(`${when} tarihli yedek yüklenecek. Şu anki bütün veriler (${Cloud.active ? "hesabındaki bu bütçe dahil, ortak kullananlar için de" : "bu tarayıcıdaki"}) yedektekilerle değiştirilecek. Devam?`)) return;
    const d = migrate({ ...defaultData(), ...obj.data });
    d.expenses = (obj.data.expenses || [])
      .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number(e.amount) > 0)
      .map((e) => ({ id: newId(), date: e.date, itemId: e.itemId || null, amount: Number(e.amount),
        note: String(e.note || "").slice(0, 200), pay: e.pay || "cash" }));
    data = d;
    CUR_YM = periodOf(todayStr());
    viewYM = CUR_YM;
    openAdv.clear();
    render(); update();
    if (Cloud.active) await Cloud.replaceAll();
    msg.className = "settings-help ok";
    msg.textContent = "Yedek yüklendi.";
  } catch (err) {
    msg.className = "settings-help err";
    msg.textContent = "Yüklenemedi: " + (err.message || err);
  }
}
