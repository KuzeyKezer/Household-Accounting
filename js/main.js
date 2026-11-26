// main.js — startup: load saved data, wire top-level buttons, first render
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: all other files, loaded last

// ================== TABS ==================
const TAB_KEY = "ev-butcesi-tab";
function showTab(name) {
  document.querySelectorAll(".tab-page").forEach((p) => (p.hidden = p.dataset.page !== name));
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
  window.scrollTo({ top: 0 });
}

// ================== LOAD ==================
// signed-in mode starts empty and is filled by cloud.js after login
let data = window.Cloud && Cloud.enabled ? emptyData(defaultData()) : loadData();
CUR_YM = periodOf(todayStr());
viewYM = CUR_YM;

// ================== INIT ==================
document.getElementById("add-account").addEventListener("click", () => {
  const a = { id: uid(), label: "Yeni hesap", balance: 0, asOf: null };
  data.accounts.push(a);
  render(); update(); focusLabel(a.id);
});
document.getElementById("add-income").addEventListener("click", () => {
  const n = { ...item("Yeni gelir", 0), kind: "net" };
  data.incomes.push(n);
  render(); update(); focusLabel(n.id);
});
document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Gelirler, bütçe tutarları, harcamalar, kartlar, krediler ve hedefler silinecek. Faiz oranları ve bütçe dönemi ayarın kalacak."
    + (Cloud.active ? " Bu bütçeyi ortak kullanan herkes için silinir." : "") + " Bu geri alınamaz. Devam edilsin mi?")) return;
  data = emptyData(data);
  if (Cloud.active) Cloud.replaceAll().catch((e) => alert("Sunucuda sıfırlanamadı: " + (e.message || e)));
  CUR_YM = periodOf(todayStr());
  viewYM = CUR_YM;
  openAdv.clear();
  render(); update();
});
const goMonth = (ym) => { viewYM = ym; showAllExpenses = false; render(); update(); };
document.getElementById("month-prev").addEventListener("click", () => goMonth(addMonths(viewYM, -1)));
document.getElementById("month-next").addEventListener("click", () => goMonth(addMonths(viewYM, 1)));
document.getElementById("month-today").addEventListener("click", () => goMonth(CUR_YM));
const setAllOpen = (open) => document.querySelectorAll("details.category").forEach((d) => (d.open = open));
document.getElementById("expand-all").addEventListener("click", () => setAllOpen(true));
document.getElementById("collapse-all").addEventListener("click", () => setAllOpen(false));

document.getElementById("exp-add").addEventListener("click", addExpense);
expPay.addEventListener("change", syncInstallmentField);
expItem.addEventListener("change", prefillPayFromItem);
expInst.addEventListener("input", () => { expInst.value = expInst.value.replace(/[^\d]/g, "").slice(0, 2); });
expInst.addEventListener("keydown", (e) => { if (e.key === "Enter") addExpense(); });
[expAmount, expNote].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") addExpense(); }));
expAmount.addEventListener("input", () => {
  const clean = expAmount.value.replace(/[^\d]/g, "");
  if (clean !== expAmount.value) expAmount.value = clean;
});
expAmount.addEventListener("blur", () => {
  const v = Number(expAmount.value.replace(/[^\d]/g, ""));
  expAmount.value = v ? fmtNum(v) : "";
});
expAmount.addEventListener("focus", () => { expAmount.value = expAmount.value.replace(/[^\d]/g, ""); });

render();
update();

document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.getElementById("quick-add").addEventListener("click", () => {
  showTab("expenses");
  expAmount.focus();
});
let startTab = "overview";
try { startTab = localStorage.getItem(TAB_KEY) || "overview"; } catch (e) {}
showTab(document.querySelector(`.tab-page[data-page="${startTab}"]`) ? startTab : "overview");

// backup
document.getElementById("backup-download").addEventListener("click", downloadBackup);
document.getElementById("backup-file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) restoreBackup(f);
  e.target.value = "";
});

// signed-in mode: show the login screen; local mode: nothing to do
if (Cloud.enabled) Cloud.start();
