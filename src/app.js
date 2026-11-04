// asahikasei_aek 클라이언트 — 언어 전환, 분류 필터, 검색, 탭.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const LANGS = ["ko", "en", "ja"];
  const koTitle = document.title;

  // ---------- 언어 ----------
  // 속성(placeholder·aria-label)은 data-<속성>-<언어>에 들어 있어요. 한국어 원본은 처음 값을 기억해 둬요.
  const ATTRS = ["placeholder", "aria-label"];
  const attrEls = ATTRS.flatMap((a) => $$(`[data-${a}-en]`).map((el) => [el, a, el.getAttribute(a)]));
  function setLang(l, save) {
    if (!LANGS.includes(l)) l = "ko";
    html.setAttribute("data-lang", l);
    html.lang = l;
    document.title = l === "ko" ? koTitle : html.getAttribute(`data-title-${l}`) || koTitle;
    for (const [el, a, ko] of attrEls) el.setAttribute(a, l === "ko" ? ko : el.getAttribute(`data-${a}-${l}`) || ko);
    $$("[data-set-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setLang === l)));
    const sel = $("[data-lang-select]"); if (sel) sel.value = l;
    if (save) try { localStorage.setItem("aek-lang", l); } catch (e) {}
    filterAll();
  }
  $$("[data-set-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.setLang, true)));
  $("[data-lang-select]")?.addEventListener("change", (e) => setLang(e.target.value, true));

  // ---------- 분류 칩 + 검색 ----------
  const lists = $$("[data-list]");
  const state = new Map(lists.map((l) => [l, { cat: "", q: "" }]));
  function filter(list) {
    const st = state.get(list);
    let shown = 0;
    for (const row of $$("[data-cat]", list)) {
      const ok = (!st.cat || row.dataset.cat === st.cat) && (!st.q || (row.dataset.search || "").includes(st.q));
      row.hidden = !ok; if (ok) shown++;
    }
    const empty = list.parentElement.querySelector("[data-empty]");
    if (empty) empty.hidden = shown > 0 || !$$("[data-cat]", list).length;
  }
  function filterAll() { lists.forEach(filter); }
  $$("[data-chips]").forEach((group) => {
    const list = group.parentElement.querySelector("[data-list]");
    group.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      $$("[data-cat]", group).forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      if (list) { state.get(list).cat = b.dataset.cat; filter(list); }
    });
  });
  const search = $("[data-search-input]");
  if (search) {
    const list = $("[data-list]");
    const q0 = new URLSearchParams(location.search).get("q");
    if (q0) search.value = q0;
    const run = () => { state.get(list).q = search.value.trim().toLowerCase(); filter(list); };
    search.addEventListener("input", run);
    run();
  }

  // ---------- 탭 (기업별·소재별) ----------
  const tabs = $$("[data-tab]");
  function openTab(id, focus) {
    tabs.forEach((t) => { const on = t.dataset.tab === id; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    $$("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== id; });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => openTab(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      openTab(n.dataset.tab, true);
    });
  });
  if (/^#mat-/.test(location.hash) && tabs.length) { openTab("mat"); document.getElementById(location.hash.slice(1))?.scrollIntoView(); }

  // ---------- 지역 필터 ----------
  const regions = $("[data-regions]");
  regions?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-region]"); if (!b) return;
    $$("[data-region]", regions).forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
    $$(".co[data-region]").forEach((c) => { c.hidden = !!b.dataset.region && c.dataset.region !== b.dataset.region; });
  });

  setLang(html.getAttribute("data-lang"), false);
})();
