// expenses.js — expense entry form and the list for the selected period
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: everything above

// ---- expenses (form is static HTML; options & list refresh in update) ----
const expDate = document.getElementById("exp-date");
const expItem = document.getElementById("exp-item");
const expAmount = document.getElementById("exp-amount");
const expNote = document.getElementById("exp-note");
const expPay = document.getElementById("exp-pay");
const expInst = document.getElementById("exp-inst");
const expInstWrap = document.getElementById("exp-inst-wrap");

function fillPaySelect() {
  if (document.activeElement === expPay) return;
  const keep = expPay.value || data.defaultPay || "cash";
  expPay.innerHTML = "";
  expPay.appendChild(new Option("Nakit / banka kartı", "cash"));
  data.cards.forEach((c) => expPay.appendChild(new Option(`💳 ${c.label}`, c.id)));
  expPay.value = [...expPay.options].some((o) => o.value === keep) ? keep : "cash";
  syncInstallmentField();
}
function syncInstallmentField() {
  const isCard = expPay.value !== "cash";
  expInstWrap.hidden = !isCard;
  document.getElementById("exp-form").classList.toggle("with-inst", isCard);
  if (!isCard) expInst.value = "1";
}
let showAllExpenses = false;

function fillItemSelect() {
  if (document.activeElement === expItem) return;
  const keep = expItem.value;
  expItem.innerHTML = "";
  expItem.appendChild(new Option("Kalem seç…", ""));
  data.categories.forEach((c) => {
    const og = document.createElement("optgroup");
    og.label = c.label;
    c.items.forEach((it) => og.appendChild(new Option(it.label, it.id)));
    expItem.appendChild(og);
  });
  expItem.appendChild(new Option("Plan dışı harcama", "__other"));
  expItem.value = [...expItem.options].some((o) => o.value === keep) ? keep : "";
}

function defaultExpenseDate() {
  return viewYM === CUR_YM ? todayStr() : dateStr(periodStart(viewYM));
}

function addExpense() {
  const amount = Number(expAmount.value.replace(/[^\d]/g, ""));
  const hint = document.getElementById("exp-hint");
  hint.className = "exp-hint";
  if (!expItem.value) { hint.textContent = "Bir kalem seç."; expItem.focus(); return; }
  if (!amount) { hint.textContent = "Tutar gir."; expAmount.focus(); return; }
  const date = expDate.value || defaultExpenseDate();
  const itemId = expItem.value === "__other" ? null : expItem.value;
  const n = Math.max(1, Number(expInst.value.replace(/[^\d]/g, "")) || 1);
  const card = data.cards.find((c) => c.id === expPay.value);
  if (card && n > 1) {
    // installment purchase: lives on the card (counted as installments), not as a category expense
    const f = itemId ? findItem(itemId) : null;
    const p = purchase(expNote.value.trim() || (f ? f.it.label : "Taksitli alışveriş"), "faizsiz", amount, n, 0);
    p.asOf = periodOf(date);
    p.itemId = itemId;
    card.purchases.push(p);
    render();
    hint.className = "exp-hint ok";
    hint.textContent = `${card.label} kartına ${n} taksit olarak eklendi (aylık ${fmt(amount / n)}).` + (f
      ? ` "${f.it.label}" kalemine bağlandı: bütçede o kalemin planı içinde sayılır, her ay taksit tutarı harcanan olarak görünür.`
      : ` Bütçede "Borçlar ve Taksitler" altında sayılır.`);
  } else {
    const exp = { id: newId(), date, itemId, amount, note: expNote.value.trim().slice(0, 200), pay: card ? card.id : "cash" };
    data.expenses.push(exp);
    if (Cloud.active) Cloud.addExpense(exp);
    hint.className = "exp-hint";
    hint.textContent = "";
  }
  expInst.value = "1";
  expAmount.value = "";
  expNote.value = "";
  if (periodOf(date) !== viewYM) viewYM = periodOf(date);
  update();
  expAmount.focus();
}

function renderExpenseList(list) {
  const box = document.getElementById("exp-list");
  box.innerHTML = "";
  if (!list.length) {
    box.appendChild(el("div", "exp-empty", "Bu ay için kayıtlı harcama yok. Yukarıdan ekleyebilirsin."));
    return;
  }
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = showAllExpenses ? sorted : sorted.slice(0, 6);
  shown.forEach((e) => {
    const f = e.itemId ? findItem(e.itemId) : null;
    const color = f ? f.cat.color : "#9aa0a6";
    const label = f ? f.it.label : e.itemId ? "Silinmiş kalem" : "Plan dışı";
    const [, mm, dd] = e.date.split("-");
    const row = el("div", "exp-row",
      `<span class="exp-date">${dd}.${mm}</span>
       <span class="exp-label"><i class="dot" style="background:${color}"></i>${esc(label)}</span>
       <span class="exp-note">${e.pay && e.pay !== "cash" ? `<span class="pay-badge">💳 ${esc((data.cards.find((c) => c.id === e.pay) || { label: "silinmiş kart" }).label)}</span>` : ""}${esc(e.note || "")}</span>
       <span class="exp-amt">${fmt(e.amount)}</span>`);
    row.appendChild(delBtn(() => {
      data.expenses = data.expenses.filter((x) => x !== e);
      if (Cloud.active) Cloud.deleteExpense(e);
    }, "Harcamayı sil"));
    box.appendChild(row);
  });
  if (sorted.length > 6) {
    const more = el("button", "link-btn exp-more", showAllExpenses ? "Daha az göster" : `Tümünü göster (${sorted.length})`);
    more.type = "button";
    more.addEventListener("click", () => { showAllExpenses = !showAllExpenses; update(); });
    box.appendChild(more);
  }
}

// choosing an item pre-fills how it's usually paid (its own method, else the default)
function prefillPayFromItem() {
  const f = expItem.value && expItem.value !== "__other" ? findItem(expItem.value) : null;
  const p = f ? payOf(f.it) : data.defaultPay || "cash";
  if ([...expPay.options].some((o) => o.value === p)) expPay.value = p;
  expInst.value = f ? String(itemInst(f.it)) : "1";
  syncInstallmentField();
}
