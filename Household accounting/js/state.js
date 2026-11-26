// state.js — data model: defaults, constants, load / migrate / save to this browser
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: dates.js

// ================== DATA ==================
const uid = () => Math.random().toString(36).slice(2, 9);
// months: this amount covers / is paid every N months (1 = monthly, 12 = yearly)
const item = (label, value = 0, months = 1) => ({ id: uid(), label, value, months });
// credit card line: rate null = use the default for its type; paid is as of month asOf
const purchase = (label, type, amount, n, paid) =>
  ({ id: uid(), label, type, amount, n, paid, asOf: CUR_YM, rate: null });
const CARD_LINE_TYPES = {
  faizsiz: "Taksitli alışveriş (faizsiz)",
  sonradan: "Sonradan taksitlendirme (faizli)",
  nakit: "Taksitli nakit avans (faizli)"
};

function defaultData() {
  return {
    incomes: [{ ...item("Maaş", 100000), kind: "net" }, { ...item("Ek gelir", 0), kind: "net" }],
    period: { mode: "calendar", day: 1 },
    goals: [
      { id: uid(), label: "Acil durum fonu", kind: "emergency", coverMonths: 6, target: 0, saved: 0, monthly: 5000 },
      { id: uid(), label: "Hedef birikim", kind: "custom", coverMonths: 6, target: 100000, saved: 0, monthly: 5000 }
    ],
    categories: [
      { id: uid(), label: "Konut", color: "#3949ab", items: [
        item("Kira", 0), item("Aidat", 1500), item("Ev bakım / onarım", 1000)
      ]},
      { id: uid(), label: "Faturalar", color: "#9334e6", items: [
        item("Elektrik", 2500), item("Doğalgaz", 4000), item("Su", 800),
        item("İnternet", 900), item("Cep telefonu", 1200), item("Dijital abonelikler", 600)
      ]},
      { id: uid(), label: "Mutfak ve Market", color: "#1a73e8", items: [
        item("Market alışverişi", 15000), item("Pazar (meyve, sebze)", 3000),
        item("Dışarıda yemek / paket servis", 3000), item("Temizlik ve ev ürünleri", 1500)
      ]},
      { id: uid(), label: "Ulaşım ve Araç", color: "#f9ab00", items: [
        item("Yakıt", 6000), item("Toplu taşıma", 0), item("Araç bakım", 12000, 12),
        item("Otopark / köprü / otoyol", 500), { ...item("MTV", 4000, 6), payMonth: 1 }
      ]},
      { id: uid(), label: "Sigortalar", color: "#12b5cb", items: [
        { ...item("Trafik sigortası", 9000, 12), payMonth: 3 }, { ...item("Kasko", 30000, 12), payMonth: 3 },
        item("Sağlık sigortası", 0), { ...item("DASK / konut sigortası", 2000, 12), payMonth: 9 }
      ]},
      { id: uid(), label: "Kişisel ve Sağlık", color: "#e52592", items: [
        item("Kişisel bakım", 1000), item("Giyim", 2000), item("Sağlık / ilaç", 500),
        item("Spor salonu", 0), item("Sigara", 0)
      ]},
      { id: uid(), label: "Eğlence ve Sosyal", color: "#34a853", items: [
        item("Eğlence bütçesi", 3000), item("Hobiler", 1000),
        { ...item("Tatil", 30000, 12), payMonth: 7 }, item("Hediyeler", 1000)
      ]},
      { id: uid(), label: "Eğitim", color: "#795548", items: [
        item("Okul / kurs", 0), item("Kitap / kırtasiye", 500)
      ]},
      { id: uid(), label: "Destek ve Bağış", color: "#e8710a", items: [
        item("Aile desteği", 0), item("Desteklenen kişi / kurum", 0), item("Bağış", 0)
      ]},
      { id: uid(), label: "Evcil Hayvan", color: "#7cb342", items: [
        item("Mama ve kum", 1000), item("Veteriner", 3000, 12)
      ]}
    ],
    cards: [
      { id: uid(), label: "Kredi kartı 1", balance: 0, payment: 0, purchases: [
        purchase("Telefon", "faizsiz", 36000, 12, 0)
      ]}
    ],
    loans: [
      { id: uid(), label: "İhtiyaç kredisi", type: "ihtiyac", mode: "calc",
        principal: 100000, rate: 3.39, term: 12, monthly: 0, paid: 0, asOf: CUR_YM }
    ],
    expenses: [],
    // money on hand right now (cash, bank accounts); asOf = date the balance was last written
    accounts: [
      { id: uid(), label: "Nakit", balance: 0, asOf: null },
      { id: uid(), label: "Banka hesabı", balance: 0, asOf: null }
    ],
    defaultPay: "cash", // items without their own payment method use this
    rates: { card: [3.25, 3.75, 4.25], cash: 4.25, loan: 3.39, kkdf: 15, bsmv: 15 }
  };
}

const DEBT_COLOR = "#d93025";
const GOAL_COLOR = "#00897b";
const FREE_COLOR = "#cfd8dc";
const STORAGE_KEY = "ev-butcesi-v3";
const LOAN_TYPES = { ihtiyac: "İhtiyaç", tasit: "Taşıt", konut: "Konut" };


// "Her şeyi sıfırla": blank budget. Keeps only what the calculations depend on
// (interest rates & taxes, budget period). Category/item names come back as an empty template.
function emptyData(keep) {
  const d = defaultData();
  d.incomes = [{ ...item("Maaş", 0), kind: "net", changes: [] }];
  d.goals = [];
  d.categories.forEach((c) => (c.items = c.items.map((it) => item(it.label, 0))));
  d.cards = [];
  d.loans = [];
  d.expenses = [];
  d.defaultPay = "cash";
  d.rates = JSON.parse(JSON.stringify(keep.rates));
  d.period = { ...keep.period };
  return d;
}

// Data can come from another household member (cloud) or a backup file: never trust its shape.
// Labels are always rendered escaped; colors go into style attributes, so they must be plain hex.
function sanitize(d) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const str = (v, n = 80) => String(v == null ? "" : v).slice(0, n);
  const HEX = /^#[0-9a-f]{3,8}$/i;
  // ids end up inside HTML attributes (data-ref): only allow plain characters
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const fixId = (o) => { if (!ID.test(String(o.id || ""))) o.id = uid(); };
  ["incomes", "goals", "categories", "cards", "loans", "accounts", "expenses"].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
  ["incomes", "goals", "categories", "cards", "loans", "accounts"].forEach((k) => d[k].forEach(fixId));
  d.categories.forEach((c) => c.items.forEach(fixId));
  d.cards.forEach((c) => (Array.isArray(c.purchases) ? c.purchases : []).forEach(fixId));
  d.expenses = d.expenses.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)));
  d.categories.forEach((c) => {
    c.label = str(c.label) || "Kategori";
    if (!HEX.test(c.color || "")) c.color = "#9aa0a6";
    if (!Array.isArray(c.items)) c.items = [];
    c.items.forEach((it) => { it.label = str(it.label) || "Kalem"; it.value = num(it.value); });
  });
  d.incomes.forEach((i) => { i.label = str(i.label) || "Gelir"; i.value = num(i.value); });
  d.accounts.forEach((a) => { a.label = str(a.label) || "Hesap"; a.balance = num(a.balance); });
  d.goals.forEach((g) => { g.label = str(g.label) || "Hedef"; g.monthly = num(g.monthly); g.saved = num(g.saved); g.target = num(g.target); });
  d.cards.forEach((c) => { c.label = str(c.label) || "Kart"; c.balance = num(c.balance); c.payment = num(c.payment);
    if (!Array.isArray(c.purchases)) c.purchases = [];
    c.purchases.forEach((p) => { p.label = str(p.label) || "Taksit"; p.amount = num(p.amount); }); });
  d.loans.forEach((l) => { l.label = str(l.label) || "Kredi"; });
  d.expenses.forEach((e) => { e.amount = num(e.amount); e.note = str(e.note, 200); });
}

// ================== STORAGE ==================
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // older saves had no goals: add them empty so the budget doesn't change on its own
      if (!saved.goals) saved.goals = defaultData().goals.map((g) => ({ ...g, monthly: 0 }));
      return migrate({ ...defaultData(), ...saved });
    }
  } catch (e) { console.error("Kayıtlı veri okunamadı:", e); }
  return defaultData();
}
// bring older saved data up to the current shape
function migrate(d) {
  d.rates = { ...defaultData().rates, ...d.rates };
  d.period = d.period || { mode: "calendar", day: 1 };
  d.incomes.forEach((i) => { i.kind = i.kind || "net"; i.changes = i.changes || []; });
  d.expenses = d.expenses || [];
  d.expenses.forEach((e) => (e.pay = e.pay || "cash"));
  d.defaultPay = d.defaultPay || "cash";
  d.accounts = d.accounts || defaultData().accounts;
  sanitize(d);
  d.cards.forEach((card) => {
    if (!Array.isArray(card.purchases)) {
      card.purchases = card.installments > 0
        ? [purchase("Mevcut taksitler", "faizsiz", card.installments, 1, 0)]
        : [];
    }
    delete card.installments;
    card.purchases.forEach((p) => (p.asOf = p.asOf || CUR_YM));
  });
  d.loans.forEach((l) => { l.paid = l.paid || 0; l.asOf = l.asOf || CUR_YM; l.term = l.term || 12; });
  d.categories.forEach((c) => c.items.forEach((it) => { it.months = monthsOf(it); delete it.period; }));
  return d;
}
function saveData() {
  // signed-in mode: the cloud module saves (debounced); this browser's local copy is left alone
  if (window.Cloud && Cloud.enabled) { Cloud.scheduleSave(); return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}
