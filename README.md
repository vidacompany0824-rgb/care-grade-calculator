# 요양등급·돌봄비용 계산기

국민건강보험공단 「장기요양인정조사표」 52개 항목을 문진해 **예상 인정점수와 등급별 판정 확률**을 내고,
2026년 수가 기준으로 **돌봄 방식별 월 실부담금**을 계산합니다.

> 골든레시피 교육 실습 자료 — GitHub → Netlify → Supabase 전 과정을 한 번에 따라가는 프로젝트입니다.

---

## 이 프로젝트로 배우는 것

| 주제 | 이 저장소에서 보는 곳 |
|---|---|
| 도메인 로직을 UI에서 분리하기 | `src/scoring.js`, `src/cost.js` — DOM을 전혀 모르는 순수 함수 |
| 매년 바뀌는 값을 한 곳에 모으기 | `src/rates.js` — 수가가 바뀌면 이 파일만 고치면 됩니다 |
| 비밀값을 저장소에 넣지 않고 배포하기 | `scripts/build.js` + Netlify 환경변수 |
| DB로 개인정보를 지키기 | `supabase/schema.sql` — RLS와 제약조건 |
| 확률로 답하기 | `src/scoring.js` — 점수 하나가 아니라 분포를 냅니다 |
| 의존성 없이 테스트하기 | `scripts/test.js` — node 기본 기능만 사용 |

**의존성 0개.** `node_modules` 없이 돌아갑니다. 빌드는 파일 복사 + 환경변수 치환이 전부입니다.

---

## 빠르게 실행하기

```bash
git clone https://github.com/vidacompany0824-rgb/care-grade-calculator.git
cd care-grade-calculator
npm run dev
```

`http://localhost:5173` 에서 열립니다.
Supabase를 아직 연결하지 않았다면 **계산기는 정상 동작하고 저장 기능만 비활성화**됩니다.

테스트:

```bash
npm test
```

---

## 전체 설정 (3단계)

### 1단계 — Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project** (리전은 `Northeast Asia (Seoul)` 권장)
2. 프로젝트가 만들어지면 **SQL Editor** 를 열고 [`supabase/schema.sql`](supabase/schema.sql) 을 통째로 붙여넣고 실행
3. **Project Settings → API** 에서 두 값을 복사

   | 대시보드 항목 | 환경변수 |
   |---|---|
   | Project URL | `SUPABASE_URL` |
   | Project API keys → `anon` `public` | `SUPABASE_ANON_KEY` |

> **`service_role` 키는 절대 쓰지 마세요.** RLS를 우회하는 관리자 키라서
> 브라우저에 노출되면 데이터베이스 전체가 열립니다. 반드시 `anon` 키입니다.

### 2단계 — 로컬에 연결하기

```bash
cp .env.example .env
# .env 를 열어 1단계에서 복사한 두 값을 붙여넣기
npm run dev
```

`.env` 는 `.gitignore` 에 있어 커밋되지 않습니다.

### 3단계 — Netlify에 배포하기

```bash
npx netlify-cli deploy --build --prod
```

또는 Netlify 대시보드에서 이 GitHub 저장소를 연결하면 `main` 에 push할 때마다 자동 배포됩니다.

배포 후 **Site configuration → Environment variables** 에 두 값을 등록하고 재배포하세요.
환경변수가 없으면 빌드는 성공하지만 저장 기능이 꺼진 채로 올라갑니다 (빌드 로그에 경고가 찍힙니다).

---

## 저장되는 데이터

동의한 경우에만 저장되며, 동의 수준에 따라 저장 범위가 달라집니다.

| | 익명 통계 동의 | 상담 신청 동의 |
|---|---|---|
| 연세·문진 응답·계산 결과 | ✅ | ✅ |
| 이름·연락처 | ❌ | ✅ |
| 개인 특정 가능 여부 | 불가 | 가능 |

### 동의 없이는 연락처가 저장될 수 없습니다

문진 응답은 **건강정보**이고, 여기에 연락처가 붙으면 개인정보보호법상 **민감정보**가 됩니다.
그래서 이 프로젝트는 프런트엔드 검증만 믿지 않고 **데이터베이스가 직접 거부**하도록 만들었습니다.

```sql
-- 상담을 신청하지 않으면 식별정보는 아예 저장될 수 없다
constraint no_identity_without_consult check (
  wants_consult or (name is null and phone is null and email is null)
)
```

프런트엔드 코드를 우회해 REST API를 직접 호출해도 이 제약은 뚫리지 않습니다.
**"검증은 가장 안쪽에서 한 번 더"** 가 이 파일의 교육 포인트입니다.

### anon key가 공개되는 건 정상입니다

`anon` 키는 브라우저에 노출되도록 설계된 공개 키입니다.
데이터를 지키는 건 키가 아니라 **RLS 정책**입니다.

```sql
-- INSERT 정책만 만들었으므로 SELECT/UPDATE/DELETE 는 전부 거부됩니다
create policy "anon can submit" on public.care_submissions
  for insert to anon, authenticated with check (true);
```

제출은 되지만 누구도 남의 제출 내용을 읽을 수 없습니다.
관리자 조회는 `service_role` 키로 서버에서만 하세요.

---

## 관리자 조회 페이지 (`/admin.html`)

제출 현황을 보는 화면입니다. **여기가 이 프로젝트에서 제일 중요한 교육 포인트입니다.**

anon key 는 INSERT 만 할 수 있으므로 브라우저에서는 제출 내역을 읽을 수 없습니다.
조회하려면 RLS 를 우회하는 `service_role` 키가 필요한데, 이 키는 DB 전체를 여는 만능 키라
브라우저에 내려보내면 안 됩니다. 그래서 키를 **서버리스 함수에만** 두고 결과만 넘깁니다.

```
브라우저  ──POST /api/admin (비밀번호)──▶  Netlify Function  ──service_role──▶  Supabase
   ▲                                          (키는 여기서만 존재)                   │
   └──────────── 집계된 결과 JSON ◀────────────────────────────────────────────────┘
```

### 필요한 환경변수 두 개

터미널에서 아래를 실행하세요. **두 값 모두 저장소에 들어가지 않습니다.**

```bash
# 1) service_role 키 — Supabase 대시보드 → Project Settings → API → service_role
npx netlify-cli env:set SUPABASE_SERVICE_ROLE_KEY "여기에_붙여넣기"

# 2) 관리자 비밀번호 — 무작위 생성하고 화면에 한 번만 보여줍니다
PW=$(openssl rand -base64 18); echo "관리자 비밀번호: $PW"; npx netlify-cli env:set ADMIN_PASSWORD "$PW"

# 3) 재배포
npx netlify-cli deploy --build --prod
```

### 민감정보 취급

상담 신청자의 이름·연락처는 **서버에서 마스킹해서** 내려옵니다
(`홍*동`, `010-****-5678`). 「연락처 보기」를 누를 때만 원본을 요청합니다.
마스킹을 클라이언트에서 하면 개발자도구로 원본이 보이므로 서버에서 처리합니다.

### 이 인증의 한계 — 솔직히

공유 비밀번호 한 개로 막는 방식입니다. 상수 시간 비교와 실패 시 지연은 넣었지만,
분산 무차별 대입에 대한 속도 제한은 없습니다. 실제 운영에서 민감정보를 다룬다면
Supabase Auth 로 관리자 계정을 만들고 RLS 정책을 붙이거나,
Netlify 의 사이트 비밀번호 보호를 함께 거는 편이 낫습니다.

---

## 프로젝트 구조

```
care-grade-calculator/
├── src/
│   ├── index.html          문진표 + 결과 레일
│   ├── privacy.html        개인정보처리방침 ⚠️ 사업자 정보 교체 필요
│   ├── styles.css          청자 팔레트, 라이트/다크 대응
│   ├── rates.js            2026년 수가 데이터 ← 매년 갱신
│   ├── grades.js           등급 구간 (변동 없음)
│   ├── questions.js        조사표 52항목 + 실습 사례 3종
│   ├── scoring.js          인정점수 추정 + 확률 분포
│   ├── cost.js             돌봄비용 계산
│   ├── submit.js           Supabase REST 호출 (SDK 미사용)
│   ├── config.template.js  빌드 시 환경변수가 주입되는 자리
│   ├── app.js              UI 컨트롤러
│   ├── admin.html          관리자 조회 (noindex)
│   ├── admin.css           차트 팔레트 (색맹 검증 통과)
│   └── admin.js            대시보드 + 인라인 SVG 차트
├── netlify/functions/
│   └── admin.mjs           service_role 은 여기에만 존재
├── scripts/
│   ├── build.js            src → dist 복사 + 환경변수 주입
│   └── test.js             로직 검증 19개
├── supabase/schema.sql     테이블 + RLS + 보관기간 자동 파기
├── netlify.toml            배포 설정 + 보안 헤더
└── .env.example
```

---

## 수가 갱신하는 법 (매년 12월)

보건복지부가 다음 해 수가 고시를 내면 [`src/rates.js`](src/rates.js) 한 파일만 고치면 됩니다.

1. 보건복지부 「장기요양급여 제공기준 및 급여비용 산정방법 등에 관한 고시」 최신본 확인
2. `MONTHLY_LIMIT`, `FACILITY_DAILY`, `VISIT_CARE`, `VISIT_BATH`, `DAY_CARE` 갱신
3. `RATE_YEAR`, `RATE_SOURCE` 갱신
4. `npm test` 로 회귀 확인 후 push

등급 구간(`src/grades.js`)은 바뀌지 않으므로 건드릴 필요가 없습니다.

---

## 수강생 실습 과제

1. **가중치를 흔들어 보기** — `src/scoring.js` 의 `WEIGHTS.nursing` 을 `1.70` 에서 `3.0` 으로 바꾸고 `npm test` 를 돌려 보세요. 어떤 테스트가 깨지고, 그게 무엇을 뜻하나요?
2. **경계선의 의미** — 사례 B는 58.6점으로 4등급 구간이지만 3등급 확률이 40%입니다. 점수 하나만 보여줬다면 사용자가 어떤 오해를 했을까요?
3. **비용 역전 찾기** — 요양원과 요양병원 탭을 비교해 보세요. 왜 '보험이 적용되는' 요양병원이 더 비쌀 수 있나요?
4. **제약조건 뚫어 보기** — 브라우저 콘솔에서 `submit.js` 를 우회해 연락처만 담은 요청을 직접 보내 보세요. 무엇이 막나요?
5. **수가 갱신 리허설** — 2025년 수가로 되돌린 브랜치를 만들고, 사례 B의 월 부담이 얼마나 달라지는지 계산해 보세요.

---

## 한계 — 반드시 읽어주세요

이 계산기의 점수는 **근사 모델**입니다.

공단의 실제 산정은 조사 결과를 8개 서비스군별 **수형분석(tree regression)** 모형에 넣어
필요 돌봄시간(분)을 추정하고 합산하는 방식인데, 이 모형은 공개되어 있지 않아 재현할 수 없습니다.
이 저장소의 가중치는 등급 구간 앵커(와상=1등급, 중등도 치매+부분도움=4등급 등)에 맞춰 보정한 값입니다.

또한 실제 등급은 인정점수만으로 정해지지 않습니다.
**의사소견서**와 **등급판정위원회 심의**가 결과를 바꿀 수 있으며, 특히 점수가 경계선일 때 그렇습니다.

**이 결과는 공식 판정이 아닙니다.** 실제 신청은 국민건강보험공단 지사,
[노인장기요양보험](https://www.longtermcare.or.kr), 1577-1000 에서 무료로 할 수 있습니다.

---

## 출처

보건복지부 「장기요양급여 제공기준 및 급여비용 산정방법 등에 관한 고시」
(2025.11.04. 개정 / 2026.01.01. 시행)

비급여 항목(식사재료비·상급침실료)은 시설마다 달라 입력값으로 조정합니다.
요양병원 비용은 건강보험 적용 항목으로 장기요양보험과 별개이며 참고용 범위입니다.
