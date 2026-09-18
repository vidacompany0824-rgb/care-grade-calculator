/**
 * Supabase 로 문진 결과를 보냅니다.
 *
 * Supabase JS SDK 를 쓰지 않고 REST API 를 직접 호출합니다.
 * 의존성이 0개라 빌드가 필요 없고, SDK 가 내부적으로 무슨 요청을 보내는지
 * 수강생이 그대로 볼 수 있습니다.
 *
 * anon key 는 브라우저에 노출되는 것이 정상입니다.
 * 데이터를 지키는 건 키가 아니라 RLS 정책입니다 (supabase/schema.sql 참고).
 */

const cfg = () => window.APP_CONFIG ?? {};

/** 환경변수가 주입됐는지 — 안 됐으면 계산기는 돌아가되 제출만 막습니다. */
export function isConfigured() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
  return Boolean(
    SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.startsWith('%%') && !SUPABASE_ANON_KEY.startsWith('%%')
  );
}

/** URL 쿼리에서 유입 경로를 뽑아냅니다. */
export function trackingInfo() {
  const q = new URLSearchParams(location.search);
  return {
    referrer: document.referrer || null,
    utm_source: q.get('utm_source'),
    utm_medium: q.get('utm_medium'),
    utm_campaign: q.get('utm_campaign'),
  };
}

/**
 * @param {object} row care_submissions 한 행
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function submitAssessment(row) {
  if (!isConfigured()) {
    return { ok: false, error: '서버가 아직 연결되지 않았습니다. 관리자에게 문의해 주세요.' };
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/care_submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        // 응답 본문을 받지 않습니다. RLS 가 SELECT 를 막고 있어서
        // return=representation 을 쓰면 오히려 권한 오류가 납니다.
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (res.ok) return { ok: true };

    const detail = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: '저장 권한이 없습니다. RLS 정책을 확인해 주세요.' };
    }
    if (detail.includes('consult_requires_consent')) {
      return { ok: false, error: '상담을 신청하려면 민감정보 수집 동의와 연락처가 필요합니다.' };
    }
    if (detail.includes('no_identity_without_consult')) {
      return { ok: false, error: '상담 신청을 선택하지 않으면 연락처를 저장할 수 없습니다.' };
    }
    return { ok: false, error: `저장에 실패했습니다 (${res.status}). 잠시 후 다시 시도해 주세요.` };
  } catch {
    return { ok: false, error: '네트워크 연결을 확인해 주세요.' };
  }
}
