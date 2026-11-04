# asahikasei_aek

2차전지(배터리) 산업 소식을 매일 **한국어·English·日本語**로 정리하는 비공식 데일리 브리핑 사이트입니다. 언어는 페이지 오른쪽 위 버튼(모바일은 드롭다운)으로 바꿔요.

> 개인이 운영하는 비공식 사이트이며, 특정 기업과 관계가 없습니다. 기사는 AI가 공식 원문을 바탕으로 요약하므로 틀린 내용이 있을 수 있어요.

## 페이지

| 주소 | 내용 |
|---|---|
| `/` | 오늘의 브리핑 (톱 뉴스, 3줄 요약, 오늘의 배터리 용어, 오늘의 소식, 소재별 동향) |
| `/daily/YYYY-MM-DD/` | 날짜별 브리핑 |
| `/news/` | 전체 기사 검색·분류 필터 |
| `/trends/` | 기업별·소재별 최근 30일 동향 (지역 필터) |
| `/insights/` | 분류·소재·기업·날짜별 그래프 |
| `/archive/` | 지난 브리핑 목록 |

## 매일 자동 갱신

`.github/workflows/daily-update.yml`이 매일 아침(06:17 KST, 실패 시 재시도) Claude API의 웹 검색으로 소식을 찾아 3개 언어로 쓰고, 검증을 통과하면 `main`에 커밋해요. Cloudflare Pages가 자동으로 배포해요.

필요한 설정: 저장소 **Settings → Secrets and variables → Actions → New repository secret**, 이름 `ANTHROPIC_API_KEY`.

## 배포 (Cloudflare Pages)

Git 연결 · 빌드 명령 `node scripts/build.mjs` · 출력 폴더 `dist` · 환경변수 `NODE_VERSION=22`.

## 직접 실행

```bash
node scripts/build.mjs
ANTHROPIC_API_KEY=... node scripts/generate-issue.mjs [YYYY-MM-DD] [--force]
```
