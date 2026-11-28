// summary.js — yönetim paneli için hesaplanmış özet (bulutta budgets.data.ozet olarak saklanır).
// Rakamlar uygulamanın kendi hesaplarından gelir, böylece panel ekrandakiyle birebir aynıdır.
// Zaman damgası yok: aynı veri her zaman aynı özeti verir (gereksiz kayıt tetiklemez).
// Needs: dates.js, state.js, helpers.js, payroll.js, finance.js
function adminSummary() {
  const ym = CUR_YM;
  const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const cardName = (id) => id === "cash" ? "Nakit" : ((data.cards.find((c) => c.id === id) || {}).label || "silinmiş kart");
  const KIND = { net: "Net maaş/gelir", gross: "Brüt maaş", extra: "Ek ödeme" };

  const gelirler = data.incomes.map((i) => ({
    ad: i.label, tur: KIND[i.kind] || i.kind, girilen: r(valueAt(i, ym)), net_bu_ay: r(incomeFor(i, ym))
  }));
  const hesaplar = (data.accounts || []).map((a) => ({ ad: a.label, bakiye: r(a.balance), tarih: a.asOf || null }));
  const kartlar = [], taksitler = [];
  data.cards.forEach((c) => {
    const cc = cardCalc(c, ym);
    kartlar.push({ ad: c.label, ekstre_borcu: r(c.balance), bu_ay_odenecek: r(c.payment),
      taksit_bu_ay: r(cc.inst), devreden: r(cc.carried), devreden_faiz: r(cc.interest),
      kalan_taksit_borcu: r(cc.remainingDebt), bu_ay_toplam: r(cc.monthly) });
    c.purchases.forEach((l, i) => {
      const x = cc.lines[i];
      const bagli = l.itemId ? findItem(l.itemId) : null;
      taksitler.push({ kart: c.label, ad: l.label, tur: CARD_LINE_TYPES[l.type] || l.type,
        tutar: r(l.amount), taksit_sayisi: x.n, odenen: x.paidAt, kalan: x.rem,
        aylik: r(x.m), kalan_tutar: r(x.remaining), faiz_orani: x.hasInterest ? r(x.rate) : 0,
        plan_kalemi: bagli ? bagli.cat.label + " › " + bagli.it.label : null });
    });
  });
  const krediler = data.loans.map((l) => {
    const x = loanCalc(l, ym);
    return { ad: l.label, tur: LOAN_TYPES[l.type] || l.type, anapara: r(l.principal),
      aylik_faiz: l.mode === "direct" ? null : r(l.rate), vade: x.n, odenen: x.paidAt, kalan: x.rem,
      aylik_taksit: r(x.m), kalan_tutar: r(x.remaining) };
  });
  const plan = [];
  data.categories.forEach((c) => c.items.forEach((it) => plan.push({
    kategori: c.label, kalem: it.label, tutar: r(it.value), kac_ayda: monthsOf(it),
    aylik: r(monthly(it)), odeme: cardName(payOf(it)), taksit: itemInst(it) })));
  const planTotal = sum(data.categories.map(catTotal));
  const borcAylik = debtTotal(ym);
  const hedefler = data.goals.map((g) => {
    const x = goalCalc(g, planTotal + borcAylik);
    return { ad: g.label, hedef: r(x.target), biriken: r(g.saved), aylik: r(g.monthly), yuzde: r(x.pct), bitis: x.eta };
  });
  const netGelir = sum(data.incomes.map((i) => incomeFor(i, ym)));
  return {
    donem: ym, gelirler, hesaplar, kartlar, kart_taksitleri: taksitler, krediler, plan, hedefler,
    toplam: {
      net_gelir: r(netGelir), elimdeki_para: r(cashOnHand()), bugun_tahmini: r(cashToday().value), plan_aylik: r(planTotal),
      borc_aylik: r(borcAylik), birikim_aylik: r(sum(data.goals.map((g) => g.monthly || 0))),
      kalan_kart_borcu: r(sum(kartlar.map((k) => k.ekstre_borcu + k.kalan_taksit_borcu))),
      kalan_kredi_borcu: r(sum(krediler.map((k) => k.kalan_tutar))),
      bos_kalan: r(netGelir - planTotal - borcAylik - sum(data.goals.map((g) => g.monthly || 0)))
    }
  };
}
