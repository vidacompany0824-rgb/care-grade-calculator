/**
 * 돌봄비용 계산 엔진.
 * 등급 + 돌봄 시나리오 + 감경 구분 → 월 실제 본인부담금
 */
import {
  MONTHLY_LIMIT, FACILITY_DAILY, VISIT_CARE, VISIT_BATH, DAY_CARE,
  WELFARE_DEVICE_YEARLY, COPAY_RATE, WEEKS_PER_MONTH,
  DAYCARE_BONUS_THRESHOLD_DAYS, DAYCARE_BONUS_RATE, HOSPITAL_CAREGIVER,
} from './rates.js';

export const SCENARIOS = {
  home: '방문요양',
  day: '주야간보호',
  fac: '요양원',
  hosp: '요양병원',
};

const won = (n) => Math.round(n).toLocaleString('ko-KR');

/**
 * @param {object} o
 * @param {number} o.grade            0=등급외, 1~5, 6=인지지원
 * @param {'home'|'day'|'fac'|'hosp'} o.scenario
 * @param {'general'|'r40'|'r60'|'basic'} o.tier
 * @param {object} o.input            시나리오별 입력값
 * @returns {{rows:{k:string,v:number,c:string}[], total:number, covered:number,
 *            note:{type:string,html:string}, gross?:number, limit?:number}}
 */
export function calcCost({ grade, scenario, tier, input }) {
  const [homeRate, facRate] = COPAY_RATE[tier] ?? COPAY_RATE.general;

  // ── 요양병원: 장기요양보험이 아니라 건강보험 적용 ──
  if (scenario === 'hosp') {
    const caregiver = HOSPITAL_CAREGIVER[input.caregiver] ?? 0;
    return {
      rows: [
        { k: '건강보험 적용 진료·입원비 본인부담', v: input.medical, c: 'var(--info)' },
        { k: '간병비 (비급여)', v: caregiver, c: 'var(--warn)' },
      ],
      total: input.medical + caregiver,
      covered: 0,
      note: {
        type: 'warn',
        html: '요양병원은 장기요양보험이 아니라 <b>건강보험</b>이 적용되는 의료기관입니다. 장기요양등급과 무관하게 입원할 수 있지만 <b>간병비가 전액 본인부담</b>이라 실제 지출은 요양원보다 큰 경우가 많습니다. 요양원과 동시 이용은 불가합니다.',
      },
    };
  }

  // ── 등급외: 급여 자체를 쓸 수 없음 ──
  if (!grade) {
    return {
      rows: [], total: 0, covered: 0,
      note: {
        type: 'crit',
        html: '등급이 나오지 않으면 장기요양급여를 쓸 수 없어 <b>돌봄비용 전액이 본인 부담</b>이 됩니다. 대신 지자체의 <b>노인맞춤돌봄서비스</b>, 치매안심센터 프로그램, 가사·간병 방문지원사업을 확인해 보세요. 상태가 나빠지면 언제든 재신청할 수 있습니다.',
      },
    };
  }

  // ── 요양원(시설급여) ──
  if (scenario === 'fac') {
    if (grade === 6) {
      return {
        rows: [], total: 0, covered: 0,
        note: {
          type: 'crit',
          html: '<b>인지지원등급은 요양원(시설급여) 입소가 불가능합니다.</b> 주야간보호와 방문요양·복지용구만 이용할 수 있습니다. 다른 시나리오로 비교해 보세요.',
        },
      };
    }
    const daily = FACILITY_DAILY[grade];
    const gross = daily * 30;
    const self = gross * facRate;
    const rows = [
      { k: `시설급여 본인부담 (${(facRate * 100).toFixed(0)}%)`, v: self, c: 'var(--accent)' },
      { k: '식사재료비·간식비 (비급여)', v: input.meal, c: 'var(--warn)' },
    ];
    if (input.room > 0) rows.push({ k: '상급침실료 (비급여)', v: input.room, c: 'var(--crit)' });
    return {
      rows,
      total: self + input.meal + input.room,
      covered: gross - self,
      note: {
        type: '',
        html: `1일 수가 <b>${won(daily)}원</b> × 30일 = ${won(gross)}원 중 공단이 ${(100 - facRate * 100).toFixed(0)}%를 부담합니다. 비급여 항목은 시설마다 달라 입소 전 반드시 확인하세요.`,
      },
    };
  }

  // ── 재가급여 (방문요양 / 주야간보호) ──
  const limit = MONTHLY_LIMIT[grade];
  let gross = 0;

  if (scenario === 'home') {
    const visits = Math.round(input.perWeek * WEEKS_PER_MONTH);
    gross += VISIT_CARE[input.minutes] * visits;
    if (input.bathCount > 0) gross += VISIT_BATH[input.bathType] * input.bathCount;
  } else {
    const days = Math.round(input.daysPerWeek * WEEKS_PER_MONTH);
    gross += DAY_CARE[grade] * days;
  }

  // 주야간보호 월 15일 이상 → 월 한도액 20% 가산
  const monthlyDays = scenario === 'day' ? Math.round(input.daysPerWeek * WEEKS_PER_MONTH) : 0;
  const bonus = scenario === 'day' && monthlyDays >= DAYCARE_BONUS_THRESHOLD_DAYS;
  const effLimit = bonus ? Math.round(limit * (1 + DAYCARE_BONUS_RATE)) : limit;

  const inLimit = Math.min(gross, effLimit);
  const over = Math.max(0, gross - effLimit);
  const selfIn = inLimit * homeRate;
  const welfare = input.welfare ? Math.round((WELFARE_DEVICE_YEARLY / 12) * homeRate) : 0;

  const rows = [{ k: `한도 내 본인부담 (${(homeRate * 100).toFixed(0)}%)`, v: selfIn, c: 'var(--accent)' }];
  if (over > 0) rows.push({ k: '월 한도 초과분 (100% 본인부담)', v: over, c: 'var(--crit)' });
  if (welfare > 0) rows.push({ k: '복지용구 (연 160만원 한도 월 환산)', v: welfare, c: 'var(--info)' });

  let type = '';
  let html = `월 한도액 <b>${won(effLimit)}원</b>${bonus ? ' (월 15일 이상 이용으로 20% 가산 적용)' : ''} 중 <b>${won(gross)}원</b>을 사용해 ${Math.round((gross / effLimit) * 100)}% 소진합니다.`;
  if (over > 0) {
    type = 'crit';
    html += ` 초과한 ${won(over)}원은 공단 지원 없이 <b>전액 본인부담</b>입니다. 횟수나 시간을 줄이면 부담이 크게 내려갑니다.`;
  } else if (gross / effLimit < 0.6) {
    html += ` 한도가 ${won(effLimit - gross)}원 남아 있어 방문목욕이나 주야간보호를 더 붙일 수 있습니다.`;
  }

  return { rows, total: selfIn + over + welfare, covered: inLimit - selfIn, note: { type, html }, gross, limit: effLimit };
}
