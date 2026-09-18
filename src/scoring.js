/**
 * 장기요양인정점수 추정 엔진.
 *
 * ⚠️ 중요 — 이것은 근사 모델입니다.
 * 공단의 실제 점수 산정은 조사 결과를 8개 서비스군별 수형분석(tree regression)
 * 모형에 넣어 필요 돌봄시간(분)을 추정하고 이를 합산하는 방식인데,
 * 그 모형은 공개되어 있지 않아 그대로 재현할 수 없습니다.
 *
 * 이 파일의 가중치는 등급 구간 앵커(와상=1등급, 중등도 치매+부분도움=4등급 등)에
 * 맞춰 보정한 값입니다. 결과는 점수 하나가 아니라 확률 분포로 돌려줍니다.
 */
import { GRADES } from './grades.js';

/** 기준선 — 신청자가 기본적으로 갖는 돌봄 필요시간 */
export const BASELINE = 25;

/** 영역별 가중치 (영역 점수 1점이 인정점수 몇 점에 해당하는가) */
export const WEIGHTS = {
  physical: 2.15, // 0~24점 → 최대 +51.6
  cognitive: 1.80, // 0~7점  → 최대 +12.6
  behavior: 0.85, // 0~14점 → 최대 +11.9
  nursing: 1.70, // 0~9점  → 최대 +15.3
  rehab: 0.30, // 0~20점 → 최대 +6.0
};

/** 추정의 불확실성 구간 (표준편차, 점) */
export const SIGMA = 5.5;

const sum = (a) => a.reduce((x, y) => x + y, 0);

/** 오차함수 근사 (Abramowitz & Stegun 7.1.26) */
function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/** 정규분포 누적분포함수 */
const cdf = (x, mean, sd) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));

/**
 * 문진 응답 → 인정점수
 * @param {{physical:number[],cognitive:number[],behavior:number[],nursing:number[],rehabMotor:number[],rehabJoint:number[]}} a
 */
export function calcScore(a) {
  const raw = {
    physical: sum(a.physical),
    cognitive: sum(a.cognitive),
    behavior: sum(a.behavior),
    nursing: sum(a.nursing),
    rehab: sum(a.rehabMotor) + sum(a.rehabJoint),
  };
  const parts = {
    physical: raw.physical * WEIGHTS.physical,
    cognitive: raw.cognitive * WEIGHTS.cognitive,
    behavior: raw.behavior * WEIGHTS.behavior,
    nursing: raw.nursing * WEIGHTS.nursing,
    rehab: raw.rehab * WEIGHTS.rehab,
  };
  const total = Math.min(100, BASELINE + sum(Object.values(parts)));
  return { raw, parts, score: Math.round(total * 10) / 10 };
}

/**
 * 인정점수 → 등급별 판정 확률.
 * 치매 진단이 없으면 5등급·인지지원등급 확률은 '등급외'로 넘어갑니다.
 * @returns {{[grade:number]: number}} 0 = 등급외
 */
export function calcProbabilities(score, hasDementia) {
  const out = {};
  let toNone = 0;

  for (const g of GRADES) {
    // 1등급은 상한이 없고(95점 이상), 인지지원등급은 하한이 없다(45점 미만).
    let mass;
    if (g.hi === Infinity) mass = 1 - cdf(g.lo, score, SIGMA);
    else if (g.lo === 0) mass = cdf(g.hi, score, SIGMA);
    else mass = cdf(g.hi, score, SIGMA) - cdf(g.lo, score, SIGMA);

    if (g.needDementia && !hasDementia) {
      toNone += mass;
      mass = 0;
    }
    out[g.g] = Math.max(0, mass);
  }
  out[0] = toNone;

  const total = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

/** 가장 가능성이 높은 등급 */
export function mostLikely(probs) {
  let grade = 0;
  let p = -1;
  for (const [k, v] of Object.entries(probs)) {
    if (v > p) { p = v; grade = Number(k); }
  }
  return { grade, p };
}
