#!/usr/bin/env node
// 오늘 자 2차전지 브리핑을 Claude API(웹 검색 도구)로 만들어 data/issues.json 맨 앞에 추가합니다.
// 모든 글은 한국어·영어·일본어 3개로 함께 씁니다.
// 사용: ANTHROPIC_API_KEY=... node scripts/generate-issue.mjs [YYYY-MM-DD] [--force]
// ⚠ AI가 작성한 글입니다. 링크·형식 검증을 통과한 것만 저장되지만, 틀린 내용이 있을 수 있어요.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
if (!KEY) { console.error("ANTHROPIC_API_KEY 환경변수가 필요합니다."); process.exit(1); }

const args = process.argv.slice(2);
const force = args.includes("--force");
const date = args.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const FILE = join(ROOT, "data/issues.json");
const db = JSON.parse(await readFile(FILE, "utf8"));
const ref = JSON.parse(await readFile(join(ROOT, "data/reference.json"), "utf8"));
if (db.issues.some((i) => i.date === date)) {
  if (!force) { console.log(`${date} 호가 이미 있어 건너뜁니다.`); process.exit(0); }
  db.issues = db.issues.filter((i) => i.date !== date); // 새 호가 만들어질 때만 저장되므로 실패해도 기존 호는 안전
}
const recentTitles = db.issues.slice(0, 7).flatMap((i) => i.stories.map((s) => s.title.ko));
const CAT_IDS = ref.categories.map((c) => c.id);
const COMP_IDS = ref.companies.map((c) => c.id);
const MAT_IDS = ref.materials.map((m) => m.id);

const prompt = `당신은 2차전지(배터리) 산업 데일리 브리핑 "asahikasei_aek"의 편집자입니다. 오늘은 ${date}(KST)입니다.
독자는 한국·일본·영어권의 직장인, 투자자, 학생이며 배터리 전문가가 아닐 수도 있습니다.

웹 검색으로 최근 48시간 안에 발표·보도된 2차전지 관련 소식을 찾아 의미 있는 4~8건을 고르세요.
범위: 배터리 셀·팩, 양극재·음극재·전해질·분리막 등 소재, 전고체 등 차세대 전지, 재활용, 정책·규제·관세, 기업 실적·투자·공장.
한국어·일본어·영어 매체와 기업·기관 공식 발표를 모두 찾아보세요(예: 기업 보도자료, 정부 발표, 전문 매체).

규칙:
- 반드시 실제로 검색해서 확인한 사실만 쓰고, 각 기사에 실제로 열어본 https 원문 URL을 넣으세요. 추측·지어낸 수치 금지.
- 회사가 발표한 수치는 "회사 측 발표"임을 밝히고, 예정·루머와 확정 사실을 구분하세요.
- 원문 문장을 그대로 옮기지 말고 자신의 말로 짧게 요약하세요.
- 모든 글자는 {"ko": "...", "en": "...", "ja": "..."} 3개 언어로 쓰세요. 한국어는 "~했습니다/~입니다" 체, 일본어는 です・ます체, 영어는 쉬운 뉴스 문체. 같은 내용이어야 합니다.
- 기업명·소재명은 각 언어에서 흔히 쓰는 표기를 쓰세요(예: 旭化成, LG에너지솔루션, CATL).
- 1건은 format "main"(오늘의 톱 뉴스, background 2~3문장 포함), 나머지는 "brief".
- category는 다음 id 중 하나: ${CAT_IDS.join(", ")} (cell=셀·팩, material=소재, nextgen=차세대 전지, recycle=리사이클, policy=정책·규제, biz=기업·투자)
- companies: 기사에 직접 나오는 기업만, 다음 id 중에서: ${COMP_IDS.join(", ")} (목록에 없는 기업은 넣지 마세요)
- materials: 기사와 직접 관련된 소재만, 다음 id 중에서: ${MAT_IDS.join(", ")}
- source.url은 가능하면 회사·기관의 공식 발표 원문을 우선하세요. 보도 기사면 source.name에 매체명을 쓰세요.
- 최근에 이미 다룬 주제는 새 진전이 없으면 제외: ${JSON.stringify(recentTitles)}

검색을 마친 뒤, 마지막 응답은 아래 JSON 객체 하나만 출력하세요(코드펜스·설명 없이):
{
  "date": "${date}",
  "title": {"ko": "오늘 호 제목(핵심 2~3개를 쉼표로)", "en": "...", "ja": "..."},
  "summary": {"ko": "2문장 요약", "en": "...", "ja": "..."},
  "highlights": {"ko": ["3줄 요약 1", "2", "3"], "en": ["...", "...", "..."], "ja": ["...", "...", "..."]},
  "term": {"name": {"ko": "오늘 기사에 나온 배터리 용어", "en": "...", "ja": "..."}, "desc": {"ko": "누구나 이해할 수 있는 2문장 설명", "en": "...", "ja": "..."}},
  "stories": [{
    "id": "영문-kebab-id-YYYYMMDD", "category": "cell", "format": "main|brief",
    "subject": {"ko": "핵심 대상 이름(20자 이내)", "en": "...", "ja": "..."},
    "title": {"ko": "...", "en": "...", "ja": "..."},
    "summary": {"ko": "2~3문장", "en": "...", "ja": "..."},
    "background": {"ko": "main만: 배경 설명 2~3문장", "en": "...", "ja": "..."},
    "companies": ["catl"], "materials": ["cathode"],
    "source": {"name": "매체·기관명", "date": "YYYY-MM-DD", "url": "https://..."},
    "related": [{"name": "관련 자료 이름", "url": "https://..."}]
  }]
}`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 16000,
    tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 14 }],
    messages: [{ role: "user", content: prompt }],
  }),
});
if (!res.ok) { console.error("API 오류", res.status, await res.text()); process.exit(1); }
const out = await res.json();
const text = out.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
let issue;
try { issue = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { console.error("JSON 파싱 실패:\n", text.slice(0, 2000)); process.exit(1); }

// ---------- 정리·검증 ----------
const LANGS = ["ko", "en", "ja"];
const triOk = (o) => o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim());
issue.date = date;
issue.edition = Math.max(0, ...db.issues.map((i) => i.edition || 0)) + 1;
issue.stories = (issue.stories || [])
  .filter((s) => /^https:\/\//.test(s?.source?.url || "") && s.source.name && CAT_IDS.includes(s.category) && triOk(s.title) && triOk(s.summary))
  .map((s) => {
    s.companies = (s.companies || []).filter((c) => COMP_IDS.includes(c));
    s.materials = (s.materials || []).filter((m) => MAT_IDS.includes(m));
    s.related = (s.related || []).filter((r) => r?.name && /^https:\/\//.test(r.url || ""));
    if (!s.related.length) delete s.related;
    if (!triOk(s.background)) delete s.background;
    if (!triOk(s.subject)) delete s.subject;
    if (s.source.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.source.date)) delete s.source.date;
    s.id = String(s.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 80) || `story-${Math.random().toString(36).slice(2, 8)}`;
    return s;
  });
// 같은 id가 이미 있으면 날짜를 붙여 구분
const used = new Set(db.issues.flatMap((i) => i.stories.map((s) => s.id)));
for (const s of issue.stories) { while (used.has(s.id)) s.id += `-${date.replaceAll("-", "")}`; used.add(s.id); }
if (issue.stories.length < 3) { console.error("유효한 기사가 3건 미만이라 중단합니다."); process.exit(1); }
if (!issue.stories.some((s) => s.format === "main")) issue.stories[0].format = "main";
if (!triOk(issue.title) || !triOk(issue.summary)) { console.error("호 제목·요약의 3개 언어가 모두 있어야 합니다."); process.exit(1); }
issue.highlights ||= {};
for (const l of LANGS) issue.highlights[l] = (issue.highlights?.[l] || []).filter(Boolean).slice(0, 3);
if (issue.term && !(triOk(issue.term.name) && triOk(issue.term.desc))) delete issue.term;

db.issues.unshift(issue);
await writeFile(FILE, JSON.stringify(db, null, 2) + "\n");
console.log(`✓ ${date} No.${issue.edition} 추가: ${issue.title.ko} (기사 ${issue.stories.length}건)`);
