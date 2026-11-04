// 방문자 수 (오늘·전체) — Cloudflare Pages Functions + D1 (ai-peekme와 같은 방식)
// Cloudflare Pages 설정 → 바인딩에 D1 데이터베이스를 변수 이름 "DB"로 연결하면 동작합니다.
// - 한 브라우저(익명 무작위 ID)를 하루 1번만 셉니다. IP 등 개인정보는 저장하지 않습니다.
// - "전체"는 날마다의 방문자 수를 모두 더한 값입니다 (블로그 방문자 수와 같은 방식).
// - 검색엔진 로봇은 세지 않습니다.

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|kakaotalk-scrap|yeti|daum|bingpreview|headless|lighthouse|curl|wget|python|node-fetch/i;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3600e3 - offset * 864e5).toISOString().slice(0, 10);

async function ensureTables(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, vid TEXT NOT NULL, PRIMARY KEY (day, vid))"),
    db.prepare("CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)"),
  ]);
}

async function readCounts(db, day) {
  const rows = await db.prepare("SELECT k, n FROM counters WHERE k IN ('total', ?1)").bind(`day:${day}`).all();
  const map = Object.fromEntries((rows.results || []).map((r) => [r.k, r.n]));
  return { today: map[`day:${day}`] || 0, total: map.total || 0 };
}

async function handle(request, env, count) {
  const db = env.DB;
  if (!db) return json({ error: "not_configured" }, 503);
  const day = kstDay();
  try {
    await ensureTables(db);
    if (count) {
      let vid = "";
      try { vid = String((await request.json()).vid || ""); } catch {}
      const ua = request.headers.get("user-agent") || "";
      if (/^[\w-]{8,64}$/.test(vid) && !BOT.test(ua)) {
        const ins = await db.prepare("INSERT OR IGNORE INTO visits (day, vid) VALUES (?1, ?2)").bind(day, vid).run();
        if (ins.meta && ins.meta.changes > 0) {
          await db.batch([
            db.prepare("INSERT INTO counters (k, n) VALUES ('total', 1) ON CONFLICT(k) DO UPDATE SET n = n + 1"),
            db.prepare("INSERT INTO counters (k, n) VALUES (?1, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(`day:${day}`),
          ]);
          // 오래된 중복 확인용 기록은 가끔 정리 (오늘·어제만 있으면 충분)
          if (Math.random() < 0.02) await db.prepare("DELETE FROM visits WHERE day < ?1").bind(kstDay(2)).run();
        }
      }
    }
    return json(await readCounts(db, day));
  } catch (e) {
    return json({ error: "db_error" }, 500);
  }
}

export const onRequestGet = ({ request, env }) => handle(request, env, false);
export const onRequestPost = ({ request, env }) => handle(request, env, true);
