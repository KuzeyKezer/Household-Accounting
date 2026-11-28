// render.js — builds the page structure (incomes, goals, categories, debts, rates); numbers are filled in by update.js
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: everything above

// ================== RENDER (structure) ==================
const openState = {};

function renderDefaultPay() {
  const box = document.getElementById("default-pay");
  if (!box) return;
  box.innerHTML = "";
  const sel = document.createElement("select");
  sel.className = "type-select";
  sel.appendChild(new Option("Nakit / banka kartı", "cash"));
  data.cards.forEach((c) => sel.appendChild(new Option(`💳 ${c.label}`, c.id)));
  sel.value = data.cards.some((c) => c.id === data.defaultPay) ? data.defaultPay : "cash";
  sel.addEventListener("change", () => { data.defaultPay = sel.value; render(); update(); });
  box.appendChild(sel);
}

function renderAccounts() {
  const list = document.getElementById("accounts-list");
  if (!list) return;
  list.innerHTML = "";
  data.accounts.forEach((a) => {
    const row = el("div", "account-row");
    row.dataset.id = a.id;
    row.appendChild(editableLabel(a, "account-label"));
    row.appendChild(el("span", "account-date")).dataset.ref = `adate-${a.id}`;
    row.appendChild(numInput(() => a.balance, (v) => { a.balance = v; a.asOf = todayStr(); }, { label: a.label }));
    row.appendChild(delBtn(() => (data.accounts = data.accounts.filter((x) => x !== a)), "Hesabı sil"));
    list.appendChild(row);
  });
}

function render() {
  renderDefaultPay();
  renderAccounts();
  renderIncomes();
  renderGoals();
  renderCategories();
  renderDebts();
  renderRates();
}

function renderIncomes() {
  const list = document.getElementById("income-list");
  list.innerHTML = "";
  const salaries = data.incomes.filter((i) => i.kind === "gross");
  data.incomes.forEach((inc, idx) => {
    inc.changes = inc.changes || [];
    const row = el("div", "income-row");
    row.dataset.id = inc.id;
    row.appendChild(editableLabel(inc, "income-label"));
    const seg = segmented({ net: "Net", gross: "Brüt maaş", extra: "Ek ödeme (brüt)" }, inc.kind, (k) => {
      inc.kind = k;
      if (k === "extra" && !inc.linkTo && salaries[0]) inc.linkTo = salaries[0].id;
    });
    seg.title = "Brüt maaş: net aylara göre vergi dilimiyle hesaplanır. Ek ödeme: ek ders, prim gibi maaşa eklenen brüt tutar.";
    // label + a short summary of the hidden settings
    const lw = el("div", "income-label-wrap");
    lw.appendChild(row.lastChild);
    const chips = [];
    if (inc.kind === "gross") chips.push(inc.memur ? "brüt maaş · memur" : "brüt maaş");
    if (inc.kind === "extra") chips.push("ek ödeme (brüt)");
    if (inc.changes.length) chips.push(`${inc.changes.length} zam/değişiklik`);
    if (chips.length) lw.appendChild(el("span", "income-chip", chips.join(" · ")));
    row.appendChild(lw);
    row.appendChild(numInput(() => inc.value, (v) => (inc.value = v), { big: idx === 0, label: inc.label }));
    row.appendChild(gearBtn(inc.id, "Net/brüt, memur, ek ödeme, zam ekle"));
    row.appendChild(data.incomes.length > 1
      ? delBtn(() => {
          data.incomes = data.incomes.filter((x) => x !== inc);
          data.incomes.forEach((x) => { if (x.linkTo === inc.id) x.linkTo = undefined; });
        }, "Geliri sil")
      : el("span", "del-spacer"));
    list.appendChild(row);

    // net estimate for brüt / ek ödeme stays visible; everything else is behind ⚙
    if (inc.kind !== "net") list.appendChild(el("div", "income-sub")).dataset.ref = `inet-${inc.id}`;
    if (!openAdv.has(inc.id)) return;
    const detail = el("div", "income-detail item-adv");
    detail.appendChild(el("div", "adv-label", "Bu gelir nasıl hesaplansın?"));
    detail.appendChild(seg);
    // options
    if (inc.kind === "gross") {
      const opt = el("div", "income-opts");
      opt.appendChild(segmented({ private: "Özel sektör", memur: "Memur" }, inc.memur ? "memur" : "private",
        (k) => (inc.memur = k === "memur")));
      detail.appendChild(opt);
    } else if (inc.kind === "extra") {
      const opt = el("div", "income-opts");
      opt.appendChild(el("span", "opt-label", "Vergisi hangi maaşla birlikte hesaplanıyor:"));
      const sel = document.createElement("select");
      sel.className = "type-select";
      sel.appendChild(new Option("Bağımsız (maaş yok)", ""));
      salaries.forEach((s_) => sel.appendChild(new Option(s_.label, s_.id)));
      sel.value = salaries.some((x) => x.id === inc.linkTo) ? inc.linkTo : "";
      sel.addEventListener("change", () => { inc.linkTo = sel.value || undefined; update(); });
      opt.appendChild(sel);
      const lbl = el("label", "chk");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!inc.sgk;
      cb.addEventListener("change", () => { inc.sgk = cb.checked; update(); });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" SGK kesilir"));
      lbl.title = "Kadrolu öğretmen ek dersinde SGK kesilmez; özel sektör priminde kesilir.";
      opt.appendChild(lbl);
      detail.appendChild(opt);
    }


    const dayRow = el("div", "income-opts");
    dayRow.appendChild(dayField("Hesabına ayın kaçında yatıyor?", inc, "payDay",
      `Dönem başında (ayın ${startDay()}. günü)`, "Yattığı gün elindeki paraya eklenir."));
    detail.appendChild(dayRow);

    // raises / changes
    const sorted = [...inc.changes].sort((x, y) => (x.from < y.from ? -1 : 1));
    let prev = inc.value;
    sorted.forEach((c) => {
      const cr = el("div", "change-row");
      cr.appendChild(monthPicker(c.from, (ym) => { c.from = ym; render(); update(); }));
      cr.appendChild(el("span", "change-txt", "ayından itibaren"));
      cr.appendChild(numInput(() => c.value, (v) => (c.value = v), { label: "Yeni tutar" }));
      const pct = prev ? ((c.value - prev) / prev) * 100 : 0;
      const pctEl = el("span", "change-pct" + (pct < 0 ? " neg" : ""), prev && c.value ? (pct >= 0 ? "+" : "") + pctStr(pct).replace("%", "%") : "");
      pctEl.dataset.ref = `chg-${inc.id}-${sorted.indexOf(c)}`;
      cr.appendChild(pctEl);
      cr.appendChild(delBtn(() => (inc.changes = inc.changes.filter((x) => x !== c)), "Değişikliği sil"));
      detail.appendChild(cr);
      prev = c.value;
    });
    const add = el("button", "link-btn add-change", "+ Zam / değişiklik ekle");
    add.type = "button";
    add.addEventListener("click", () => {
      const last = sorted[sorted.length - 1];
      const from = last ? addMonths(last.from, 1) : addMonths(viewYM, 1);
      inc.changes.push({ from, value: valueAt(inc, from) });
      render(); update();
    });
    detail.appendChild(add);
    list.appendChild(detail);
  });

  // budget period setting
  const p = data.period;
  const per = document.getElementById("period-row");
  per.innerHTML = "";
  per.appendChild(segmented({ calendar: "Takvim ayı", salary: "Maaş gününden maaş gününe" }, p.mode,
    (k) => setPeriod(k, p.day > 1 ? p.day : 15)));
  if (p.mode === "salary") {
    const day = numInput(() => data.period.day, (v) => { if (v >= 1 && v <= 31) setPeriod("salary", v); },
      { prefix: "her ayın", suffix: ". günü", label: "Maaş günü" });
    day.classList.add("day-input");
    per.appendChild(day);
  }
  per.appendChild(el("span", "period-range")).dataset.ref = "period-range";
}

function categoryShell(key, label, color, editableObj) {
  const det = el("details", "category");
  det.open = openState[key] !== false;
  det.addEventListener("toggle", () => (openState[key] = det.open));
  det.style.setProperty("--cat-color", color);

  const sum_ = el("summary");
  const header = el("div", "cat-header");
  const name = el("div", "cat-name", `<i class="chev"></i><i class="dot"></i>`);
  if (editableObj) name.appendChild(editableLabel(editableObj, "cat-label"));
  else name.appendChild(el("span", "cat-label", esc(label)));
  header.appendChild(name);
  header.appendChild(el("div", "cat-meta",
    `<span class="cat-spent" data-ref="cspent-${key}"></span><span class="cat-pct" data-ref="cpct-${key}"></span><span class="cat-total" data-ref="ctot-${key}"></span>`));
  sum_.appendChild(header);
  sum_.appendChild(el("div", "cat-bar", `<div class="cat-fill" data-ref="cfill-${key}"></div>`));
  det.appendChild(sum_);
  return det;
}

// ---- goals ----
function renderGoals() {
  const container = document.getElementById("goals-container");
  container.innerHTML = "";
  const det = categoryShell("goals", "Birikim ve Hedefler", GOAL_COLOR);
  const body = el("div", "goals");
  body.appendChild(el("div", "goal-hint",
    "Birikimi \"artarsa\" değil, en baştan ayır. Buraya yazdığın aylık tutarlar gelirden giderlerle birlikte düşülür."));

  data.goals.forEach((g) => {
    const box = el("div", "debt-card goal-card");
    box.dataset.id = g.id;
    const head = el("div", "debt-head");
    head.appendChild(editableLabel(g, "debt-label"));
    head.appendChild(el("span", "debt-monthly")).dataset.ref = `gmon-${g.id}`;
    head.appendChild(delBtn(() => (data.goals = data.goals.filter((x) => x !== g)), "Hedefi sil"));
    box.appendChild(head);

    box.appendChild(el("div", "debt-opts")).appendChild(
      segmented({ emergency: "Acil durum fonu", custom: "Tutar hedefi" }, g.kind, (k) => (g.kind = k)));

    const grid = el("div", "dgrid");
    if (g.kind === "emergency") {
      grid.appendChild(field("Kaç aylık gider", numInput(() => g.coverMonths, (v) => (g.coverMonths = v >= 1 ? v : 1), { prefix: "", suffix: "ay" })));
    } else {
      grid.appendChild(field("Hedef tutar", numInput(() => g.target, (v) => (g.target = v))));
    }
    grid.appendChild(field("Şu ana kadar biriken", numInput(() => g.saved, (v) => (g.saved = v))));
    grid.appendChild(field("Aylık ayıracağın", numInput(() => g.monthly, (v) => (g.monthly = v))));
    box.appendChild(grid);

    box.appendChild(el("div", "goal-progress",
      `<div class="goal-bar"><div class="goal-fill" data-ref="gfill-${g.id}"></div></div><span class="goal-pct" data-ref="gpct-${g.id}"></span>`));
    box.appendChild(el("div", "pline-info")).dataset.ref = `ginfo-${g.id}`;
    body.appendChild(box);
  });
  body.appendChild(addBtn("+ Hedef ekle", () => {
    const g = { id: uid(), label: "Yeni hedef", kind: "custom", coverMonths: 6, target: 0, saved: 0, monthly: 0 };
    data.goals.push(g); render(); update(); focusLabel(g.id);
  }));
  det.appendChild(body);
  container.appendChild(det);
}

// ---- categories ----
const FREQ = { 1: "Her ay", 2: "2 ayda bir", 3: "3 ayda bir", 4: "4 ayda bir", 6: "6 ayda bir", 12: "Yılda bir" };
const openAdv = new Set(); // which rows have their ⚙ details open (kept across re-renders)

function gearBtn(id, label) {
  const b = el("button", "gear-btn" + (openAdv.has(id) ? " on" : ""), `<span class="gear-ico">⚙</span><span class="gear-txt">${openAdv.has(id) ? "Kapat" : "Ayar"}</span>`);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", (e) => {
    e.preventDefault();
    openAdv.has(id) ? openAdv.delete(id) : openAdv.add(id);
    render(); update();
  });
  return b;
}
function selectField(label, options, value, onChange, title) {
  const sel = document.createElement("select");
  sel.className = "adv-select";
  options.forEach(([v, t]) => sel.appendChild(new Option(t, v)));
  sel.value = value;
  if (title) sel.title = title;
  sel.addEventListener("change", () => { onChange(sel.value); render(); update(); });
  return field(label, sel);
}

// "Ayın kaçında?" seçimi (1–31). Boş: belirtilmemiş.
function dayField(label, obj, key, emptyText, help) {
  const opts = [["", emptyText], ...Array.from({ length: 31 }, (_, i) => [String(i + 1), `Ayın ${i + 1}. günü`])];
  return selectField(label, opts, obj[key] ? String(obj[key]) : "",
    (v) => { if (v) obj[key] = Number(v); else delete obj[key]; }, help);
}

function itemRow(cat, it) {
  const frag = document.createDocumentFragment();
  const row = el("div", "item");
  row.dataset.id = it.id;

  const labelWrap = el("div", "item-label-wrap");
  labelWrap.appendChild(editableLabel(it));
  labelWrap.appendChild(el("span", "item-monthly", "")).dataset.ref = `mon-${it.id}`;
  labelWrap.appendChild(el("span", "item-spent", "")).dataset.ref = `sp-${it.id}`;
  row.appendChild(labelWrap);

  row.appendChild(el("div", "item-bars",
    `<div class="item-bar"><div class="item-fill" data-ref="fill-${it.id}"></div></div>
     <div class="spend-bar" data-ref="sbar-${it.id}"><div class="spend-fill" data-ref="sfill-${it.id}"></div></div>`));
  row.appendChild(el("div", "item-pct")).dataset.ref = `pct-${it.id}`;
  row.appendChild(numInput(() => it.value, (v) => (it.value = v), { label: it.label }));
  row.appendChild(gearBtn(it.id, "Ödeme ayrıntıları: ne sıklıkla, hangi ay, kart/nakit, taksit"));
  row.appendChild(delBtn(() => (cat.items = cat.items.filter((x) => x !== it)), "Kalemi sil"));
  frag.appendChild(row);
  if (!openAdv.has(it.id)) return frag;

  // ---- details (⚙) ----
  const adv = el("div", "item-adv");
  const grid = el("div", "adv-grid");
  const n = monthsOf(it);
  const freqOpts = Object.entries(FREQ);
  if (!FREQ[n]) freqOpts.push([String(n), `${n} ayda bir`]);
  grid.appendChild(selectField("Ne sıklıkla ödeniyor?", freqOpts, String(n),
    (v) => (it.months = Number(v)), "Yazdığın tutar bu sıklıkla ödenir; bütçede aylık karşılığı hesaplanır."));
  if (n > 1) {
    grid.appendChild(selectField("Hangi ay ödeniyor?",
      [["", "Bilmiyorum, aylara dağıt"], ...MONTHS.map((m, i) => [String(i + 1), m])],
      it.payMonth ? String(it.payMonth) : "", (v) => (it.payMonth = v ? Number(v) : undefined),
      "Nakit akışında bu aya yazılır."));
  }
  const defName = data.defaultPay === "cash" ? "nakit" : `💳 ${(data.cards.find((c) => c.id === data.defaultPay) || {}).label || "nakit"}`;
  grid.appendChild(selectField("Nasıl ödüyorsun?",
    [["", `Varsayılan (${defName})`], ["cash", "Nakit / banka kartı"], ...data.cards.map((c) => [c.id, `💳 ${c.label}`])],
    it.pay || "", (v) => (it.pay = v || undefined),
    "Kartla ödenenler nakit akışında bir sonraki aya (ekstreye) yazılır."));
  if (payOf(it) === "cash") {
    grid.appendChild(dayField("Ayın kaçında ödüyorsun?", it, "payDay", "Belli değil (ay içine yayılır)",
      "O gün geldiğinde elindeki paradan düşülür. Market gibi her gün harcanan kalemlerde boş bırak: ay boyunca gün gün düşer."));
  }
  if (n > 1 && payOf(it) !== "cash") {
    grid.appendChild(field("Bankada kaç taksit?", numInput(() => it.inst || 1,
      (v) => (it.inst = v >= 1 ? Math.min(v, 36) : 1), { prefix: "", suffix: "taksit" })));
  }
  adv.appendChild(grid);
  frag.appendChild(adv);
  return frag;
}

function renderCategories() {
  const container = document.getElementById("categories-container");
  container.innerHTML = "";
  data.categories.forEach((cat) => {
    const det = categoryShell(cat.id, cat.label, cat.color, cat);
    const items = el("div", "items");
    cat.items.forEach((it) => items.appendChild(itemRow(cat, it)));
    det.appendChild(items);
    det.appendChild(addBtn("+ Kalem ekle", () => {
      const n = item("Yeni kalem", 0);
      cat.items.push(n);
      render(); update(); focusLabel(n.id);
    }));
    container.appendChild(det);
  });
}

// ---- debts ----
function purchaseRow(card, line) {
  const box = el("div", "pline");
  box.dataset.id = line.id;

  const head = el("div", "pline-head");
  head.appendChild(editableLabel(line, "pline-label"));
  const sel = document.createElement("select");
  sel.className = "type-select";
  Object.entries(CARD_LINE_TYPES).forEach(([k, txt]) => sel.appendChild(new Option(txt, k)));
  sel.value = line.type;
  sel.addEventListener("change", () => { line.type = sel.value; line.rate = null; render(); update(); });
  head.appendChild(sel);
  head.appendChild(el("span", "pline-monthly")).dataset.ref = `pmon-${line.id}`;
  head.appendChild(delBtn(() => (card.purchases = card.purchases.filter((x) => x !== line)), "Sil"));
  box.appendChild(head);

  const hasInterest = line.type !== "faizsiz";
  const grid = el("div", "dgrid pgrid" + (hasInterest ? " four" : ""));
  grid.appendChild(field("Toplam tutar", numInput(() => line.amount, (v) => (line.amount = v))));
  grid.appendChild(field("Taksit sayısı", numInput(() => line.n, (v) => (line.n = v >= 1 ? v : 1), { prefix: "", suffix: "taksit" })));
  grid.appendChild(field("Ödenmiş taksit (bugün)", numInput(() => paidNow(line, line.n),
    (v) => { line.paid = v; line.asOf = CUR_YM; }, { prefix: "", suffix: "adet" })));
  if (hasInterest) {
    const rateIn = numInput(() => line.rate ?? defaultLineRate(line, card), (v) => (line.rate = v),
      { prefix: "%", decimals: true });
    rateIn.dataset.ref = `prate-${line.id}`;
    grid.appendChild(field("Aylık faiz", rateIn));
  }
  box.appendChild(grid);
  box.appendChild(el("div", "pline-info")).dataset.ref = `pinfo-${line.id}`;
  return box;
}

function renderDebts() {
  const container = document.getElementById("debts-container");
  container.innerHTML = "";
  const det = categoryShell("debts", "Borçlar ve Taksitler", DEBT_COLOR);
  const body = el("div", "debts");

  // --- installment calendar (filled in update)
  body.appendChild(el("div", "sub-title", "Taksit takvimi · önümüzdeki 12 ay"));
  body.appendChild(el("div", "timeline")).dataset.ref = "timeline";
  body.appendChild(el("div", "timeline-events")).dataset.ref = "timeline-events";

  // --- credit cards
  body.appendChild(el("div", "sub-title", "Kredi kartları"));
  data.cards.forEach((card) => {
    const box = el("div", "debt-card");
    box.dataset.id = card.id;
    const head = el("div", "debt-head");
    head.appendChild(editableLabel(card, "debt-label"));
    head.appendChild(el("span", "debt-monthly")).dataset.ref = `dmon-${card.id}`;
    head.appendChild(delBtn(() => (data.cards = data.cards.filter((x) => x !== card)), "Kartı sil"));
    box.appendChild(head);

    box.appendChild(el("div", "mini-title", "Taksitli harcamalar ve borçlar"));
    card.purchases.forEach((line) => box.appendChild(purchaseRow(card, line)));
    box.appendChild(addBtn("+ Harcama / borç ekle", () => {
      const p = purchase("Yeni harcama", "faizsiz", 0, 1, 0);
      card.purchases.push(p); render(); update(); focusLabel(p.id);
    }));
    box.appendChild(el("div", "card-sum")).dataset.ref = `dsum-${card.id}`;

    box.appendChild(el("div", "card-stmt")).dataset.ref = `dstmt-${card.id}`;
    box.appendChild(el("div", "card-plan")).dataset.ref = `dplan-${card.id}`;

    box.appendChild(el("div", "mini-title", "Uygulama dışından kalan eski borç"));
    box.appendChild(el("div", "mini-hint",
      "Kartla yaptığın tek çekim harcamaları buraya yazma: onları Harcamalar'a ödeme yöntemi bu kart olarak gir, kendiliğinden ekstreye eklenir."));
    const days = el("div", "dgrid two");
    days.appendChild(dayField("Hesap kesim günü", card, "cutDay", "Bilmiyorum",
      "Ekstrenin kesildiği gün. Kartın ekstresinde ya da bankanın uygulamasında yazar."));
    days.appendChild(dayField("Son ödeme günü", card, "dueDay", "Bilmiyorum (dönem başı sayılır)",
      "Ekstre bu gün elindeki paradan düşülür."));
    box.insertBefore(days, head.nextSibling);

    const grid = el("div", "dgrid two");
    grid.appendChild(field("Eski borç (taksit hariç)", numInput(() => card.balance, (v) => (card.balance = v))));
    grid.appendChild(field("Bu ay bu borca ödeyeceğin", numInput(() => card.payment, (v) => (card.payment = v))));
    box.appendChild(grid);
    box.appendChild(el("div", "debt-info")).dataset.ref = `dinfo-${card.id}`;
    body.appendChild(box);
  });
  body.appendChild(addBtn("+ Kart ekle", () => {
    const c = { id: uid(), label: `Kredi kartı ${data.cards.length + 1}`, balance: 0, payment: 0, purchases: [] };
    data.cards.push(c); render(); update(); focusLabel(c.id);
  }));

  // --- loans
  body.appendChild(el("div", "sub-title", "Krediler"));
  data.loans.forEach((loan) => {
    const box = el("div", "debt-card");
    box.dataset.id = loan.id;
    const head = el("div", "debt-head");
    head.appendChild(editableLabel(loan, "debt-label"));
    head.appendChild(el("span", "debt-monthly")).dataset.ref = `dmon-${loan.id}`;
    head.appendChild(delBtn(() => (data.loans = data.loans.filter((x) => x !== loan)), "Krediyi sil"));
    box.appendChild(head);

    const opts = el("div", "debt-opts");
    opts.appendChild(segmented(LOAN_TYPES, loan.type, (k) => (loan.type = k)));
    opts.appendChild(segmented({ calc: "Hesapla", direct: "Taksiti biliyorum" }, loan.mode, (k) => (loan.mode = k)));
    box.appendChild(opts);

    const grid = el("div", "dgrid " + (loan.mode === "direct" ? "" : "pgrid four"));
    if (loan.mode === "direct") {
      grid.appendChild(field("Aylık taksit", numInput(() => loan.monthly, (v) => (loan.monthly = v))));
    } else {
      grid.appendChild(field("Kredi tutarı", numInput(() => loan.principal, (v) => (loan.principal = v))));
      grid.appendChild(field("Aylık faiz", numInput(() => loan.rate, (v) => (loan.rate = v), { prefix: "%", decimals: true })));
    }
    grid.appendChild(field("Vade", numInput(() => loan.term, (v) => (loan.term = v >= 1 ? v : 1), { prefix: "", suffix: "ay" })));
    grid.appendChild(field("Ödenmiş taksit (bugün)", numInput(() => paidNow(loan, loan.term),
      (v) => { loan.paid = v; loan.asOf = CUR_YM; }, { prefix: "", suffix: "adet" })));
    box.appendChild(grid);
    const lday = el("div", "dgrid two");
    lday.appendChild(dayField("Taksit günü", loan, "payDay", "Bilmiyorum (dönem başı sayılır)",
      "Taksit bu gün elindeki paradan düşülür."));
    box.appendChild(lday);
    box.appendChild(el("div", "debt-info")).dataset.ref = `dinfo-${loan.id}`;
    body.appendChild(box);
  });
  body.appendChild(addBtn("+ Kredi ekle", () => {
    const l = { id: uid(), label: "Yeni kredi", type: "ihtiyac", mode: "calc",
      principal: 0, rate: data.rates.loan, term: 12, monthly: 0, paid: 0, asOf: CUR_YM };
    data.loans.push(l); render(); update(); focusLabel(l.id);
  }));

  det.appendChild(body);
  container.appendChild(det);
}

function renderRates() {
  const body = document.getElementById("rates-body");
  body.innerHTML = "";
  const r = data.rates;
  const grid = el("div", "dgrid rates-grid");
  const pct = (get, set) => numInput(get, set, { prefix: "%", decimals: true });
  grid.appendChild(field("Kart faizi · borç < ₺30.000", pct(() => r.card[0], (v) => (r.card[0] = v))));
  grid.appendChild(field("Kart faizi · ₺30.000–180.000", pct(() => r.card[1], (v) => (r.card[1] = v))));
  grid.appendChild(field("Kart faizi · borç > ₺180.000", pct(() => r.card[2], (v) => (r.card[2] = v))));
  grid.appendChild(field("Nakit avans / taksitli nakit avans", pct(() => r.cash, (v) => (r.cash = v))));
  grid.appendChild(field("İhtiyaç kredisi (yeni kredi varsayılanı)", pct(() => r.loan, (v) => (r.loan = v))));
  grid.appendChild(field("KKDF", pct(() => r.kkdf, (v) => (r.kkdf = v))));
  grid.appendChild(field("BSMV", pct(() => r.bsmv, (v) => (r.bsmv = v))));
  body.appendChild(grid);
}
