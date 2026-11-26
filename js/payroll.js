// payroll.js — gross → net salary (Türkiye 2026: cumulative income tax, SGK, damga, asgari ücret istisnası) and income per month
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: dates.js, state.js

// ================== PAYROLL (brüt → net, Türkiye 2026) ==================
// Income tax is charged on the CUMULATIVE yearly base, so as the year goes on the
// salary climbs into higher brackets and the net falls. It resets every January.
const PAYROLL = {
  year: 2026,
  brackets: [[190000, 0.15], [400000, 0.20], [1500000, 0.27], [5300000, 0.35], [Infinity, 0.40]], // ücret tarifesi
  minGross: 33030,   // brüt asgari ücret (GV + damga istisnası buna göre)
  sgkCap: 297270,    // SGK tavanı
  sgk: 0.14, unemp: 0.01, stamp: 0.00759
};
function taxOn(base) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of PAYROLL.brackets) {
    if (base <= prev) break;
    tax += (Math.min(base, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}
// income amount in effect in month ym (base value, then any raises/changes up to ym)
function valueAt(inc, ym) {
  let v = inc.value || 0;
  [...(inc.changes || [])].sort((x, y) => (x.from < y.from ? -1 : 1))
    .forEach((c) => { if (c.from <= ym) v = c.value || 0; });
  return v;
}
const changeAt = (inc, ym) =>
  [...(inc.changes || [])].filter((c) => c.from <= ym).sort((x, y) => (x.from < y.from ? 1 : -1))[0];
const extrasOf = (salary) => data.incomes.filter((i) => i.kind === "extra" && i.linkTo === (salary ? salary.id : undefined));

// Monthly payroll for one person's salary + the extra payments (ek ders, prim…) linked to it,
// for every month of the calendar year of ym. Tax uses ONE cumulative base for all of them.
// The salary's net is computed as if alone; extras carry the marginal tax they add.
function payrollYear(salary, extras, year) {
  const P = PAYROLL;
  const rate = P.sgk + (salary && salary.memur ? 0 : P.unemp); // memurda işsizlik primi yok
  const minBase = P.minGross * (1 - P.sgk - P.unemp);
  let cumM = 0, cumA = 0, cumMin = 0;
  const out = [];
  for (let m = 0; m < 12; m++) {
    const ym = `${year}-${pad(m + 1)}`;
    const g = salary ? valueAt(salary, ym) : 0;
    const ex = extras.map((e) => ({ e, v: valueAt(e, ym) }));
    const exTotal = sum(ex.map((x) => x.v));
    const dedM = Math.min(g, P.sgkCap) * rate;
    const sgkEx = sum(ex.filter((x) => x.e.sgk).map((x) => x.v));
    const dedE = Math.min(sgkEx, Math.max(0, P.sgkCap - g)) * rate;
    const baseM = g - dedM, baseA = baseM + exTotal - dedE;
    const exempt = taxOn(cumMin + minBase) - taxOn(cumMin); // asgari ücret istisnası (kişi başı bir kez)
    const taxM = Math.max(0, taxOn(cumM + baseM) - taxOn(cumM) - exempt);
    const taxA = Math.max(0, taxOn(cumA + baseA) - taxOn(cumA) - exempt);
    cumM += baseM; cumA += baseA; cumMin += minBase;
    const stampM = Math.max(0, (g - P.minGross) * P.stamp);
    const stampA = Math.max(0, (g + exTotal - P.minGross) * P.stamp);
    const netM = g - dedM - taxM - stampM;
    const netA = g + exTotal - dedM - dedE - taxA - stampA;
    const extraNet = netA - netM;
    const extraNets = {};
    ex.forEach((x) => (extraNets[x.e.id] = exTotal ? (extraNet * x.v) / exTotal : 0));
    out.push({ gross: g, net: netM, incomeTax: taxM, stamp: stampM, sgk: dedM,
      exTotal, extraNet, extraTax: taxA - taxM + (stampA - stampM) + dedE, extraNets });
  }
  return out;
}
const yearOf = (ym) => Number(ym.slice(0, 4));
const monthNo = (ym) => ymIndex(ym) % 12; // 0 = Ocak
function incomeFor(inc, ym = viewYM) {
  if (inc.kind === "gross") return payrollYear(inc, extrasOf(inc), yearOf(ym))[monthNo(ym)].net;
  if (inc.kind === "extra") {
    const sal = data.incomes.find((i) => i.id === inc.linkTo && i.kind === "gross");
    const row = sal ? payrollYear(sal, extrasOf(sal), yearOf(ym))[monthNo(ym)]
      : payrollYear(null, [inc], yearOf(ym))[monthNo(ym)];
    return row.extraNets[inc.id] || 0;
  }
  return valueAt(inc, ym);
}
