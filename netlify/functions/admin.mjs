/**
 * 관리자 조회 API — Netlify Functions v2
 *
 * ┌─ 이 파일이 존재하는 이유 ─────────────────────────────────────────────┐
 * │ anon key 는 INSERT 만 할 수 있게 RLS 를 걸어놨습니다. 즉 브라우저에서는  │
 * │ 제출 내역을 절대 읽을 수 없습니다 — 그게 설계 의도입니다.               │
 * │ 조회하려면 RLS 를 우회하는 service_role 키가 필요한데, 이 키는 DB 전체를 │
 * │ 여는 만능 키라 브라우저에 내려보내면 안 됩니다.                         │
 * │ 그래서 키를 서버(이 함수)에만 두고, 브라우저에는 결과만 넘깁니다.        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * 필요한 환경변수 (Netlify Site configuration → Environment variables):
 *   SUPABASE_URL                 이미 설정됨
 *   SUPABASE_SERVICE_ROLE_KEY    ★ 새로 필요 — 절대 저장소에 넣지 말 것
 *   ADMIN_PASSWORD               ★ 새로 필요 — 충분히 긴 무작위 문자열
 */

export const config = { path: '/api/admin' };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });

/** 타이밍 공격을 막기 위해 길이와 무관하게 전체를 비교합니다. */
function safeEqual(a = '', b = '') {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** 010-1234-5678 → 010-****-5678 */
const maskPhone = (p) =>
  !p ? null : p.replace(/(\d{2,3})-?(\d{3,4})-?(\d{4})/, (_, a, b, c) => `${a}-${'*'.repeat(b.length)}-${c}`);

/** hong@example.com → ho***@example.com */
const maskEmail = (e) => {
  if (!e) return null;
  const [id, domain] = e.split('@');
  if (!domain) return '***';
  return `${id.slice(0, 2)}${'*'.repeat(Math.max(1, id.length - 2))}@${domain}`;
};

/** 홍길동 → 홍*동 */
const maskName = (n) => {
  if (!n) return null;
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n.at(-1)}`;
};

const round1 = (n) => Math.round(n * 10) / 10;

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405);

  const URL_ = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PASSWORD = process.env.ADMIN_PASSWORD;

  const missing = [
    !URL_ && 'SUPABASE_URL',
    !SERVICE && 'SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD && 'ADMIN_PASSWORD',
  ].filter(Boolean);

  if (missing.length) {
    return json({
      error: `환경변수 ${missing.join(', ')} 가 설정되지 않았습니다. `
           + 'Netlify → Site configuration → Environment variables 에서 등록한 뒤 재배포하세요.',
      missing,
    }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  if (!safeEqual(body.password ?? '', PASSWORD)) {
    // 무차별 대입을 조금이라도 늦춥니다.
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
  }

  const reveal = body.reveal === true;

  const res = await fetch(
    `${URL_}/rest/v1/care_submissions?select=id,created_at,age,has_dementia,benefit_tier,score,predicted_grade,care_scenario,monthly_cost,wants_consult,name,phone,email,consent_at,utm_source&order=created_at.desc`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
  );

  if (!res.ok) {
    return json({ error: `데이터 조회 실패 (${res.status})` }, 502);
  }
  const rows = await res.json();

  // ── 집계 ────────────────────────────────────────────────────────────────
  const consults = rows.filter((r) => r.wants_consult);
  const scored = rows.filter((r) => typeof r.score === 'number');
  const costed = rows.filter((r) => typeof r.monthly_cost === 'number' && r.monthly_cost > 0);

  const countBy = (list, key) => {
    const m = new Map();
    for (const r of list) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
    return m;
  };

  const gradeCounts = countBy(rows, 'predicted_grade');
  const byGrade = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ grade: g, count: gradeCounts.get(g) ?? 0 }));

  const scenarioCounts = countBy(rows, 'care_scenario');
  const byScenario = ['home', 'day', 'fac', 'hosp']
    .map((s) => ({ scenario: s, count: scenarioCounts.get(s) ?? 0 }));

  // 최근 30일 일별 추이 (빈 날짜도 0으로 채웁니다 — 시간 축이 끊기면 안 됩니다)
  const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
  const subsByDay = countBy(rows.map((r) => ({ d: dayKey(r.created_at) })), 'd');
  const consByDay = countBy(consults.map((r) => ({ d: dayKey(r.created_at) })), 'd');

  const daily = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    daily.push({ day: k, submissions: subsByDay.get(k) ?? 0, consults: consByDay.get(k) ?? 0 });
  }

  const avg = (list, f) => (list.length ? list.reduce((a, r) => a + f(r), 0) / list.length : 0);

  return json({
    generatedAt: new Date().toISOString(),
    revealed: reveal,
    totals: {
      submissions: rows.length,
      consults: consults.length,
      conversion: rows.length ? consults.length / rows.length : 0,
      avgScore: round1(avg(scored, (r) => r.score)),
      avgCost: Math.round(avg(costed, (r) => r.monthly_cost)),
      avgAge: Math.round(avg(rows.filter((r) => r.age), (r) => r.age)),
      dementiaRate: rows.length ? rows.filter((r) => r.has_dementia).length / rows.length : 0,
    },
    byGrade,
    byScenario,
    daily,
    consults: consults.slice(0, 100).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      name: reveal ? r.name : maskName(r.name),
      phone: reveal ? r.phone : maskPhone(r.phone),
      email: reveal ? r.email : maskEmail(r.email),
      predicted_grade: r.predicted_grade,
      score: r.score,
      monthly_cost: r.monthly_cost,
      care_scenario: r.care_scenario,
      utm_source: r.utm_source,
    })),
  });
};
