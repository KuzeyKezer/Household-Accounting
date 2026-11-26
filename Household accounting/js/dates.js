// dates.js — month math and the budget period (calendar month or salary day → salary day)
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: nothing (reads `data.period` only when called)

// ================== DATES ==================
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
let CUR_YM = todayStr().slice(0, 7); // current budget period (recomputed once data is loaded)
const ymIndex = (ym) => { const [y, m] = ym.split("-").map(Number); return y * 12 + m - 1; };
const ymFromIndex = (i) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
const addMonths = (ym, k) => ymFromIndex(ymIndex(ym) + k);
const monthDiff = (a, b) => ymIndex(b) - ymIndex(a);
const ymLabel = (ym) => { const i = ymIndex(ym); return `${MONTHS[i % 12]} ${Math.floor(i / 12)}`; };
const ymShort = (ym) => { const i = ymIndex(ym); return MONTHS[i % 12].slice(0, 3); };
let viewYM = CUR_YM; // month being viewed (not saved)
const daysIn = (y, m) => new Date(y, m, 0).getDate(); // m: 1-12
const ymParts = (ym) => ym.split("-").map(Number);

// ---- budget period: calendar month, or from salary day to the day before next salary ----
const startDay = () => (data.period && data.period.mode === "salary" ? data.period.day : 1);
function periodStart(ym) {
  const [y, m] = ymParts(ym);
  return new Date(y, m - 1, Math.min(startDay(), daysIn(y, m)));
}
function periodEnd(ym) {
  const next = periodStart(addMonths(ym, 1));
  return new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
}
// which budget period a YYYY-MM-DD date belongs to
function periodOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ym = `${y}-${pad(m)}`;
  return d >= Math.min(startDay(), daysIn(y, m)) ? ym : addMonths(ym, -1);
}
const dateStr = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const fmtDay = (dt) => `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
function periodRangeLabel(ym) {
  const a = periodStart(ym), b = periodEnd(ym);
  return a.getFullYear() === b.getFullYear()
    ? `${fmtDay(a)} – ${fmtDay(b)} ${b.getFullYear()}`
    : `${fmtDay(a)} ${a.getFullYear()} – ${fmtDay(b)} ${b.getFullYear()}`;
}
// change period settings; shift installment anchors so paid counts stay the same
function setPeriod(mode, day) {
  const old = CUR_YM;
  data.period = { mode, day: Math.min(31, Math.max(1, Math.round(day || 1))) };
  CUR_YM = periodOf(todayStr());
  const delta = monthDiff(old, CUR_YM);
  if (delta) {
    data.cards.forEach((c) => c.purchases.forEach((p) => (p.asOf = addMonths(p.asOf, delta))));
    data.loans.forEach((l) => (l.asOf = addMonths(l.asOf, delta)));
    viewYM = addMonths(viewYM, delta);
  }
}
