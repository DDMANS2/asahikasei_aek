// /api 응답에서 Cloudflare Pages가 기본으로 붙이는 와일드카드 CORS(access-control-allow-origin: *)를 걷어내요.
// 화면은 같은 출처에서 /api/visit를 부르므로 CORS 헤더가 필요 없어요. (함수는 /api 에만 실행돼요.)
const ALLOWED = ["https://asahikasei-aek.pages.dev"];

export async function onRequest({ request, next }) {
  const res = await next();
  const headers = new Headers(res.headers);
  headers.delete("access-control-allow-origin");
  const origin = request.headers.get("origin");
  if (origin && ALLOWED.includes(origin) && origin !== new URL(request.url).origin) headers.set("access-control-allow-origin", origin);
  headers.append("vary", "Origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
