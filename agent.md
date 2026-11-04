# agent.md — asahikasei_aek 작업 하네스

AI 에이전트(Claude 등)가 이 저장소에서 작업을 이어받을 때 **먼저 읽는 안내서**예요. 작업 전에 `git pull`로 최신 상태를 받아요(매일 봇이 데이터를 커밋해요).

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 서비스 | asahikasei_aek — 2차전지(배터리) 산업 데일리 브리핑. **사내 사람만 보는 용도**(검색엔진 차단). 비공식 표시는 푸터에 |
| 저장소 | GitHub `DDMANS2/asahikasei_aek` (`main`) |
| 주소 | Cloudflare Pages `asahikasei-aek` → https://asahikasei-aek.pages.dev (Pages 이름에는 `_`를 못 써서 하이픈) |
| 언어 | 한국어·영어·일본어. **주소를 나누지 않고 페이지 안에서 전환**(사용자 요청) |
| 만든 방식 | 프레임워크·npm 없이 Node 22로 정적 생성 (`scripts/build.mjs`) |
| 디자인 | Claude Design 캔버스 "asahikasei_aek 디자인" — 연 블루 퍼스널 컬러, 제목은 진한 블루(#0B2E5C) |
| 자동 갱신 | GitHub Actions `daily-update.yml` → Claude API(웹 검색)로 3개 언어 브리핑 작성 → `main` 커밋 → 자동 배포 |
| API 키 | 같은 Console 계정의 키를 이 저장소 Secrets에 **`ASAHIKASEI_AEK`** 이름으로 등록함(워크플로는 `ANTHROPIC_API_KEY`도 받음). 크레딧은 ai-peekme와 같이 씀. 키는 **만료 안 함**으로 만들어서 `ANTHROPIC_KEY_EXPIRES`는 비워 둠 |

## 2. 사용자와 일하는 방식

- **항상 한국어**, 쉬운 말. "만들고 → 커밋 → 푸시 → 배포 확인"까지 한 묶음. 확인 못 한 것은 못 했다고 말해요.
- 범위를 넓히지 않아요. 모바일·태블릿 화면을 항상 함께 고려해요.

## 3. 구조

```
site-config.json        사이트 이름·주소·설명(3개 언어)
data/reference.json     분류·소재·지역·기업 목록(3개 언어 이름). 기사 태그는 여기 id만 허용
data/issues.json        날짜별 브리핑 (generate-issue.mjs가 맨 앞에 추가)
src/                    그대로 복사: styles.css, app.js(전환·필터·검색·탭), lang.js(첫 화면 언어), favicon.svg, _headers
scripts/build.mjs       검증 + dist/ 생성 (/, /daily/날짜/, /news/, /trends/, /insights/, /archive/, 404, sitemap, robots)
scripts/generate-issue.mjs  Claude API + 웹 검색으로 오늘 호 작성 (ko·en·ja)
functions/api/visit.js  방문자 수 API (Pages Functions + D1 바인딩 DB)
```

## 4. 언어 전환 방식

- 글자마다 `<span data-l="ko|en|ja">`를 넣고, `<html data-lang>`에 맞는 것만 CSS로 보여줘요(빌드의 `T()`/`tx()`).
- placeholder·aria-label은 `data-<속성>-en/ja`에 두고 `app.js`가 바꿔요(`A()`). 페이지 제목은 `<html data-title-en/ja>`.
- 첫 언어: 예전에 고른 언어(localStorage `aek-lang`) → 브라우저 언어(ko/ja/en) → 그 밖은 영어. JS가 없으면 한국어.
- 화면: 641px 이상은 KO·EN·JA 버튼, 640px 이하는 드롭다운. 일본어는 메뉴가 길어 메뉴를 둘째 줄로 내려요.

## 5. 명령

```bash
node scripts/build.mjs                       # 검증 + dist/ 생성 (실패하면 멈춤 = 정상)
cd dist && python3 -m http.server 8765       # 미리보기 (_headers는 적용 안 됨)
ANTHROPIC_API_KEY=... node scripts/generate-issue.mjs [YYYY-MM-DD] [--force]
```

## 6. 규칙

- 비밀 정보(API 키·토큰)는 절대 커밋하지 않아요. Secrets·환경변수로만.
- 기사 사실은 실제로 확인한 원문(https)이 있을 때만. 기업·소재 태그는 `reference.json`의 id만.
- 외부 글은 HTML에 넣을 때 `esc()`. 제목 단계(h1→h2→h3)를 건너뛰면 빌드가 멈춰요.
- 실제 회사 로고·브랜드 색은 쓰지 않아요(비공식 사이트임을 유지).

## 7. 이 프로젝트에서 한 일

1. Claude Design으로 시안 3장(PC 홈·기업·소재 동향·모바일 홈) 제작, 연 블루/진한 블루.
2. 사이트 뼈대·3개 언어 전환·자동 작성 스크립트·워크플로 작성. 첫 커밋 시점에는 브리핑 데이터가 없어 "첫 브리핑 준비 중" 화면이 보여요.
3. 로컬에서 시험용 가짜 데이터(커밋 안 함)로 320·375·768·1024·1280px, 언어 전환·검색·필터·탭을 Playwright Chromium으로 확인.

4. 기사마다 **분리막 사업 관점 코멘트**(`impact`: stance positive/negative/mixed/neutral + pros·cons 3개 언어). 사용자는 아사히카세이 분리막 사업 관점(습식 Hipore·건식 Celgard)을 원함. AI 의견이며 회사 공식 견해가 아님을 화면·푸터에 표시. 회사 내부 사정·수치는 지어내지 않도록 프롬프트에 명시.

5. **사내용으로 전환**: 모든 페이지 `noindex, nofollow, noarchive`, `_headers`에 `X-Robots-Tag`, robots.txt `Disallow: /`, 사이트맵 없음. 주소를 아는 사람은 여전히 열 수 있으니 접근 제한은 Cloudflare Access(사용자 설정)로 해요.

6. **방문자 수(오늘·전체)**: ai-peekme와 같은 방식. `functions/api/visit.js`(D1, 브라우저당 하루 1번, 로봇·헤드리스 제외, 표는 처음 쓸 때 자동 생성) + `functions/_middleware.js`(CORS `*` 제거). 헤더에 표시, 휴대폰은 메뉴 아래 한 줄. D1이 연결 안 되면 숨김. 메뉴는 모든 화면에서 둘째 줄로 고정.

## 8. 아직 할 일

- 사용자: Cloudflare Pages 프로젝트 연결(빌드 명령 `node scripts/build.mjs`, 출력 `dist`, `NODE_VERSION=22`), Secrets에 `ANTHROPIC_API_KEY` 등록, Actions 수동 실행으로 첫 호 만들기.
- 사용자: D1 데이터베이스(예: `asahikasei-aek-visits`) 만들고 Pages 프로젝트 Settings → Bindings에 **변수 이름 `DB`**로 연결 → 재배포해야 방문자 수가 보여요.
