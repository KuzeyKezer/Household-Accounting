// finance.js — installments, credit cards, loans, savings goals, expense lookups
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: dates.js, state.js

// ================== CALCULATIONS ==================
// Where an installment plan stands in month ym. "paid" was entered as of month asOf.
function schedule(n, paid, asOf, ym) {
  n = Math.max(1, Math.round(n || 1));
  const p0 = Math.min(n, Math.max(0, Math.round(paid || 0)));
  const raw = p0 + monthDiff(asOf || CUR_YM, ym);
  const started = raw >= 0;
  const paidAt = Math.min(n, Math.max(0, raw));
  return { n, paidAt, rem: n - paidAt, started, lastYM: addMonths(asOf || CUR_YM, n - p0 - 1), finished: p0 >= n };
}
const annuity = (P, eff, n) => (!P ? 0 : eff > 0 ? (P * eff) / (1 - Math.pow(1 + eff, -n)) : P / n);
// paid count shown in inputs = as of this month
const paidNow = (o, n) => schedule(n, o.paid, o.asOf, CUR_YM).paidAt;

function cardRate(totalDebt) {
  const [a, b, c] = data.rates.card;
  return totalDebt < 30000 ? a : totalDebt <= 180000 ? b : c;
}
// Period debt used to pick the TCMB tier (this month): balance + active installment principal
function cardBase(card) {
  return card.balance + sum(card.purchases.map((l) => {
    const s = schedule(l.n, l.paid, l.asOf, CUR_YM);
    return s.started && s.rem > 0 ? l.amount / s.n : 0;
  }));
}
function defaultLineRate(line, card) {
  return line.type === "nakit" ? data.rates.cash : cardRate(cardBase(card));
}
// Bank-style installment: interest-free = amount / n; interest-bearing = annuity on
// monthly rate × (1 + KKDF + BSMV)
function lineCalc(line, card, ym = viewYM) {
  const s = schedule(line.n, line.paid, line.asOf, ym);
  const hasInterest = line.type !== "faizsiz";
  const rate = hasInterest ? (line.rate ?? defaultLineRate(line, card)) : 0;
  const m = annuity(line.amount || 0, (rate / 100) * taxMult(), s.n);
  const active = s.started && s.rem > 0 ? m : 0;
  return { ...s, rate, hasInterest, m, total: m * s.n, cost: m * s.n - (line.amount || 0),
    remaining: m * s.rem, active };
}
function cardCalc(card, ym = viewYM) {
  const lines = card.purchases.map((l) => lineCalc(l, card, ym));
  const inst = sum(lines.map((x) => x.active));
  const carried = Math.max(0, card.balance - card.payment);
  const rate = cardRate(cardBase(card));
  const interest = carried * (rate / 100) * taxMult();
  return { lines, inst, carried, rate, interest,
    remainingDebt: sum(lines.map((x) => x.remaining)), monthly: inst + card.payment };
}
function loanCalc(loan, ym = viewYM) {
  const s = schedule(loan.term, loan.paid, loan.asOf, ym);
  let m, eff = 0;
  if (loan.mode === "direct") m = loan.monthly || 0;
  else {
    eff = (loan.rate / 100) * (loan.type === "konut" ? 1 : taxMult());
    m = annuity(loan.principal || 0, eff, s.n);
  }
  const active = s.started && s.rem > 0 ? m : 0;
  return { ...s, m, monthly: active, total: m * s.n, cost: m * s.n - (loan.principal || 0),
    eff: eff * 100, remaining: m * s.rem };
}
// An installment line linked to a plan item (e.g. Kasko bought on the card in 6 installments)
// is the realisation of that item: the item's plan already counts it in the budget and cash flow.
const isLinked = (l) => !!(l.itemId && findItem(l.itemId));
const debtTotal = (ym = viewYM) =>
  sum(data.cards.map((c) => cardCalc(c, ym).lines.filter((x, i) => !isLinked(c.purchases[i])).reduce((a, x) => a + x.active, 0) + (c.payment || 0)))
  + sum(data.loans.map((l) => loanCalc(l, ym).monthly));
// installments for the calendar (all real obligations); excludeLinked for the cash flow
function installmentsAt(ym, excludeLinked = false) {
  const parts = [];
  data.cards.forEach((c) => c.purchases.forEach((l) => {
    if (excludeLinked && isLinked(l)) return;
    const v = lineCalc(l, c, ym).active;
    if (v > 0) parts.push({ label: `${l.label} (${c.label})`, v });
  }));
  data.loans.forEach((l) => { const v = loanCalc(l, ym).monthly; if (v > 0) parts.push({ label: l.label, v }); });
  return { total: sum(parts.map((p) => p.v)), parts };
}

function goalCalc(g, expenseBase) {
  const target = g.kind === "emergency" ? g.coverMonths * expenseBase : g.target;
  const left = Math.max(0, target - g.saved);
  const pct = target > 0 ? Math.min(100, (g.saved / target) * 100) : 0;
  const months = left <= 0 ? 0 : g.monthly > 0 ? Math.ceil(left / g.monthly) : null;
  return { target, left, pct, months, eta: months ? addMonths(CUR_YM, months) : null };
}

// single-payment card spending recorded as expenses in period ym → billed on the next statement
const cardSpendIn = (card, ym) => sum(expensesIn(ym).filter((e) => e.pay === card.id).map((e) => e.amount));

// payment method of a plan item: its own, else the default; a deleted card falls back to cash
function payOf(it) {
  const p = it.pay || data.defaultPay || "cash";
  return p === "cash" || data.cards.some((c) => c.id === p) ? p : "cash";
}
const itemInst = (it) => (payOf(it) !== "cash" && monthsOf(it) > 1 ? Math.max(1, Math.round(it.inst || 1)) : 1);

// How much of a plan item is actually paid out in period ym.
// Card: billed on the next statement (+1 month), split over the bank installments.
function itemCashAt(it, ym) {
  const n = monthsOf(it);
  if (n === 1) return { v: it.value, due: null };
  if (!it.payMonth) return { v: it.value / n, due: null }; // no payment month: spread evenly
  const card = payOf(it) !== "cash";
  const k = itemInst(it);
  const shift = card ? 1 : 0;
  for (let j = 0; j < k; j++) {
    const occ = addMonths(ym, -(shift + j)); // month the purchase would have happened
    if ((((monthNo(occ) - (it.payMonth - 1)) % n) + n) % n === 0) {
      return { v: it.value / k, due: k > 1 ? `${it.label} (${j + 1}/${k}. taksit)` : it.label };
    }
  }
  return { v: 0, due: null };
}

// Cash flow for one period: real timing (yearly items when paid, card items on the next statement,
// bank installments, loans/card installments not already covered by a plan item, savings)
function cashflowAt(ym) {
  const income = sum(data.incomes.map((i) => incomeFor(i, ym)));
  let regular = 0;
  const due = [];
  const byCard = {};
  data.categories.forEach((c) => c.items.forEach((it) => {
    const x = itemCashAt(it, ym);
    regular += x.v;
    if (x.due && x.v) due.push({ label: x.due, v: x.v });
    const p = payOf(it);
    if (p !== "cash") byCard[p] = (byCard[p] || 0) + x.v;
  }));
  const inst = installmentsAt(ym, true).total + (ym === CUR_YM ? sum(data.cards.map((c) => c.payment || 0)) : 0);
  const savings = sum(data.goals.map((g) => g.monthly || 0));
  const left = income - regular - inst - savings;
  return { ym, income, regular, inst, savings, due, left, byCard };
}

const cashOnHand = () => sum((data.accounts || []).map((a) => a.balance || 0));
// 12 periods of cash flow from now, each with the projected end-of-period balance
// İlk ay: bugünkü tahmini paradan başlar, dönemin kalan günlerindeki hareketler eklenir.
function projection() {
  const now = cashToday();
  const today = parseDay(todayStr()), end = atNoon(periodEnd(CUR_YM));
  const rest = sum(periodEvents(CUR_YM).map((e) => eventShare(e, CUR_YM, today, end)));
  let bal = now.value + rest;
  return Array.from({ length: 12 }, (_, k) => {
    const m = cashflowAt(addMonths(CUR_YM, k));
    if (k > 0) bal += m.left;
    return { ...m, balance: bal };
  });
}

const expensesIn = (ym) => data.expenses.filter((e) => periodOf(e.date) === ym);
function findItem(id) {
  for (const c of data.categories) {
    const it = c.items.find((x) => x.id === id);
    if (it) return { cat: c, it };
  }
  return null;
}

// ================== GÜNLÜK NAKİT (ödeme günleri) ==================
// Bir kalemin / gelirin / kartın / kredinin ayın kaçında ödendiği (1–31). Yoksa null.
const dayOf = (o, key = "payDay") => { const d = Math.round(Number(o && o[key])); return d >= 1 && d <= 31 ? d : null; };
// "her ayın d'si" bütçe dönemi ym içinde hangi tarihe denk geliyor (maaş günü dönemlerinde iki aya yayılır)
function dayInPeriod(ym, d) {
  const s = periodStart(ym), e = periodEnd(ym);
  for (const base of [s, e]) {
    const y = base.getFullYear(), m = base.getMonth() + 1;
    const x = new Date(y, m - 1, Math.min(d, daysIn(y, m)));
    if (x >= s && x <= e) return x;
  }
  return s;
}
const incomeDay = (inc) => dayOf(inc) || startDay();
// Dönem ym'deki bütün para hareketleri, tarihleriyle. v > 0 giriş, v < 0 çıkış.
// spread: gün girilmemiş nakit kalem, dönem boyunca gün gün harcanıyor sayılır.
// Toplamı cashflowAt(ym).left ile aynıdır.
function periodEvents(ym) {
  const ev = [];
  const start = periodStart(ym);
  data.incomes.forEach((i) => {
    const v = incomeFor(i, ym);
    if (v) ev.push({ date: dayInPeriod(ym, incomeDay(i)), label: i.label, v, kind: "income", dated: !!dayOf(i) });
  });
  const firstIncome = ev.length ? ev.reduce((a, b) => (b.date < a.date ? b : a)).date : start;
  const savings = sum(data.goals.map((g) => g.monthly || 0));
  if (savings) ev.push({ date: firstIncome, label: "Birikime ayrılan", v: -savings, kind: "savings", dated: true });
  const byCard = {};
  data.categories.forEach((c) => c.items.forEach((it) => {
    const x = itemCashAt(it, ym);
    if (!x.v) return;
    const p = payOf(it);
    if (p !== "cash") { byCard[p] = (byCard[p] || 0) + x.v; return; }
    const d = dayOf(it);
    ev.push(d ? { date: dayInPeriod(ym, d), label: x.due || it.label, v: -x.v, kind: "item", itemId: it.id, dated: true }
              : { date: null, label: it.label, v: -x.v, kind: "item", itemId: it.id, spread: true });
  }));
  data.cards.forEach((c) => {
    const lines = sum(c.purchases.filter((l) => !isLinked(l)).map((l) => lineCalc(l, c, ym).active));
    const v = (byCard[c.id] || 0) + lines + (ym === CUR_YM ? c.payment || 0 : 0);
    const d = dayOf(c, "dueDay");
    if (v) ev.push({ date: d ? dayInPeriod(ym, d) : start, label: `💳 ${c.label} ekstresi`, v: -v, kind: "card", dated: !!d });
  });
  data.loans.forEach((l) => {
    const v = loanCalc(l, ym).monthly;
    const d = dayOf(l);
    if (v) ev.push({ date: d ? dayInPeriod(ym, d) : start, label: `${l.label} taksiti`, v: -v, kind: "loan", dated: !!d });
  });
  return ev;
}
const dayMs = 864e5;
const atNoon = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12);
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
// (from, to] aralığında, dönem ym'nin bir hareketinden düşen kısım
function eventShare(e, ym, from, to) {
  if (!e.spread) { const t = atNoon(e.date); return t > from && t <= to ? e.v : 0; }
  const s = atNoon(periodStart(ym)), en = atNoon(periodEnd(ym));
  const days = Math.round((en - s) / dayMs) + 1;
  // gün gün: dönemin her günü 1/days kadar
  const a = Math.max(from.getTime(), s.getTime() - dayMs), b = Math.min(to.getTime(), en.getTime());
  const n = Math.max(0, Math.round((b - a) / dayMs));
  return (e.v * n) / days;
}

// Bugün elinde olması gereken para: hesaplara yazdığın bakiye, o günden bu yana
// gelen gelirler ve ödeme günü geçen ödemelerle güncellenir. Bir kaleme nakit harcama
// girdiysen, plan ile girdiğinden hangisi büyükse o düşülür (iki kere düşülmez).
function cashToday() {
  const written = cashOnHand();
  const dates = (data.accounts || []).map((a) => a.asOf).filter(Boolean).sort();
  if (!dates.length) return { value: written, written, ref: null, moves: [] };
  const ref = dates[dates.length - 1];
  const from = parseDay(ref), to = parseDay(todayStr());
  if (to <= from) return { value: written, written, ref, moves: [] };
  const moves = {};
  const add = (key, label, v) => { if (!v) return; (moves[key] = moves[key] || { label, v: 0 }).v += v; };
  const planByItem = {};
  let ym = periodOf(ref);
  for (let k = 0; k < 4 && monthDiff(ym, CUR_YM) >= 0; k++, ym = addMonths(ym, 1)) {
    periodEvents(ym).forEach((e) => {
      const v = eventShare(e, ym, from, to);
      if (e.kind === "item") planByItem[e.itemId] = (planByItem[e.itemId] || 0) + v;
      else add(e.kind + ":" + e.label, e.label, v);
    });
  }
  // gerçek nakit harcamalar (bakiyeyi yazdığın günden sonra, bugüne kadar)
  const actualByItem = {};
  data.expenses.forEach((x) => {
    if ((x.pay || "cash") !== "cash") return;
    const t = parseDay(x.date);
    if (t > from && t <= to) actualByItem[x.itemId || "?"] = (actualByItem[x.itemId || "?"] || 0) + x.amount;
  });
  const ids = new Set([...Object.keys(planByItem), ...Object.keys(actualByItem)]);
  ids.forEach((id) => {
    const plan = -(planByItem[id] || 0), act = actualByItem[id] || 0;
    const f = findItem(id);
    add("item:" + id, f ? f.it.label : "Diğer harcamalar", -Math.max(plan, act));
  });
  const list = Object.values(moves).filter((m) => Math.abs(m.v) >= 0.5);
  return { value: written + sum(list.map((m) => m.v)), written, ref, moves: list.sort((a, b) => a.v - b.v) };
}
// Bugünden dönem sonuna kadar kalan tarihli hareketler (yaklaşan ödemeler)
function upcomingEvents(ym = CUR_YM) {
  const today = parseDay(todayStr());
  return periodEvents(ym).filter((e) => !e.spread && atNoon(e.date) > today)
    .sort((a, b) => a.date - b.date);
}
