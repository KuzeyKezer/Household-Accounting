// update.js — recomputes all numbers, charts and the installment calendar; saves
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: everything above

// ================== UPDATE (numbers & charts) ==================
function update() {
  const income = sum(data.incomes.map((i) => incomeFor(i)));
  const groups = data.categories.map((c) => ({ key: c.id, label: c.label, color: c.color, total: catTotal(c) }));
  groups.push({ key: "debts", label: "Borçlar ve Taksitler", color: DEBT_COLOR, total: debtTotal() });

  const totalExpense = sum(groups.map((g) => g.total));
  const savings = sum(data.goals.map((g) => g.monthly || 0));
  const free = income - totalExpense - savings;
  const ratio = income > 0 ? ((income - totalExpense) / income) * 100 : 0;
  const spentPct = income > 0 ? (totalExpense / income) * 100 : 0;

  // month nav
  document.getElementById("month-label").innerHTML = `${ymLabel(viewYM)}` +
    (startDay() > 1 ? `<small>${periodRangeLabel(viewYM)}</small>` : "");
  setText("period-range", `${viewYM === CUR_YM ? "Bu dönem" : "Seçili dönem"}: ${periodRangeLabel(viewYM)}`);
  data.incomes.forEach((inc) => {
    const box = ref(`inet-${inc.id}`);
    if (!box) return;
    const ch = changeAt(inc, viewYM);
    const chTxt = ch ? ` · bu ay geçerli brüt ${fmt(valueAt(inc, viewYM))} (${ymLabel(ch.from)} değişikliği)` : "";
    const mName = MONTHS[monthNo(viewYM)];
    if (inc.kind === "gross") {
      const sch = payrollYear(inc, extrasOf(inc), yearOf(viewYM));
      const cur = sch[monthNo(viewYM)];
      if (!cur.gross) { box.textContent = "Brüt tutarı gir, aylara göre net hesaplansın."; return; }
      const max = Math.max(1, ...sch.map((x) => x.net + x.extraNet));
      const bars = sch.map((x, i) => `<span class="spark-col${i === monthNo(viewYM) ? " on" : ""}" title="${MONTHS[i]}: maaş ${fmt(x.net)}${x.extraNet ? ` + ek ${fmt(x.extraNet)}` : ""}">
        <span class="spark extra" style="height:${(x.extraNet / max) * 100}%"></span><span class="spark" style="height:${Math.max(8, (x.net / max) * 100)}%"></span></span>`).join("");
      box.innerHTML = `<span class="sparkline">${bars}</span>
        <span>${mName} net ≈ <b>${fmt(cur.net)}</b> · ${yearOf(viewYM)}: Ocak ${fmt(sch[0].net)} → Aralık ${fmt(sch[11].net)}${chTxt}
        <span class="muted-small">(gelir vergisi ${fmt(cur.incomeTax)}, SGK${inc.memur ? "" : "+işsizlik"} ${fmt(cur.sgk)}, damga ${fmt(cur.stamp)}${cur.exTotal ? `; bağlı ek ödemelerin vergisi ayrıca o satırlarda` : ""} · ${PAYROLL.year} tarifesi, tahmini)</span></span>`;
    } else if (inc.kind === "extra") {
      const g = valueAt(inc, viewYM);
      if (!g) { box.textContent = `${mName} için tutar yok. Ek ders gibi değişen ödemeleri "zam / değişiklik" ile aylara göre gir.`; return; }
      const net = incomeFor(inc);
      const linked = data.incomes.find((i) => i.id === inc.linkTo && i.kind === "gross");
      box.innerHTML = `<span>${mName} brüt ${fmt(g)} → net ≈ <b>${fmt(net)}</b> · kesinti ${fmt(g - net)} (%${fmtRate(((g - net) / g) * 100)})${chTxt}
        <span class="muted-small">${linked ? `· ${esc(linked.label)} ile aynı vergi matrahında, yıl ilerledikçe kesinti artar` : "· bağımsız hesaplandı"}</span></span>`;
    }
  });

  document.getElementById("month-today").hidden = viewYM === CUR_YM;
  document.getElementById("usage-month").textContent = `· ${ymLabel(viewYM)}`;
  document.getElementById("exp-month").textContent = ymLabel(viewYM);
  // raise percentages next to each change
  data.incomes.forEach((inc) => {
    let prev = inc.value;
    [...(inc.changes || [])].sort((x, y) => (x.from < y.from ? -1 : 1)).forEach((c, i) => {
      const e = ref(`chg-${inc.id}-${i}`);
      if (e) {
        const pct = prev ? ((c.value - prev) / prev) * 100 : 0;
        e.textContent = prev && c.value ? (pct >= 0 ? "+" : "") + pctStr(pct) : "";
        e.classList.toggle("neg", pct < 0);
      }
      prev = c.value;
    });
  });

  // summary
  document.getElementById("income-total").textContent = fmt(income);
  document.getElementById("income-total-ov").textContent = fmt(income);
  document.getElementById("expense-val").textContent = fmt(totalExpense);
  document.getElementById("savings-val").textContent = fmt(savings);
  document.getElementById("surplus-val").textContent = fmt(free);
  document.getElementById("ratio-val").textContent = `tasarruf oranı ${pctStr(ratio)}`;
  document.getElementById("surplus-card").className = "stat-card " +
    (free < 0 ? "badge-red" : ratio >= 20 ? "badge-green" : "badge-amber");

  // usage bar + legend + donut
  const segments = groups.filter((g) => g.total > 0);
  if (savings > 0) segments.push({ label: "Birikim", color: GOAL_COLOR, total: savings });
  if (free > 0) segments.push({ label: "Dağıtılmamış", color: FREE_COLOR, total: free });
  const base = Math.max(income, sum(segments.map((s) => s.total)), 1);
  const bar = document.getElementById("usage-bar");
  const legend = document.getElementById("legend");
  bar.innerHTML = "";
  legend.innerHTML = "";
  let acc = 0;
  const stops = [];
  segments.forEach((g) => {
    const p = (g.total / base) * 100;
    const seg = el("div", "bar-seg");
    seg.style.width = p + "%";
    seg.style.background = g.color;
    seg.title = `${g.label}: ${fmt(g.total)}`;
    bar.appendChild(seg);
    legend.appendChild(el("span", null,
      `<i class="dot" style="background:${g.color}"></i>${esc(g.label)} <b>${fmt(g.total)}</b>`));
    stops.push(`${g.color} ${acc}% ${acc + p}%`);
    acc += p;
  });
  if (acc < 100) stops.push(`${FREE_COLOR} ${acc}% 100%`);
  document.getElementById("donut").style.background = `conic-gradient(${stops.join(", ")})`;
  const donutPct = document.getElementById("donut-pct");
  donutPct.textContent = pctStr(spentPct);
  donutPct.classList.toggle("over", income - totalExpense < 0);
  document.getElementById("over-warning").hidden = free >= 0;

  // spending this month
  const monthExpenses = expensesIn(viewYM);
  const spentBy = {};
  monthExpenses.forEach((e) => { const k = e.itemId || "__other"; spentBy[k] = (spentBy[k] || 0) + e.amount; });
  // installments of card purchases linked to a plan item count as that item's spending each month
  data.cards.forEach((c) => c.purchases.forEach((l) => {
    if (!isLinked(l)) return;
    const v = lineCalc(l, c, viewYM).active;
    if (v) spentBy[l.itemId] = (spentBy[l.itemId] || 0) + v;
  }));
  const spentTotal = sum(monthExpenses.map((e) => e.amount));
  const plannedVariable = sum(data.categories.map(catTotal));
  document.getElementById("exp-total").innerHTML = monthExpenses.length
    ? `Kayıtlı <b>${fmt(spentTotal)}</b> · planlanan ${fmt(plannedVariable)} (${pctStr(plannedVariable ? (spentTotal / plannedVariable) * 100 : 0)})`
      + (spentBy.__other ? ` · plan dışı <b class="neg">${fmt(spentBy.__other)}</b>` : "")
    : "";
  fillItemSelect();
  fillPaySelect();
  if (!expDate.value || periodOf(expDate.value) !== viewYM) expDate.value = defaultExpenseDate();
  expDate.min = dateStr(periodStart(viewYM));
  expDate.max = dateStr(periodEnd(viewYM));
  renderExpenseList(monthExpenses);

  // category headers
  groups.forEach((g) => {
    const share = income > 0 ? (g.total / income) * 100 : 0;
    setText(`ctot-${g.key}`, fmt(g.total));
    setText(`cpct-${g.key}`, pctStr(share) + " gelir");
    const f = ref(`cfill-${g.key}`);
    if (f) f.style.width = Math.min(share, 100) + "%";
  });
  data.categories.forEach((c) => {
    const s = sum(c.items.map((it) => spentBy[it.id] || 0));
    const e = ref(`cspent-${c.id}`);
    if (e) {
      e.textContent = s ? `harcanan ${fmt(s)}` : "";
      // compare with full item amounts (a yearly item is paid in one go, not as its monthly share)
      e.classList.toggle("over", s > sum(c.items.map((it) => it.value)));
    }
  });
  setText("ctot-goals", fmt(savings));
  setText("cpct-goals", income > 0 ? pctStr((savings / income) * 100) + " gelir" : "");
  const gf = ref("cfill-goals");
  if (gf) gf.style.width = Math.min(income > 0 ? (savings / income) * 100 : 0, 100) + "%";

  // items: plan share bar + spending progress (actual vs this item's amount)
  const allItems = data.categories.flatMap((c) => c.items);
  const maxItem = Math.max(1, ...allItems.map(monthly));
  allItems.forEach((it) => {
    const m = monthly(it);
    const f = ref(`fill-${it.id}`);
    if (f) f.style.width = (m / maxItem) * 100 + "%";
    setText(`pct-${it.id}`, income > 0 ? pctStr((m / income) * 100) : "—");
    const multi = monthsOf(it) > 1;
    // short summary of the ⚙ settings so they're visible while closed
    const chips = [];
    if (multi) chips.push((FREQ[monthsOf(it)] || `${monthsOf(it)} ayda bir`).toLowerCase());
    if (multi && it.payMonth) chips.push(MONTHS[it.payMonth - 1]);
    if (it.pay) chips.push(it.pay === "cash" ? "nakit" : `💳 ${(data.cards.find((c) => c.id === it.pay) || {}).label || ""}`);
    if (itemInst(it) > 1) chips.push(`${itemInst(it)} taksit`);
    if (multi) chips.push(`aylık ≈ ${fmt(m)}`);
    setText(`mon-${it.id}`, chips.join(" · "));
    const per = ref(`per-${it.id}`);
    if (per) per.classList.toggle("multi", multi);

    const spent = spentBy[it.id] || 0;
    const sp = ref(`sp-${it.id}`);
    const sbar = ref(`sbar-${it.id}`);
    const over = spent > it.value;
    if (sp) {
      sp.textContent = spent ? `harcanan ${fmt(spent)} / ${fmt(it.value)}${over ? " · aşıldı" : ""}` : "";
      sp.classList.toggle("over", over);
    }
    if (sbar) {
      sbar.classList.toggle("on", spent > 0);
      sbar.classList.toggle("over", over);
      ref(`sfill-${it.id}`).style.width = Math.min(100, it.value ? (spent / it.value) * 100 : 100) + "%";
    }
  });

  // goals
  const expenseBase = groups.reduce((a, g) => a + g.total, 0);
  data.goals.forEach((g) => {
    const c = goalCalc(g, expenseBase);
    setText(`gmon-${g.id}`, fmt(g.monthly || 0) + " / ay");
    const f = ref(`gfill-${g.id}`);
    if (f) f.style.width = c.pct + "%";
    setText(`gpct-${g.id}`, pctStr(c.pct));
    const info = ref(`ginfo-${g.id}`);
    if (!info) return;
    const targetTxt = g.kind === "emergency"
      ? `Hedef <b>${fmt(c.target)}</b> (${fmtNum(g.coverMonths)} aylık planlı gider)`
      : `Hedef <b>${fmt(c.target)}</b>`;
    let tail;
    if (c.target <= 0) tail = "Hedef tutarı gir.";
    else if (c.left <= 0) tail = "Hedefe ulaşıldı ✓";
    else if (c.months == null) tail = `kalan ${fmt(c.left)} · aylık tutar girersen ne zaman ulaşacağını hesaplarım`;
    else tail = `kalan ${fmt(c.left)} · bu hızla <b>${c.months} ayda</b> (${ymLabel(c.eta)})`;
    info.innerHTML = `${targetTxt} · ${tail}`;
  });

  // cards
  data.cards.forEach((card) => {
    const c = cardCalc(card);
    setText(`dmon-${card.id}`, fmt(c.monthly) + " / ay");

    card.purchases.forEach((line, idx) => {
      const l = c.lines[idx];
      setText(`pmon-${line.id}`, !l.started ? "başlamadı" : l.rem > 0 ? fmt(l.m) + " / ay" : "bitti ✓");
      const info = ref(`pinfo-${line.id}`);
      if (info) {
        if (!line.amount) info.textContent = "Tutarı ve taksit sayısını gir.";
        else {
          let txt = `${l.n} × <b>${fmt(l.m)}</b> · kalan ${l.rem} taksit = <b>${fmt(l.remaining)}</b>`;
          if (!l.finished) txt += ` · son taksit ${ymLabel(l.lastYM)}`;
          if (l.hasInterest) txt += ` · faiz + vergi <b class="neg">${fmt(l.cost)}</b>`;
          if (isLinked(line)) txt += ` · <span class="linked">"${esc(findItem(line.itemId).it.label)}" kalemine bağlı, bütçede o kalemin planında sayılır</span>`;
          info.innerHTML = txt;
        }
      }
      // keep the default rate shown in sync when the TCMB tier changes
      const rw = ref(`prate-${line.id}`);
      if (rw && line.rate == null) {
        const inp = rw.querySelector("input");
        if (document.activeElement !== inp) inp.value = fmtRate(l.rate);
      }
    });
    // statement preview: this period's single-payment card spending is billed next period
    const spendNow = cardSpendIn(card, viewYM);
    const spendPrev = cardSpendIn(card, addMonths(viewYM, -1));
    const stmt = ref(`dstmt-${card.id}`);
    if (stmt) {
      stmt.innerHTML = (spendNow || spendPrev)
        ? `<b>Ekstre özeti</b> · bu dönem karta yazılan tek çekim harcamalar <b>${fmt(spendNow)}</b> (kategorilerinde sayıldı, sonraki dönem ödenir)`
          + (spendPrev ? ` · bu dönem ödenecek: önceki dönemin harcamaları ${fmt(spendPrev)} + taksitler ${fmt(c.inst)} = <b>${fmt(spendPrev + c.inst)}</b>` : "")
        : `<span class="muted-small">Bu kartla tek çekim harcama girilmedi. Harcamalar'da ödeme yöntemini bu kart seçersen burada ekstre özeti oluşur.</span>`;
    }
    // plan-based forecast of this card's next statement
    const nextYM = addMonths(viewYM, 1);
    const planOnCard = cashflowAt(nextYM).byCard[card.id] || 0;
    const instNext = sum(card.purchases.map((l) => lineCalc(l, card, nextYM).active));
    const planBox = ref(`dplan-${card.id}`);
    if (planBox) {
      const nItems = data.categories.flatMap((c) => c.items).filter((it) => payOf(it) === card.id && it.value).length;
      planBox.innerHTML = nItems
        ? `<b>Plana göre ${ymLabel(nextYM)} ekstresi ≈ ${fmt(planOnCard + instNext)}</b> · bu karttan ödenen ${nItems} kalem ${fmt(planOnCard)} + taksitler ${fmt(instNext)}`
        : `<span class="muted-small">Planda bu kartla ödenen kalem yok. Kalemin ⚙ ayarından ya da Ayarlar'daki varsayılan ödeme yönteminden bu kartı seçersen ekstre tahmini burada çıkar.</span>`;
    }
    setText(`dsum-${card.id}`, card.purchases.length
      ? `${ymLabel(viewYM)} taksitleri ${fmt(c.inst)} · kalan toplam taksit borcu ${fmt(c.remainingDebt)}`
      : "");

    const info = ref(`dinfo-${card.id}`);
    if (!info) return;
    if (card.balance <= 0) {
      info.className = "debt-info muted";
      info.textContent = "Eski borç yok.";
    } else if (c.carried <= 0) {
      info.className = "debt-info ok";
      info.textContent = "Eski borcun tamamı bu ay kapanıyor, faiz işlemez. ✓";
    } else {
      info.className = "debt-info warn";
      info.innerHTML = `Ödenmeyen <b>${fmt(c.carried)}</b> sonraki aya devreder → tahmini faiz + vergi
        <b>${fmt(c.interest)}/ay</b> (aylık %${fmtRate(c.rate)} + KKDF/BSMV). Asgari ödemenin altında kalırsan gecikme faizi uygulanır.`;
    }
  });

  // loans
  data.loans.forEach((loan) => {
    const l = loanCalc(loan);
    setText(`dmon-${loan.id}`, !l.started ? "başlamadı" : l.rem > 0 ? fmt(l.m) + " / ay" : "bitti ✓");
    const info = ref(`dinfo-${loan.id}`);
    if (!info) return;
    if (!l.m) {
      info.className = "debt-info muted";
      info.textContent = loan.mode === "direct" ? "Aylık taksiti gir." : "Tutar ve vadeyi gir, taksit hesaplansın.";
      return;
    }
    const left = `kalan ${l.rem} taksit = <b>${fmt(l.remaining)}</b>` + (l.finished ? "" : ` · son taksit ${ymLabel(l.lastYM)}`);
    info.className = "debt-info";
    if (loan.mode === "direct") info.innerHTML = left;
    else {
      const taxNote = loan.type === "konut" ? "konut kredisi vergiden muaf" : `vergiler dahil efektif aylık %${fmtRate(l.eff)}`;
      info.innerHTML = `${left} · toplam geri ödeme ${fmt(l.total)} · faiz + vergi <b>${fmt(l.cost)}</b> · ${taxNote}`;
    }
  });

  // money on hand
  document.getElementById("accounts-total").textContent = fmt(cashOnHand());
  data.accounts.forEach((a) => {
    let txt = "";
    if (a.asOf) {
      const [y, m, d] = a.asOf.split("-").map(Number);
      const days = Math.round((new Date(todayStr()) - new Date(a.asOf)) / 864e5);
      txt = days === 0 ? "bugün güncellendi" : `${d} ${MONTHS[m - 1].slice(0, 3)} itibarıyla` + (days > 14 ? " · güncelle" : "");
    }
    setText(`adate-${a.id}`, txt);
  });

  updateTimeline();
  updateCashflow();
  updateOverviewCards({ income, totalExpense, spentTotal, plannedVariable, spentBy });
  saveData();
}

function updateTimeline() {
  const box = ref("timeline");
  const evBox = ref("timeline-events");
  if (!box) return;
  const months = Array.from({ length: 12 }, (_, k) => addMonths(CUR_YM, k));
  const vals = months.map(installmentsAt);
  const max = Math.max(1, ...vals.map((v) => v.total));
  box.innerHTML = "";
  months.forEach((ym, k) => {
    const v = vals[k];
    const col = el("button", "tl-col" + (ym === viewYM ? " active" : ""));
    col.type = "button";
    col.title = `${ymLabel(ym)}: ${fmt(v.total)}\n` + v.parts.map((p) => `• ${p.label}: ${fmt(p.v)}`).join("\n");
    col.innerHTML = `<span class="tl-val">${v.total ? fmtShort(v.total) : "–"}</span>
      <span class="tl-track"><span class="tl-bar" style="height:${(v.total / max) * 100}%"></span></span>
      <span class="tl-month">${ymShort(ym)}${ymIndex(ym) % 12 === 0 ? `<small>${ym.slice(2, 4)}</small>` : ""}</span>`;
    col.addEventListener("click", () => { viewYM = ym; render(); update(); });
    box.appendChild(col);
  });

  // what ends when (within the window)
  const events = [];
  const consider = (label, s, m) => {
    if (s.finished || !m) return;
    const k = monthDiff(CUR_YM, s.lastYM);
    if (k >= 0 && k < 12) events.push({ ym: s.lastYM, label, m });
  };
  data.cards.forEach((c) => c.purchases.forEach((l) => {
    const x = lineCalc(l, c, CUR_YM);
    consider(l.label, x, x.m);
  }));
  data.loans.forEach((l) => { const x = loanCalc(l, CUR_YM); consider(l.label, x, x.m); });
  events.sort((a, b) => monthDiff(b.ym, a.ym));
  evBox.innerHTML = events.length
    ? events.map((e) => `<div class="tl-event"><b>${ymLabel(e.ym)}</b> son taksit: ${esc(e.label)} → sonraki ay <span class="pos">${fmt(e.m)}/ay rahatlama</span></div>`).join("")
    : `<div class="tl-event muted">Önümüzdeki 12 ayda biten taksit yok.</div>`;
}

// 12-month cash flow: real payment timing, so tight months show up ahead of time
function updateCashflow() {
  const chart = document.getElementById("cf-chart");
  if (!chart) return;
  const months = projection();
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.left)));
  chart.innerHTML = "";
  months.forEach((m) => {
    const h = (Math.abs(m.left) / maxAbs) * 100;
    const neg = m.left < 0;
    const col = el("button", "cf-col" + (m.ym === viewYM ? " active" : "") + (neg ? " neg" : ""));
    col.type = "button";
    col.title = `${ymLabel(m.ym)}\ngelir ${fmt(m.income)}\ngider ${fmt(m.regular)}\ntaksit ${fmt(m.inst)}\nbirikim ${fmt(m.savings)}\nkalan ${fmt(m.left)}`
      + (m.due.length ? "\n" + m.due.map((d) => `• ${d.label}: ${fmt(d.v)}`).join("\n") : "");
    col.innerHTML = `<span class="cf-val">${neg ? "−" : ""}${fmtShort(Math.abs(m.left))}</span>
      <span class="cf-up">${neg ? "" : `<span class="cf-bar" style="height:${h}%"></span>`}</span>
      <span class="cf-axis"></span>
      <span class="cf-down">${neg ? `<span class="cf-bar" style="height:${h}%"></span>` : ""}</span>
      <span class="tl-month">${ymShort(m.ym)}${ymIndex(m.ym) % 12 === 0 ? `<small>${m.ym.slice(2, 4)}</small>` : ""}</span>`;
    col.addEventListener("click", () => { viewYM = m.ym; render(); update(); });
    chart.appendChild(col);
  });

  // notes: tight months and big one-off payments
  const notes = [];
  const tight = months.filter((m) => m.left < 0);
  const avg = sum(months.map((m) => m.left)) / 12;
  const hasCash = cashOnHand() > 0;
  if (tight.length) {
    tight.forEach((m) => {
      const what = m.due.length ? ` · ${m.due.map((d) => `${esc(d.label)} ${fmt(d.v)}`).join(", ")}` : "";
      notes.push(m.balance < 0
        ? `<div class="cf-note neg"><b>${ymLabel(m.ym)}</b>: paran yetmiyor. O ay ${fmt(m.left)} açık, ay sonu tahmini bakiye <b>${fmt(m.balance)}</b>${what}</div>`
        : `<div class="cf-note warn"><b>${ymLabel(m.ym)}</b> ${fmt(m.left)} açık veriyor ama ${hasCash ? "elindeki para ve önceki aylardan kalanla" : "önceki aylardan kalanla"} karşılanıyor (ay sonu tahmini bakiye ${fmt(m.balance)})${what}</div>`);
    });
  } else {
    notes.push(`<div class="cf-note pos">12 ay boyunca her ay artıda kalıyorsun (ortalama ${fmt(avg)}/ay).</div>`);
  }
  months.filter((m) => m.due.length && m.left >= 0).forEach((m) =>
    notes.push(`<div class="cf-note">${ymLabel(m.ym)}: ${m.due.map((d) => `${esc(d.label)} ${fmt(d.v)}`).join(", ")} ödemesi var, o ay kalan ${fmt(m.left)}.</div>`));
  const spread = data.categories.flatMap((c) => c.items).filter((it) => monthsOf(it) > 1 && !it.payMonth && it.value);
  if (spread.length) notes.push(`<div class="cf-note muted">Ödeme ayı seçilmemiş ${spread.length} kalem aylara eşit dağıtıldı (${spread.slice(0, 4).map((i) => esc(i.label)).join(", ")}${spread.length > 4 ? "…" : ""}). Bütçe planında kalemin ⚙ ayarından ödeme ayını seçersen o aya yazılır.</div>`);
  document.getElementById("cf-notes").innerHTML = notes.join("");

  // table
  document.getElementById("cf-table").innerHTML = `<table class="cf-table"><thead><tr>
      <th>Ay</th><th>Gelir</th><th>Gider</th><th>Taksit</th><th>Birikim</th><th>O ay kalan</th><th>Tahmini bakiye</th></tr></thead><tbody>`
    + months.map((m) => `<tr${m.balance < 0 ? ' class="neg"' : ""}><td>${ymLabel(m.ym)}</td><td>${fmt(m.income)}</td>
      <td>${fmt(m.regular)}</td><td>${fmt(m.inst)}</td><td>${fmt(m.savings)}</td><td>${fmt(m.left)}</td><td><b>${fmt(m.balance)}</b></td></tr>`).join("")
    + `</tbody></table>`;
}

// "Bu ay" cards at the top of Özet: the few things worth checking daily
function updateOverviewCards({ spentTotal, plannedVariable, spentBy }) {
  const box = document.getElementById("ov-cards");
  if (!box) return;
  const cards = [];
  // 1) spending vs plan this period
  const pct = plannedVariable ? (spentTotal / plannedVariable) * 100 : 0;
  const start = periodStart(viewYM), end = periodEnd(viewYM);
  const elapsed = viewYM === CUR_YM
    ? Math.min(100, ((new Date() - start) / (end - start + 864e5)) * 100) : viewYM < CUR_YM ? 100 : 0;
  const overItems = data.categories.flatMap((c) => c.items).filter((it) => (spentBy[it.id] || 0) > it.value && it.value);
  cards.push(`<div class="ov-card">
    <div class="ov-label">${ymLabel(viewYM)} harcaması</div>
    <div class="ov-value">${fmt(spentTotal)} <span class="ov-of">/ ${fmt(plannedVariable)}</span></div>
    <div class="ov-bar"><div class="ov-fill${pct > 100 ? " over" : ""}" style="width:${Math.min(100, pct)}%"></div>
      ${elapsed > 0 && elapsed < 100 ? `<div class="ov-mark" style="left:${elapsed}%" title="dönemin ne kadarı geçti"></div>` : ""}</div>
    <div class="ov-sub">${spentTotal ? (overItems.length ? `<span class="neg">${overItems.length} kalemde plan aşıldı: ${overItems.slice(0, 3).map((i) => esc(i.label)).join(", ")}</span>`
      : pct <= elapsed + 5 ? "planın içinde gidiyorsun" : "dönemin geçen kısmına göre hızlı harcıyorsun")
      : `henüz harcama girilmedi · <a href="#" data-goto="expenses">harcama ekle</a>`}</div>
  </div>`);
  // 2) next card statement
  const nextYM = addMonths(viewYM, 1);
  if (data.cards.length) {
    const flow = cashflowAt(nextYM).byCard;
    const total = sum(data.cards.map((c) => (flow[c.id] || 0) + sum(c.purchases.map((l) => lineCalc(l, c, nextYM).active))));
    const actual = sum(data.cards.map((c) => cardSpendIn(c, viewYM)));
    cards.push(`<div class="ov-card">
      <div class="ov-label">${ymLabel(nextYM)} kart ödemesi (tahmini)</div>
      <div class="ov-value">${fmt(total)}</div>
      <div class="ov-sub">plana göre · bu dönem karta yazılan tek çekim ${fmt(actual)} · <a href="#" data-goto="debts">kartlar</a></div>
    </div>`);
  }
  // 3) next tight month / relief
  const months = projection();
  const tight = months.find((m) => m.left < 0);
  const short = months.find((m) => m.balance < 0);
  if (!months.some((m) => m.income)) {
    cards.push(`<div class="ov-card"><div class="ov-label">Başlarken</div>
      <div class="ov-value">Gelirini gir</div>
      <div class="ov-sub"><a href="#" data-goto="plan">Bütçe planı</a>'ndan gelirini ve kalem tutarlarını yaz; kartların varsa <a href="#" data-goto="debts">Borçlar</a>'dan ekle.</div></div>`);
  } else if (short) {
    cards.push(`<div class="ov-card warn"><div class="ov-label">Dikkat: para yetmiyor</div>
        <div class="ov-value neg">${ymLabel(short.ym)}: ${fmt(short.balance)}</div>
        <div class="ov-sub">o ay sonu tahmini bakiye${short.due.length ? " · " + short.due.map((d) => esc(d.label)).join(", ") : ""}</div></div>`);
  } else cards.push(tight
    ? `<div class="ov-card caution"><div class="ov-label">${ymLabel(tight.ym)} açık veriyor</div>
        <div class="ov-value">${fmt(tight.left)}</div>
        <div class="ov-sub">${tight.due.length ? tight.due.map((d) => esc(d.label)).join(", ") + " aynı aya denk geliyor · " : ""}${cashOnHand() > 0 ? "elindeki para" : "önceki aylardan kalan"} karşılıyor, ay sonu ${fmt(tight.balance)}</div></div>`
    : `<div class="ov-card ok"><div class="ov-label">Önümüzdeki 12 ay</div>
        <div class="ov-value pos">Her ay artıda</div>
        <div class="ov-sub">en düşük ay ${fmt(Math.min(...months.map((m) => m.left)))}</div></div>`);
  box.innerHTML = cards.join("");
  box.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.goto); }));
}
