// cloud.js — giriş (Google / e-posta), hesaba kayıt, ortak bütçe (davet kodu), yedek
// Loaded as a classic script; shares globals with the others.
// Needs: config.js, vendor/supabase.js and every app file above main.js.
//
// Model: the budget (plan, cards, loans, goals, settings) is one JSON document per household
// (table "budgets", saved with a version number so two devices can't silently overwrite each other).
// Expenses are separate rows (table "expenses") so adding one never clobbers someone else's edit.

const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const LOCAL_KEY = "ev-butcesi-v3";        // local-only mode data (state.js)
  const HH_KEY = "ev-butcesi-household";    // last opened household per user
  let client = null;
  let user = null;
  let household = null;     // { id, name, role }
  let version = 0;
  let ready = false;        // data for the current household is loaded
  let saveTimer = null;
  let saving = false;
  let dirty = false;
  let lastSaved = "";       // JSON of the budget as the server has it: skip saves when nothing changed
  let configError = "";

  // ---------- config check (refuse privileged keys) ----------
  function keyIsPrivileged(k) {
    if (/^sb_secret_/i.test(k)) return true;
    const parts = k.split(".");
    if (parts.length === 3) {
      try { return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch (e) {}
    }
    return false;
  }
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);
  if (enabled) {
    if (keyIsPrivileged(cfg.supabaseKey)) {
      configError = "config.js içine GİZLİ (secret / service_role) anahtar yazılmış. Bu anahtar bütün güvenlik kurallarını atlar ve herkese açık bir sayfada asla bulunmamalı. Supabase panelinden bu anahtarı hemen yenile (rotate) ve config.js'e sadece 'publishable' anahtarı yaz.";
    } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl)) {
      configError = "config.js içindeki supabaseUrl beklenen biçimde değil (https://xxxx.supabase.co).";
    } else if (!window.supabase || !window.supabase.createClient) {
      configError = "Supabase kütüphanesi yüklenemedi (js/vendor/supabase.js).";
    } else {
      client = window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/, ""), cfg.supabaseKey, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
  }

  // ---------- small UI helpers ----------
  const $ = (id) => document.getElementById(id);
  function setStatus(state, text) {
    const s = $("sync-status");
    if (!s) return;
    s.hidden = false;
    s.className = "sync-status " + state;
    s.textContent = text;
  }
  function authMsg(text, kind = "") {
    const m = $("auth-msg");
    m.className = "auth-msg " + kind;
    m.textContent = text;
  }
  const trErr = (e) => {
    const m = (e && (e.message || e.error_description || String(e))) || "Bilinmeyen hata";
    if (/Invalid login credentials/i.test(m)) return "E-posta ya da şifre hatalı.";
    if (/Email not confirmed/i.test(m)) return "E-postanı henüz doğrulamadın. Gelen kutuna (ve spam klasörüne) bak.";
    if (/User already registered/i.test(m)) return "Bu e-postayla zaten hesap var. Giriş yapmayı dene.";
    if (/Password should be at least/i.test(m)) return "Şifre en az 8 karakter olmalı.";
    if (/rate limit|too many/i.test(m)) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "İnternet bağlantısı yok ya da sunucuya ulaşılamıyor.";
    if (/kod gecersiz/i.test(m)) return "Davet kodu geçersiz, kullanılmış ya da süresi dolmuş.";
    return m;
  };

  // ---------- auth screen ----------
  let authMode = "signin"; // signin | signup | reset | newpass
  function showAuth(mode = authMode) {
    authMode = mode;
    $("auth-screen").hidden = false;
    $("app-root").hidden = true;
    const pw = $("auth-password");
    $("auth-title").textContent = { signin: "Giriş yap", signup: "Hesap oluştur", reset: "Şifreni sıfırla", newpass: "Yeni şifreni belirle" }[mode];
    $("auth-email-row").hidden = mode === "newpass";
    $("auth-password-row").hidden = mode === "reset";
    pw.autocomplete = mode === "signin" ? "current-password" : "new-password";
    pw.placeholder = mode === "signin" ? "Şifre" : "Şifre (en az 8 karakter)";
    $("auth-submit").textContent = { signin: "Giriş yap", signup: "Hesap oluştur", reset: "Sıfırlama bağlantısı gönder", newpass: "Şifreyi kaydet" }[mode];
    $("auth-google").hidden = mode === "newpass" || mode === "reset";
    $("auth-or").hidden = mode === "newpass" || mode === "reset";
    $("auth-switch").innerHTML = mode === "signin"
      ? `Hesabın yok mu? <a href="#" data-mode="signup">Hesap oluştur</a> · <a href="#" data-mode="reset">Şifremi unuttum</a>`
      : mode === "newpass" ? "" : `Hesabın var mı? <a href="#" data-mode="signin">Giriş yap</a>`;
    $("auth-switch").querySelectorAll("[data-mode]").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); authMsg(""); showAuth(a.dataset.mode); }));
  }
  function hideAuth() {
    $("auth-screen").hidden = true;
    $("app-root").hidden = false;
  }
  const redirectTo = () => location.origin + location.pathname;

  async function submitAuth(e) {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    const btn = $("auth-submit");
    btn.disabled = true;
    authMsg("");
    try {
      if (authMode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (authMode === "signup") {
        if (password.length < 8) throw new Error("Password should be at least 8 characters");
        const { data: d, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!d.session) authMsg("Neredeyse bitti! E-postana bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra buradan giriş yap.", "ok");
      } else if (authMode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        if (error) throw error;
        authMsg("Şifre sıfırlama bağlantısını e-postana gönderdik.", "ok");
      } else if (authMode === "newpass") {
        if (password.length < 8) throw new Error("Password should be at least 8 characters");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        authMsg("Şifren değişti.", "ok");
        await boot();
      }
    } catch (err) {
      authMsg(trErr(err), "err");
    } finally {
      btn.disabled = false;
    }
  }

  async function signInWithGoogle() {
    authMsg("");
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) authMsg(trErr(error), "err");
  }

  // ---------- loading a household ----------
  function rowToExpense(r) {
    return { id: r.id, date: r.date, itemId: r.item_id, amount: Number(r.amount), note: r.note || "", pay: r.pay || "cash" };
  }
  function expenseToRow(e) {
    return { id: e.id, household_id: household.id, date: e.date, item_id: e.itemId || null,
      amount: Math.round(Number(e.amount) * 100) / 100, note: (e.note || "").slice(0, 200), pay: e.pay || "cash" };
  }
  const budgetPayload = () => { const { expenses, ...rest } = data; return rest; };

  async function listHouseholds() {
    const { data: rows, error } = await client.from("household_members")
      .select("household_id, role, households(name)").eq("user_id", user.id);
    if (error) throw error;
    return rows.map((r) => ({ id: r.household_id, role: r.role, name: (r.households && r.households.name) || "Evim" }));
  }

  function localDataIfAny() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      const hasContent = (d.expenses && d.expenses.length) || (d.incomes || []).some((i) => i.value) ||
        (d.categories || []).some((c) => c.items.some((it) => it.value));
      return hasContent ? d : null;
    } catch (e) { return null; }
  }

  async function createFirstHousehold() {
    const local = localDataIfAny();
    let initial = emptyData(defaultData());
    let moveLocal = false;
    if (local && confirm("Bu cihazda daha önce girdiğin bir bütçe var. Hesabına taşınsın mı?\n\nTamam: taşı · İptal: boş bütçeyle başla")) {
      initial = migrate({ ...defaultData(), ...local });
      moveLocal = true;
    }
    const exps = moveLocal ? (initial.expenses || []) : [];
    const { expenses, ...doc } = initial;
    const { data: hid, error } = await client.rpc("create_household", { p_name: "Evim", p_data: doc });
    if (error) throw error;
    household = { id: hid, role: "owner", name: "Evim" };
    if (exps.length) {
      const rows = exps.map((e) => expenseToRow({ ...e, id: crypto.randomUUID() }));
      const { error: e2 } = await client.from("expenses").insert(rows);
      if (e2) throw e2;
    }
    return hid;
  }

  async function loadHousehold(h) {
    household = h;
    const [{ data: b, error: e1 }, { data: ex, error: e2 }] = await Promise.all([
      client.from("budgets").select("data, version").eq("household_id", h.id).single(),
      client.from("expenses").select("id, date, item_id, amount, note, pay").eq("household_id", h.id).order("date")
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    version = b.version;
    const doc = b.data && Object.keys(b.data).length ? b.data : emptyData(defaultData());
    const d = migrate({ ...defaultData(), ...doc });
    d.expenses = ex.map(rowToExpense);
    data = d;
    lastSaved = JSON.stringify(budgetPayload());
    CUR_YM = periodOf(todayStr());
    viewYM = CUR_YM;
    openAdv.clear();
    try { localStorage.setItem(HH_KEY + ":" + user.id, h.id); } catch (e) {}
  }

  async function boot() {
    try {
      setStatus("busy", "Yükleniyor…");
      let list = await listHouseholds();
      if (!list.length) { await createFirstHousehold(); list = await listHouseholds(); }
      let last = null;
      try { last = localStorage.getItem(HH_KEY + ":" + user.id); } catch (e) {}
      const h = list.find((x) => x.id === last) || list[0];
      ready = false;
      await loadHousehold(h);
      ready = true;
      hideAuth();
      render(); update();
      renderAccountPanel(list);
      setStatus("ok", "☁ Kaydedildi");
    } catch (err) {
      setStatus("err", "⚠ " + trErr(err));
      showAuth("signin");
      authMsg("Veriler yüklenemedi: " + trErr(err), "err");
    }
  }

  // ---------- saving ----------
  function scheduleSave() {
    if (!ready) return;
    // update() runs on every screen refresh (month change, tabs…): only save real changes,
    // otherwise other devices would get needless "conflict" reloads
    if (!dirty && !saving && JSON.stringify(budgetPayload()) === lastSaved) return;
    dirty = true;
    setStatus("busy", "Kaydediliyor…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 900);
  }
  async function flush() {
    if (!ready || saving || !dirty) return;
    saving = true;
    dirty = false;
    const payload = budgetPayload();
    const json = JSON.stringify(payload);
    if (json === lastSaved) { saving = false; setStatus("ok", "☁ Kaydedildi"); return; }
    try {
      const { data: v, error } = await client.rpc("save_budget",
        { p_household: household.id, p_data: payload, p_version: version });
      if (error) throw error;
      version = v;
      lastSaved = json;
      setStatus("ok", "☁ Kaydedildi");
    } catch (err) {
      if (/conflict/i.test(err.message || "")) {
        await reloadFromServer("Başka bir cihazda değişiklik yapılmış; en güncel hali yüklendi. Son yaptığın değişiklik kaydedilemedi, lütfen tekrar yap.");
      } else {
        dirty = true;
        setStatus("err", "⚠ Kaydedilemedi · tekrar denenecek");
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 5000);
      }
    } finally {
      saving = false;
      if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900); }
    }
  }
  async function reloadFromServer(message) {
    try {
      await loadHousehold(household);
      dirty = false;
      render(); update();
      setStatus("ok", "☁ Güncel");
      if (message) alert(message);
    } catch (err) {
      setStatus("err", "⚠ " + trErr(err));
    }
  }
  // when coming back to the tab: pick up changes made on another device
  async function checkRemote() {
    if (!ready || document.visibilityState !== "visible") return;
    const a = document.activeElement;
    // busy saving or typing: try again a bit later
    if (dirty || saving || (a && (a.tagName === "INPUT" || a.isContentEditable))) { setTimeout(checkRemote, 3000); return; }
    const { data: b, error } = await client.from("budgets").select("version").eq("household_id", household.id).single();
    if (error) return;
    if (b.version !== version) { await reloadFromServer(); return; }
    const { data: ex, error: e2 } = await client.from("expenses").select("id, date, item_id, amount, note, pay").eq("household_id", household.id).order("date");
    if (e2 || !ex) return;
    const sig = (list) => list.map((e) => e.id + ":" + Number(e.amount)).sort().join(",");
    if (sig(ex) !== sig(data.expenses)) { data.expenses = ex.map(rowToExpense); render(); update(); }
  }

  // ---------- expenses (called from expenses.js) ----------
  async function addExpense(e) {
    if (!ready) return;
    setStatus("busy", "Kaydediliyor…");
    const { error } = await client.from("expenses").insert(expenseToRow(e));
    if (error) {
      data.expenses = data.expenses.filter((x) => x !== e);
      render(); update();
      setStatus("err", "⚠ Harcama kaydedilemedi");
      alert("Harcama kaydedilemedi: " + trErr(error));
    } else setStatus("ok", "☁ Kaydedildi");
  }
  async function deleteExpense(e) {
    if (!ready) return;
    const { error } = await client.from("expenses").delete().eq("id", e.id).eq("household_id", household.id);
    if (error) {
      data.expenses.push(e);
      render(); update();
      alert("Harcama silinemedi: " + trErr(error));
    }
  }
  // replace everything (reset / restore from backup)
  async function replaceAll() {
    if (!ready) return;
    setStatus("busy", "Kaydediliyor…");
    const { error: e1 } = await client.from("expenses").delete().eq("household_id", household.id);
    if (e1) throw e1;
    if (data.expenses.length) {
      data.expenses = data.expenses.map((e) => ({ ...e, id: crypto.randomUUID() }));
      const { error: e2 } = await client.from("expenses").insert(data.expenses.map(expenseToRow));
      if (e2) throw e2;
    }
    dirty = true;
    await flush();
  }

  // ---------- account / household panel (Ayarlar) ----------
  function renderAccountPanel(list) {
    const box = $("account-panel");
    if (!box) return;
    box.hidden = false;
    $("acc-email").textContent = user.email || "";
    $("acc-household").textContent = household.name;
    const sel = $("acc-switch");
    sel.innerHTML = "";
    list.forEach((h) => sel.appendChild(new Option(h.name + (h.role === "owner" ? "" : " (ortak)"), h.id)));
    sel.value = household.id;
    $("acc-switch-row").hidden = list.length < 2;
    client.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", household.id)
      .then(({ count }) => { $("acc-members").textContent = count ? `${count} kişi` : ""; });
  }

  async function makeInvite() {
    const out = $("acc-invite-out");
    out.textContent = "Kod oluşturuluyor…";
    const { data: code, error } = await client.rpc("create_invite", { p_household: household.id });
    if (error) { out.textContent = trErr(error); return; }
    out.innerHTML = "";
    const c = el("b", "invite-code");
    c.textContent = code;
    out.appendChild(c);
    out.appendChild(document.createTextNode(" · 7 gün geçerli, tek kullanımlık. Bu kodu birlikte bütçe tutacağın kişiye ver; o da Ayarlar'dan \"Koda katıl\" yapsın."));
    try { await navigator.clipboard.writeText(code); out.appendChild(document.createTextNode(" (Kopyalandı)")); } catch (e) {}
  }
  async function joinWithCode() {
    const code = $("acc-join-code").value.trim();
    const msg = $("acc-join-msg");
    if (!code) { msg.textContent = "Kodu yaz."; return; }
    if (!confirm("Bu koda ait ortak bütçeye geçeceksin. Kendi bütçen silinmez, Ayarlar'dan iki bütçe arasında geçiş yapabilirsin. Devam?")) return;
    const { data: hid, error } = await client.rpc("join_household", { p_code: code });
    if (error) { msg.textContent = trErr(error); return; }
    try { localStorage.setItem(HH_KEY + ":" + user.id, hid); } catch (e) {}
    $("acc-join-code").value = "";
    msg.textContent = "";
    await boot();
  }
  async function switchHousehold(id) {
    await flush();
    try { localStorage.setItem(HH_KEY + ":" + user.id, id); } catch (e) {}
    await boot();
  }
  async function renameHousehold(name) {
    name = name.trim().slice(0, 80);
    if (!name) return;
    const { error } = await client.from("households").update({ name }).eq("id", household.id);
    if (!error) { household.name = name; renderAccountPanel(await listHouseholds()); }
  }
  async function signOut() {
    await flush();
    await client.auth.signOut();
    location.reload();
  }

  // ---------- start ----------
  function start() {
    $("auth-form").addEventListener("submit", submitAuth);
    $("auth-google").addEventListener("click", signInWithGoogle);
    $("acc-signout").addEventListener("click", signOut);
    $("acc-invite").addEventListener("click", makeInvite);
    $("acc-join").addEventListener("click", joinWithCode);
    $("acc-switch").addEventListener("change", (e) => switchHousehold(e.target.value));
    $("acc-rename").addEventListener("click", () => {
      const n = prompt("Bütçenin adı:", household ? household.name : "Evim");
      if (n) renameHousehold(n);
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkRemote(); });
    setInterval(checkRemote, 45000); // pick up other devices' changes while the app stays open
    window.addEventListener("beforeunload", (e) => { if (dirty || saving) { flush(); e.preventDefault(); e.returnValue = ""; } });

    if (configError || !client) {
      showAuth("signin");
      $("auth-form").hidden = true;
      $("auth-google").hidden = true;
      authMsg(configError || "Bağlantı kurulamadı.", "err");
      return;
    }
    let booted = false;
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { user = session && session.user; showAuth("newpass"); return; }
      if (session && session.user) {
        user = session.user;
        // remove ?code=… left by the Google / e-mail redirect
        if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
        if (!booted) { booted = true; setTimeout(boot, 0); }
      } else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        booted = false;
        ready = false;
        showAuth("signin");
        const p = new URLSearchParams(location.search);
        if (p.get("error_description")) authMsg(p.get("error_description"), "err");
      }
    });
  }

  return {
    enabled,
    get active() { return enabled && ready; },
    start, scheduleSave, addExpense, deleteExpense, replaceAll, flush
  };
})();
window.Cloud = Cloud;
