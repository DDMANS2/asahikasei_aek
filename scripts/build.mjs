#!/usr/bin/env node
// asahikasei_aek 정적 사이트 생성기 — 프레임워크·npm 패키지 없이 Node(22)만 사용합니다.
// data/*.json(브리핑·기준 데이터)을 검증하고, 3개 언어(ko·en·ja)를 한 페이지에 담은 HTML을 dist/에 만듭니다.
// 언어 전환은 주소를 나누지 않고 페이지 안에서 바꿉니다: 글자마다 <span data-l="ko|en|ja">를 두고,
// <html data-lang>에 따라 CSS가 해당 언어만 보여줘요(src/lang.js가 첫 화면 전에 언어를 정함).
import { readFile, writeFile, mkdir, rm, cp, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const readJson = async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8"));
const config = await readJson("site-config.json");
const ref = await readJson("data/reference.json");
const { issues: rawIssues } = await readJson("data/issues.json");
const ORIGIN = (process.env.SITE_ORIGIN || config.origin).replace(/\/$/, "");
const LANGS = ["ko", "en", "ja"];

// ---------- 검증 ----------
const errors = [];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const CAT = new Map(ref.categories.map((c) => [c.id, c]));
const MAT = new Map(ref.materials.map((m) => [m.id, m]));
const COMP = new Map(ref.companies.map((c) => [c.id, c]));
const REG = new Map(ref.regions.map((r) => [r.id, r]));
const tri = (o, at, { req = true } = {}) => {
  if (o == null) { if (req) errors.push(`${at} 누락`); return; }
  for (const l of LANGS) if (typeof o[l] !== "string" || !o[l].trim()) errors.push(`${at}.${l} 누락`);
};
for (const c of ref.companies) if (!REG.has(c.region)) errors.push(`reference.companies.${c.id}.region 오류`);
const seenDate = new Set(), seenStory = new Set();
rawIssues.forEach((is, i) => {
  const at = `issues[${i}]`;
  if (!isDate(is.date)) errors.push(`${at}.date 형식 오류`);
  if (seenDate.has(is.date)) errors.push(`${at}.date 중복`);
  seenDate.add(is.date);
  tri(is.title, `${at}.title`); tri(is.summary, `${at}.summary`);
  for (const l of LANGS) if (!Array.isArray(is.highlights?.[l]) || is.highlights[l].length < 1) errors.push(`${at}.highlights.${l} 누락`);
  if (is.term) { tri(is.term.name, `${at}.term.name`); tri(is.term.desc, `${at}.term.desc`); }
  if (!Array.isArray(is.stories) || !is.stories.length) errors.push(`${at}.stories 비어 있음`);
  (is.stories || []).forEach((s, j) => {
    const p = `${at}.stories[${j}]`;
    if (!s.id || seenStory.has(s.id)) errors.push(`${p}.id 누락 또는 중복`);
    seenStory.add(s.id);
    if (!CAT.has(s.category)) errors.push(`${p}.category는 ${[...CAT.keys()].join("/")} 중 하나`);
    tri(s.title, `${p}.title`); tri(s.summary, `${p}.summary`);
    if (s.background) tri(s.background, `${p}.background`);
    if (s.subject) tri(s.subject, `${p}.subject`);
    if (!isHttps(s.source?.url)) errors.push(`${p}.source.url은 https 링크여야 합니다`);
    if (!s.source?.name) errors.push(`${p}.source.name 누락`);
    if (s.source?.date && !isDate(s.source.date)) errors.push(`${p}.source.date 형식 오류`);
    for (const r of s.related || []) if (!isHttps(r.url) || !r.name) errors.push(`${p}.related 오류`);
    for (const c of s.companies || []) if (!COMP.has(c)) errors.push(`${p}.companies에 모르는 기업 id: ${c}`);
    for (const m of s.materials || []) if (!MAT.has(m)) errors.push(`${p}.materials에 모르는 소재 id: ${m}`);
  });
});
if (errors.length) { console.error("✗ 데이터 검증 실패\n  " + errors.join("\n  ")); process.exit(1); }

const issues = [...rawIssues].sort((a, b) => b.date.localeCompare(a.date));
const allStories = issues.flatMap((is) => is.stories.map((s) => ({ ...s, issueDate: is.date })));
const latestDate = issues[0]?.date;
const daysBefore = (d, n) => new Date(Date.parse(d + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);
const within = (n) => (latestDate ? allStories.filter((s) => s.issueDate > daysBefore(latestDate, n)) : []);

// ---------- 글자 도우미 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 3개 언어 글자: {ko,en,ja} → 언어별 <span>. 문자열이면 그대로.
const T = (o) => (o && typeof o === "object" ? LANGS.map((l) => `<span data-l="${l}" lang="${l}">${esc(o[l])}</span>`).join("") : esc(o));
const tx = (ko, en, ja) => T({ ko, en, ja });
// 언어별 속성: placeholder·aria-label 등 (app.js가 바꿔 끼움)
const A = (name, o) => `${name}="${esc(o.ko)}" ${LANGS.slice(1).map((l) => `data-${name}-${l}="${esc(o[l])}"`).join(" ")}`;
const plain = (o, l = "ko") => (o && typeof o === "object" ? o[l] : o) || "";
const allText = (o) => (o && typeof o === "object" ? LANGS.map((l) => o[l]).join(" ") : o || "");
const WD = { ko: "일월화수목금토", ja: "日月火水木金土" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EWD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateT = (d) => {
  const t = new Date(d + "T00:00:00Z"), w = t.getUTCDay(), dot = d.replaceAll("-", ".");
  return tx(`${dot} (${WD.ko[w]})`, `${EWD[w]}, ${MON[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`, `${dot} (${WD.ja[w]})`);
};
const shortDate = (d) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8))}` : "");
const pad = (n) => String(n).padStart(2, "0");
const issuePath = (d) => (d === latestDate ? "/" : `/daily/${d}/`);
const ext = 'target="_blank" rel="noopener noreferrer"';
const ICON = {
  logo: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A8D0F5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11 9l-2 3h4l-2 3"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  globe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>',
  out: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ---------- 정적 파일 해시(캐시 갱신용) ----------
const SRC = join(ROOT, "src");
const srcFiles = (await readdir(SRC)).filter((f) => !f.startsWith("."));
const hash = createHash("sha1");
for (const f of srcFiles.sort()) hash.update(await readFile(join(SRC, f)));
const V = hash.digest("hex").slice(0, 10);

// ---------- 공통 틀 ----------
const NAV = [
  ["home", "/", tx("오늘의 브리핑", "Today", "今日のブリーフィング"), tx("오늘", "Today", "今日")],
  ["news", "/news/", tx("뉴스", "News", "ニュース"), tx("뉴스", "News", "ニュース")],
  ["trends", "/trends/", tx("기업·소재 동향", "Companies & Materials", "企業・材料の動向"), tx("기업·소재", "Companies", "企業・材料")],
  ["insights", "/insights/", tx("인포그래픽", "Infographics", "インフォグラフィック"), tx("인포그래픽", "Charts", "グラフ")],
  ["archive", "/archive/", tx("지난 브리핑", "Archive", "過去のブリーフィング"), tx("지난 브리핑", "Archive", "過去分")],
];
const LANG_LABEL = { ko: "한국어", en: "EN", ja: "日本語" };
const LANG_FULL = { ko: "한국어", en: "English", ja: "日本語" };

function layout({ title, description, path, active, body, noindex = false, jsonLd }) {
  const canonical = ORIGIN + path;
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...jsonLd }).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html>
<html lang="ko" data-lang="ko" ${LANGS.slice(1).map((l) => `data-title-${l}="${esc(title[l])}"`).join(" ")}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.ko)}</title>
<meta name="description" content="${esc(description.ko)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.brand)}">
<meta property="og:title" content="${esc(title.ko)}">
<meta property="og:description" content="${esc(description.ko)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="ko_KR"><meta property="og:locale:alternate" content="en_US"><meta property="og:locale:alternate" content="ja_JP">
<meta name="theme-color" content="#0B2E5C">
<link rel="icon" href="/favicon.svg?v=${V}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/styles.css?v=${V}">
<script src="/lang.js?v=${V}"></script>
<script src="/app.js?v=${V}" defer></script>
${ld}
</head>
<body>
<a class="skip" href="#main">${tx("본문으로 바로가기", "Skip to content", "本文へ移動")}</a>
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="${esc(config.brand)} home">
      <span class="brand-mark">${ICON.logo}</span>
      <span class="brand-txt"><strong>${esc(config.brand)}</strong><span class="brand-tag">${T(config.tagline)}</span></span>
    </a>
    <div class="lang" role="group" ${A("aria-label", { ko: "언어 선택", en: "Language", ja: "言語" })}>
      ${LANGS.map((l) => `<button type="button" data-set-lang="${l}" lang="${l}" aria-pressed="${l === "ko"}">${LANG_LABEL[l]}</button>`).join("")}
    </div>
    <label class="lang-sel">${ICON.globe}<span class="sr">Language / 언어 / 言語</span>
      <select data-lang-select>${LANGS.map((l) => `<option value="${l}" lang="${l}">${LANG_FULL[l]}</option>`).join("")}</select>
    </label>
    <nav class="nav" ${A("aria-label", { ko: "주요 메뉴", en: "Main menu", ja: "メインメニュー" })}>
      ${NAV.map(([id, href, full, short]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ""}><span class="nav-full">${full}</span><span class="nav-short">${short}</span></a>`).join("")}
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="ftr">
  <div class="wrap ftr-in">
    <div class="ftr-about">
      <strong>${esc(config.brand)}</strong>
      <p>${tx("2차전지 산업 소식을 매일 한국어·영어·일본어로 정리해요. 기사는 AI가 공식 원문을 바탕으로 요약하며, 틀린 내용이 있을 수 있어요. 중요한 판단 전에는 원문을 꼭 확인하세요.",
        "Battery industry news, summarized daily in Korean, English and Japanese. Stories are AI summaries of official sources and may contain errors — check the original before relying on them.",
        "二次電池業界のニュースを毎日、韓国語・英語・日本語でまとめます。記事は公式の原文をもとにAIが要約しており、誤りが含まれる場合があります。重要な判断の前には必ず原文をご確認ください。")}</p>
      <p class="ftr-note">${tx("개인이 운영하는 비공식 사이트이며, 특정 기업과 관계가 없습니다.", "An unofficial, personally run site. Not affiliated with any company.", "個人が運営する非公式サイトです。特定の企業とは関係ありません。")}</p>
    </div>
    <nav class="ftr-nav" ${A("aria-label", { ko: "바닥 메뉴", en: "Footer menu", ja: "フッターメニュー" })}>
      ${NAV.map(([, href, full]) => `<a href="${href}">${full}</a>`).join("")}
    </nav>
  </div>
</footer>
</body>
</html>`;
}

// ---------- 조각 ----------
const catName = (id) => T(CAT.get(id)?.name);
const sourceLine = (s) => `${esc(s.source.name)}${s.source.date ? ` · ${shortDate(s.source.date)}` : ""}`;
const searchKey = (s) => esc([allText(s.title), allText(s.summary), s.source?.name, ...(s.companies || []).map((c) => allText(COMP.get(c).name)), ...(s.materials || []).map((m) => allText(MAT.get(m).name))].join(" ").toLowerCase());

function storyRow(s, { showIssue = false, hl = 3 } = {}) {
  return `<article class="row" id="${esc(s.id)}" data-cat="${s.category}" data-search="${searchKey(s)}">
    <span class="tag">${catName(s.category)}</span>
    <div class="row-body">
      <h${hl} class="row-title"><a href="${esc(s.source.url)}" ${ext}>${T(s.title)}</a></h${hl}>
      <p>${T(s.summary)}</p>
      ${(s.companies || []).length || (s.materials || []).length ? `<p class="row-tags">${[...(s.companies || []).map((c) => T(COMP.get(c).name)), ...(s.materials || []).map((m) => T(MAT.get(m).name))].map((x) => `<span>${x}</span>`).join("")}</p>` : ""}
    </div>
    <div class="row-meta">
      <span>${sourceLine(s)}</span>
      ${showIssue ? `<a href="${issuePath(s.issueDate)}#${esc(s.id)}">${tx("브리핑에서 보기 →", "In briefing →", "ブリーフィングで見る →")}</a>` : ""}
    </div>
  </article>`;
}

function chips(group, list) {
  return `<div class="chips" role="group" ${A("aria-label", { ko: "분류", en: "Category", ja: "分類" })} data-chips="${group}">
    <button type="button" class="chip on" data-cat="" aria-pressed="true">${tx("전체", "All", "すべて")}</button>
    ${list.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${T(c.name)}</button>`).join("")}
  </div>`;
}

const emptyMsg = (o) => `<p class="empty" data-empty hidden>${T(o)}</p>`;
const NO_MATCH = { ko: "조건에 맞는 소식이 없어요.", en: "No stories match.", ja: "条件に合うニュースはありません。" };

function materialCards(stories, { linkAll = true } = {}) {
  return `<div class="mat-grid">${ref.materials.map((m) => {
    const n = stories.filter((s) => (s.materials || []).includes(m.id)).length;
    return `<a class="mat" href="/trends/#mat-${m.id}">
      <span class="mat-bar" aria-hidden="true"></span>
      <strong>${T(m.name)}</strong>
      <span class="mat-desc">${T(m.desc)}</span>
      <span class="mono">${tx(`이번 주 소식 ${n}건`, `${n} ${n === 1 ? "story" : "stories"} this week`, `今週のニュース ${n}件`)}</span>
    </a>`;
  }).join("")}</div>`;
}

function issueBody(is) {
  const main = is.stories.find((s) => s.format === "main") || is.stories[0];
  const rest = is.stories;
  const usedCats = ref.categories.filter((c) => rest.some((s) => s.category === c.id));
  const idx = issues.indexOf(is);
  const prev = issues[idx + 1], next = issues[idx - 1];
  return `<div class="wrap">
  <div class="date-strip">
    <span class="ds-left"><span class="dot" aria-hidden="true"></span>${dateT(is.date)} · No.${pad(is.edition || 1)}</span>
    <span>${is.date === latestDate ? tx("매일 아침 자동 업데이트", "Updated automatically every morning", "毎朝自動更新") : `<a href="/">${tx("오늘의 브리핑으로 →", "Go to today →", "今日のブリーフィングへ →")}</a>`}</span>
  </div>

  <section class="hero">
    <article class="top" id="${esc(main.id)}">
      <div class="top-visual">
        <span class="mono kicker">TODAY’S TOP · ${catName(main.category)}</span>
        <span class="top-subject">${main.subject ? T(main.subject) : catName(main.category)}</span>
      </div>
      <div class="top-body">
        <span class="tag">${catName(main.category)}</span>
        <h1>${T(main.title)}</h1>
        <p>${T(main.summary)}</p>
        ${main.background ? `<p class="top-bg">${T(main.background)}</p>` : ""}
        <div class="btns">
          <a class="btn btn-ink" href="${esc(main.source.url)}" ${ext}>${ICON.out}${tx("공식 발표 원문", "Official source", "公式発表の原文")}</a>
          ${(main.related || []).map((r) => `<a class="btn btn-line" href="${esc(r.url)}" ${ext}>${esc(r.name)}</a>`).join("")}
        </div>
        <p class="src">${sourceLine(main)}</p>
      </div>
    </article>
    <aside class="tldr">
      <div class="tldr-head"><h2>${tx("오늘의 3줄 요약", "Today in 3 lines", "今日の3行まとめ")}</h2><span class="mono">TL;DR</span></div>
      <ol>${[0, 1, 2].filter((i) => is.highlights.ko[i]).map((i) => `<li><span class="mono">0${i + 1}</span><span>${T({ ko: is.highlights.ko[i], en: is.highlights.en[i] || is.highlights.ko[i], ja: is.highlights.ja[i] || is.highlights.ko[i] })}</span></li>`).join("")}</ol>
      ${is.term ? `<div class="term"><span class="mono">${tx("오늘의 배터리 용어", "Battery term of the day", "今日の電池用語")}</span><p><b>${T(is.term.name)}</b> — ${T(is.term.desc)}</p></div>` : ""}
    </aside>
  </section>

  <section class="block">
    <div class="block-head"><h2>${tx("오늘의 소식", "Today’s stories", "今日のニュース")}</h2><span class="mono">${tx(`${rest.length}건`, `${rest.length} stories`, `${rest.length}件`)}</span></div>
    ${chips("issue", usedCats)}
    <div class="rows" data-list="issue">${rest.map((s) => storyRow(s)).join("")}</div>
    ${emptyMsg(NO_MATCH)}
  </section>

  <section class="block">
    <div class="block-head"><h2>${tx("소재별 동향", "By material", "材料別の動向")}</h2><a class="btn btn-line" href="/trends/">${tx("기업·소재 동향 전체 보기", "All companies & materials", "企業・材料の動向をすべて見る")}</a></div>
    ${materialCards(allStories.filter((s) => s.issueDate > daysBefore(is.date, 7) && s.issueDate <= is.date))}
  </section>

  <nav class="pager" ${A("aria-label", { ko: "다른 날 브리핑", en: "Other days", ja: "他の日のブリーフィング" })}>
    ${prev ? `<a class="btn btn-line" href="${issuePath(prev.date)}">← ${dateT(prev.date)}</a>` : "<span></span>"}
    ${next ? `<a class="btn btn-line" href="${issuePath(next.date)}">${dateT(next.date)} →</a>` : "<span></span>"}
  </nav>
</div>`;
}

function pageHead({ kicker, h1, lede }) {
  return `<div class="page-head"><span class="mono kicker">${kicker}</span><h1>${T(h1)}</h1>${lede ? `<p class="lede">${T(lede)}</p>` : ""}</div>`;
}

const EMPTY_HOME = `<div class="wrap"><section class="empty-home">
  <span class="mono kicker">BATTERY DAILY</span>
  <h1>${tx("첫 브리핑을 준비하고 있어요", "The first briefing is on its way", "最初のブリーフィングを準備中です")}</h1>
  <p>${tx("매일 아침 2차전지 소식을 자동으로 모아 이곳에 올려요. 조금만 기다려 주세요.", "Battery news is collected automatically every morning and posted here. Please check back soon.", "毎朝、二次電池のニュースを自動で集めてここに掲載します。もうしばらくお待ちください。")}</p>
</section></div>`;

// ---------- 페이지 ----------
const pages = [];
const page = (path, opts) => pages.push([path, layout({ path, ...opts })]);
const desc = config.description;
const brandTitle = (o) => Object.fromEntries(LANGS.map((l) => [l, `${o[l]} | ${config.brand}`]));

// 홈 + 날짜별
if (issues.length) {
  for (const is of issues) {
    const isLatest = is.date === latestDate;
    page(issuePath(is.date), {
      title: isLatest ? Object.fromEntries(LANGS.map((l) => [l, `${config.brand} — ${plain(config.tagline, l)} | ${is.title[l]}`])) : brandTitle(Object.fromEntries(LANGS.map((l) => [l, `${is.date} · ${is.title[l]}`]))),
      description: Object.fromEntries(LANGS.map((l) => [l, is.summary[l]])),
      active: isLatest ? "home" : "archive",
      jsonLd: { "@type": "NewsArticle", headline: is.title.ko, datePublished: `${is.date}T07:00:00+09:00`, inLanguage: LANGS, url: ORIGIN + issuePath(is.date), publisher: { "@type": "Organization", name: config.brand } },
      body: issueBody(is),
    });
  }
} else {
  page("/", { title: Object.fromEntries(LANGS.map((l) => [l, `${config.brand} — ${plain(config.tagline, l)}`])), description: desc, active: "home", body: EMPTY_HOME });
}

// 뉴스: 전체 기사 검색·필터
page("/news/", {
  title: brandTitle({ ko: "2차전지 뉴스 모아보기", en: "Battery news", ja: "二次電池ニュース一覧" }),
  description: { ko: "지금까지 브리핑에 실린 2차전지 소식을 분류·검색으로 찾아보세요.", en: "Search every battery story from past briefings by category or keyword.", ja: "これまでのブリーフィングに掲載された二次電池ニュースを分類・キーワードで探せます。" },
  active: "news",
  body: `<div class="wrap page">
    ${pageHead({ kicker: "NEWS", h1: { ko: "2차전지 뉴스", en: "Battery news", ja: "二次電池ニュース" }, lede: { ko: "지금까지 실린 모든 소식이에요. 분류를 고르거나 기업·소재 이름으로 검색해 보세요.", en: "Every story so far. Pick a category or search by company or material.", ja: "これまでのすべてのニュースです。分類を選ぶか、企業名・材料名で検索してください。" } })}
    <label class="search">${ICON.search}<span class="sr">${tx("뉴스 검색", "Search news", "ニュース検索")}</span>
      <input type="search" data-search-input ${A("placeholder", { ko: "기업·소재·키워드 검색", en: "Search companies, materials, keywords", ja: "企業・材料・キーワードで検索" })}>
    </label>
    ${chips("news", ref.categories)}
    <div class="rows" data-list="news">${allStories.map((s) => storyRow(s, { showIssue: true, hl: 2 })).join("") || ""}</div>
    ${allStories.length ? emptyMsg(NO_MATCH) : `<p class="empty">${tx("아직 실린 소식이 없어요.", "No stories yet.", "まだニュースがありません。")}</p>`}
  </div>`,
});

// 기업·소재 동향 (최근 30일)
const last30 = within(30);
const companyStats = ref.companies.map((c) => ({ c, list: last30.filter((s) => (s.companies || []).includes(c.id)) })).sort((a, b) => b.list.length - a.list.length);
const maxC = Math.max(1, ...companyStats.map((x) => x.list.length));
const latestLink = (s) => `<a href="${issuePath(s.issueDate)}#${esc(s.id)}">${T(s.title)}</a>`;
page("/trends/", {
  title: brandTitle({ ko: "기업·소재 동향", en: "Companies & materials", ja: "企業・材料の動向" }),
  description: { ko: "배터리 기업과 양극재·음극재·전해질·분리막 등 소재별로 최근 30일 소식을 모았어요.", en: "Recent 30-day battery news by company and by material: cathode, anode, electrolyte, separator and more.", ja: "電池メーカーと、正極材・負極材・電解質・セパレーターなどの材料別に、直近30日のニュースをまとめました。" },
  active: "trends",
  body: `<div class="wrap page">
    ${pageHead({ kicker: `COMPANIES &amp; MATERIALS${latestDate ? ` · ${latestDate.replaceAll("-", ".")}` : ""}`, h1: { ko: "기업·소재 동향", en: "Companies & materials", ja: "企業・材料の動向" }, lede: { ko: "배터리를 만드는 회사와 배터리에 들어가는 소재별로 최근 30일 동안 브리핑에 실린 소식을 모아 봐요.", en: "Stories from the last 30 days of briefings, grouped by battery maker and by material.", ja: "直近30日間のブリーフィングに掲載されたニュースを、電池メーカー別・材料別にまとめました。" } })}
    <div class="tabs" role="tablist" ${A("aria-label", { ko: "보기 방식", en: "View", ja: "表示" })}>
      <button type="button" role="tab" id="tab-co" aria-controls="panel-co" aria-selected="true" class="on" data-tab="co">${tx("기업별", "By company", "企業別")}</button>
      <button type="button" role="tab" id="tab-mat" aria-controls="panel-mat" aria-selected="false" data-tab="mat">${tx("소재별", "By material", "材料別")}</button>
    </div>
    <div role="tabpanel" id="panel-co" aria-labelledby="tab-co" data-panel="co">
      <div class="chips" role="group" ${A("aria-label", { ko: "지역", en: "Region", ja: "地域" })} data-regions>
        <button type="button" class="chip on" data-region="" aria-pressed="true">${tx("전체", "All", "すべて")}</button>
        ${ref.regions.map((r) => `<button type="button" class="chip" data-region="${r.id}" aria-pressed="false">${T(r.name)}</button>`).join("")}
      </div>
      <div class="co-grid">${companyStats.map(({ c, list }) => `<article class="co" data-region="${c.region}">
        <div class="co-top"><span class="tag">${T(REG.get(c.region).name)} · ${T(c.role)}</span><span class="mono">${tx(`최근 30일 ${list.length}건`, `${list.length} in 30 days`, `直近30日 ${list.length}件`)}</span></div>
        <h2>${T(c.name)}</h2>
        <div class="meter" aria-hidden="true"><span style="width:${Math.round((list.length / maxC) * 100)}%"></span></div>
        <p class="co-latest">${list[0] ? `${tx("최신:", "Latest:", "最新：")} ${latestLink(list[0])}` : tx("최근 30일 동안 실린 소식이 없어요.", "No stories in the last 30 days.", "直近30日間のニュースはありません。")}</p>
      </article>`).join("")}</div>
    </div>
    <div role="tabpanel" id="panel-mat" aria-labelledby="tab-mat" data-panel="mat" hidden>
      <div class="mat-list">${ref.materials.map((m) => {
        const list = last30.filter((s) => (s.materials || []).includes(m.id));
        return `<article class="mat-card" id="mat-${m.id}">
          <span class="mat-bar" aria-hidden="true"></span>
          <div class="co-top"><h2>${T(m.name)}</h2><span class="mono">${tx(`최근 30일 ${list.length}건`, `${list.length} in 30 days`, `直近30日 ${list.length}件`)}</span></div>
          <p class="mat-desc">${T(m.desc)}</p>
          ${list.length ? `<ul>${list.slice(0, 3).map((s) => `<li>${latestLink(s)}<span class="mono">${shortDate(s.issueDate)}</span></li>`).join("")}</ul>` : `<p class="co-latest">${tx("최근 30일 동안 실린 소식이 없어요.", "No stories in the last 30 days.", "直近30日間のニュースはありません。")}</p>`}
        </article>`;
      }).join("")}</div>
    </div>
  </div>`,
});

// 인포그래픽 (최근 30일)
const bars = (rows) => {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<ul class="bars">${rows.map((r) => `<li><span class="bar-label">${r.label}</span><span class="bar"><span style="width:${Math.round((r.n / max) * 100)}%"></span></span><span class="mono">${r.n}</span></li>`).join("")}</ul>`;
};
page("/insights/", {
  title: brandTitle({ ko: "숫자로 보는 2차전지 소식", en: "Battery news in numbers", ja: "数字で見る二次電池ニュース" }),
  description: { ko: "최근 30일 동안 실린 2차전지 소식을 분류·기업·소재별 그래프로 보여 드려요.", en: "Charts of the last 30 days of battery stories by category, company and material.", ja: "直近30日間の二次電池ニュースを、分類・企業・材料別のグラフで紹介します。" },
  active: "insights",
  body: `<div class="wrap page">
    ${pageHead({ kicker: "INFOGRAPHICS", h1: { ko: "숫자로 보는 2차전지 소식", en: "Battery news in numbers", ja: "数字で見る二次電池ニュース" }, lede: { ko: "최근 30일 동안 브리핑에 실린 소식을 세어 본 그래프예요. 숫자는 이 사이트에 실린 기사 수예요.", en: "Counts of stories in the last 30 days of briefings on this site.", ja: "直近30日間にこのサイトのブリーフィングに掲載された記事数のグラフです。" } })}
    ${last30.length ? `<div class="chart-grid">
      <section class="card"><h2>${tx("분류별", "By category", "分類別")}</h2>${bars(ref.categories.map((c) => ({ label: T(c.name), n: last30.filter((s) => s.category === c.id).length })))}</section>
      <section class="card"><h2>${tx("소재별", "By material", "材料別")}</h2>${bars(ref.materials.map((m) => ({ label: T(m.name), n: last30.filter((s) => (s.materials || []).includes(m.id)).length })))}</section>
      <section class="card"><h2>${tx("많이 나온 기업", "Most mentioned companies", "よく登場した企業")}</h2>${bars(companyStats.filter((x) => x.list.length).slice(0, 8).map(({ c, list }) => ({ label: T(c.name), n: list.length })))}</section>
      <section class="card"><h2>${tx("날짜별 소식 수", "Stories per day", "日別のニュース数")}</h2>${bars(issues.slice(0, 14).map((is) => ({ label: esc(shortDate(is.date)), n: is.stories.length })))}</section>
    </div>` : `<p class="empty">${tx("아직 그래프를 그릴 소식이 없어요.", "Not enough stories for charts yet.", "まだグラフにできるニュースがありません。")}</p>`}
  </div>`,
});

// 지난 브리핑
page("/archive/", {
  title: brandTitle({ ko: "지난 브리핑", en: "Archive", ja: "過去のブリーフィング" }),
  description: { ko: "날짜별 2차전지 브리핑 목록입니다.", en: "Every daily battery briefing, by date.", ja: "日付別の二次電池ブリーフィング一覧です。" },
  active: "archive",
  body: `<div class="wrap page">
    ${pageHead({ kicker: "ARCHIVE", h1: { ko: "지난 브리핑", en: "Archive", ja: "過去のブリーフィング" } })}
    ${issues.length ? `<ol class="arch">${issues.map((is) => `<li><a href="${issuePath(is.date)}">
      <span class="mono">${dateT(is.date)} · No.${pad(is.edition || 1)}</span>
      <strong>${T(is.title)}</strong>
      <span class="arch-n">${tx(`소식 ${is.stories.length}건`, `${is.stories.length} stories`, `ニュース ${is.stories.length}件`)}</span>
    </a></li>`).join("")}</ol>` : `<p class="empty">${tx("아직 발행된 브리핑이 없어요.", "No briefings yet.", "まだブリーフィングがありません。")}</p>`}
  </div>`,
});

page("/404.html", {
  title: brandTitle({ ko: "페이지를 찾을 수 없어요", en: "Page not found", ja: "ページが見つかりません" }), noindex: true,
  description: { ko: "요청한 페이지가 없습니다.", en: "This page does not exist.", ja: "このページは存在しません。" },
  body: `<div class="wrap page">${pageHead({ kicker: "404", h1: { ko: "여기엔 볼 게 없어요", en: "Nothing here", ja: "ここには何もありません" } })}<a class="btn btn-ink" href="/">${tx("오늘의 브리핑", "Today’s briefing", "今日のブリーフィング")}</a></div>`,
});

// ---------- 출력 ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const f of srcFiles) await cp(join(SRC, f), join(DIST, f));
for (const [path, html] of pages) {
  // 접근성: 제목 단계(h1→h2→h3)를 건너뛰면 빌드를 멈춰 알려 줘요
  const hs = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) { console.error(`✗ ${path}: 제목 단계가 h${hs[i - 1]}에서 h${hs[i]}로 건너뜁니다`); process.exit(1); }
  const file = join(DIST, path.endsWith("/") ? path + "index.html" : path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
const sm = pages.filter(([p]) => p !== "/404.html").map(([p]) => `<url><loc>${ORIGIN}${p}</loc>${latestDate ? `<lastmod>${p.startsWith("/daily/") ? p.slice(7, 17) : latestDate}</lastmod>` : ""}</url>`);
await writeFile(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sm.join("\n")}\n</urlset>\n`);
await writeFile(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
console.log(`✓ ${issues.length}개 호 · ${allStories.length}개 기사 · ${pages.length}개 페이지 빌드 완료 → dist/  (origin: ${ORIGIN})`);
