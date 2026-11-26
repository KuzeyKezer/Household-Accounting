// helpers.js — formatting and small UI building blocks (inputs, labels, buttons, pickers)
// Loaded as a classic script (works when the page is opened from disk); shares globals with the others.
// Needs: dates.js, state.js; calls render()/update() from later files at event time

// ================== HELPERS ==================
const fmtNum = (n) => Math.round(n).toLocaleString("tr-TR");
const fmt = (n) => (n < 0 ? "-₺" : "₺") + fmtNum(Math.abs(n));
const fmtShort = (n) => n >= 1000 ? (n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + "B" : fmtNum(n);
const fmtRate = (n) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const pctStr = (n) => "%" + n.toFixed(1).replace(".", ",");
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const monthsOf = (it) => Math.max(1, Math.round(it.months || (it.period === "y" ? 12 : 1)));
const monthly = (it) => it.value / monthsOf(it);
const catTotal = (cat) => sum(cat.items.map(monthly));
const taxMult = () => 1 + (data.rates.kkdf + data.rates.bsmv) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const ref = (key) => document.querySelector(`[data-ref="${key}"]`);
const setText = (key, txt) => { const e = ref(key); if (e) e.textContent = txt; };

// ---- inputs ----
// Raw while focused, formatted when not. decimals=true allows "3,39".
function numInput(get, set, { prefix = "₺", suffix = "", decimals = false, big = false, label = "" } = {}) {
  const wrap = el("div", "money-input" + (big ? " big" : ""));
  if (prefix) wrap.appendChild(el("span", null, prefix));
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = decimals ? "decimal" : "numeric";
  input.autocomplete = "off";
  if (label) input.setAttribute("aria-label", label);
  wrap.appendChild(input);
  if (suffix) wrap.appendChild(el("span", null, suffix));

  const show = () => (input.value = decimals ? fmtRate(get()) : fmtNum(get()));
  show();
  input.addEventListener("focus", () => {
    const v = get();
    input.value = v ? (decimals ? String(v).replace(".", ",") : String(v)) : "";
    input.select();
  });
  input.addEventListener("input", () => {
    const clean = decimals ? input.value.replace(/[^\d.,]/g, "") : input.value.replace(/[^\d]/g, "");
    if (clean !== input.value) input.value = clean;
    const v = decimals ? parseFloat(clean.replace(",", ".")) : Number(clean);
    set(Number.isFinite(v) ? v : 0);
    update();
  });
  input.addEventListener("blur", show);
  return wrap;
}

function editableLabel(obj, cls = "item-label") {
  const span = el("span", cls + " editable");
  span.contentEditable = "true";
  span.spellcheck = false;
  span.textContent = obj.label;
  span.title = "Adını değiştirmek için tıkla";
  span.addEventListener("input", () => { obj.label = span.textContent.trim() || "İsimsiz"; update(); });
  span.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); span.blur(); } });
  span.addEventListener("click", (e) => e.preventDefault()); // don't toggle <details>
  span.addEventListener("keyup", (e) => e.preventDefault());
  return span;
}

function delBtn(onClick, title = "Sil") {
  const b = el("button", "del-btn", "×");
  b.type = "button";
  b.title = title;
  b.addEventListener("click", (e) => { e.preventDefault(); onClick(); render(); update(); });
  return b;
}

function addBtn(text, onClick) {
  const b = el("button", "add-btn", text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function focusLabel(id) {
  const lbl = document.querySelector(`[data-id="${id}"] .editable`);
  if (!lbl) return;
  lbl.focus();
  const r = document.createRange();
  r.selectNodeContents(lbl);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

function field(label, control) {
  const f = el("label", "dfield");
  f.appendChild(el("span", "dfield-label", label));
  f.appendChild(control);
  return f;
}

function segmented(options, value, onChange) {
  const wrap = el("div", "seg");
  Object.entries(options).forEach(([k, txt]) => {
    const b = el("button", k === value ? "active" : "", txt);
    b.type = "button";
    b.addEventListener("click", () => { onChange(k); render(); update(); });
    wrap.appendChild(b);
  });
  return wrap;
}


// month + year selects → "YYYY-MM"
function monthPicker(ym, onChange) {
  const wrap = el("span", "month-picker");
  const [y, m] = ym.split("-").map(Number);
  const ms = document.createElement("select");
  MONTHS.forEach((name, i) => ms.appendChild(new Option(name, pad(i + 1))));
  ms.value = pad(m);
  const ys = document.createElement("select");
  const cy = Number(CUR_YM.slice(0, 4));
  for (let yy = Math.min(cy - 1, y); yy <= Math.max(cy + 3, y); yy++) ys.appendChild(new Option(String(yy), String(yy)));
  ys.value = String(y);
  const fire = () => onChange(`${ys.value}-${ms.value}`);
  ms.addEventListener("change", fire);
  ys.addEventListener("change", fire);
  wrap.appendChild(ms);
  wrap.appendChild(ys);
  return wrap;
}
