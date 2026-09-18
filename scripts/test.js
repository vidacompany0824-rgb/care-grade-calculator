#!/usr/bin/env node
/**
 * 계산 로직 검증. 의존성 없이 node 기본 기능만 씁니다.
 *   npm test
 */
import assert from 'node:assert/strict';
import { calcScore, calcProbabilities, mostLikely } from '../src/scoring.js';
import { calcCost } from '../src/cost.js';
import { CASES } from '../src/questions.js';
import { MONTHLY_LIMIT, FACILITY_DAILY, COPAY_RATE } from '../src/rates.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n      ${e.message}`);
  }
}

console.log('\n인정점수 산정');

test('모든 항목이 0이면 기준선 25점', () => {
  const r = calcScore(CASES.clear);
  assert.equal(r.score, 25);
});

test('와상 최중증은 100점 상한에 걸린다', () => {
  const r = calcScore(CASES.severe);
  assert.equal(r.score, 100);
});

test('중등도 치매 사례는 4등급 구간(51~60점)에 들어간다', () => {
  const r = calcScore(CASES.moderate);
  assert.ok(r.score >= 51 && r.score < 60, `실제: ${r.score}점`);
});

test('경증 사례는 등급 컷(45점) 아래', () => {
  const r = calcScore(CASES.mild);
  assert.ok(r.score < 45, `실제: ${r.score}점`);
});

test('간호처치 1개를 켜면 1.7점 오른다', () => {
  const before = calcScore(CASES.moderate).score;
  const after = calcScore({ ...CASES.moderate, nursing: [0, 1, 0, 0, 0, 0, 0, 0, 0] }).score;
  assert.equal(Math.round((after - before) * 10) / 10, 1.7);
});

console.log('\n등급 확률');

test('확률의 합은 항상 1', () => {
  for (const key of Object.keys(CASES)) {
    const r = calcScore(CASES[key]);
    const p = calcProbabilities(r.score, CASES[key].hasDementia);
    const sum = Object.values(p).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${key}: 합계 ${sum}`);
  }
});

test('치매 진단이 없으면 5등급·인지지원등급 확률은 0', () => {
  const r = calcScore(CASES.moderate);
  const p = calcProbabilities(r.score, false);
  assert.equal(p[5], 0);
  assert.equal(p[6], 0);
});

test('치매 진단이 없으면 그 확률이 등급외로 넘어간다', () => {
  const r = calcScore(CASES.moderate);
  const withDem = calcProbabilities(r.score, true);
  const without = calcProbabilities(r.score, false);
  assert.ok(without[0] > withDem[0]);
});

test('와상 사례는 1등급이 가장 유력', () => {
  const r = calcScore(CASES.severe);
  const m = mostLikely(calcProbabilities(r.score, CASES.severe.hasDementia));
  assert.equal(m.grade, 1);
});

test('1등급은 상한이 없어 95점 이상 확률을 모두 가져간다', () => {
  const p = calcProbabilities(100, true);
  assert.ok(p[1] > 0.7, `1등급 확률이 너무 낮음: ${p[1]}`);
});

console.log('\n비용 계산');

test('요양원 본인부담은 1일 수가 × 30일 × 20% + 비급여', () => {
  const c = calcCost({ grade: 1, scenario: 'fac', tier: 'general', input: { meal: 250_000, room: 0 } });
  const expected = FACILITY_DAILY[1] * 30 * COPAY_RATE.general[1] + 250_000;
  assert.equal(Math.round(c.total), Math.round(expected));
});

test('감경 대상은 일반보다 부담이 적다', () => {
  const base = { grade: 3, scenario: 'fac', input: { meal: 250_000, room: 0 } };
  const general = calcCost({ ...base, tier: 'general' }).total;
  const r60 = calcCost({ ...base, tier: 'r60' }).total;
  assert.ok(r60 < general);
});

test('기초생활수급자는 급여 본인부담이 0 (비급여만 남는다)', () => {
  const c = calcCost({ grade: 3, scenario: 'fac', tier: 'basic', input: { meal: 250_000, room: 0 } });
  assert.equal(Math.round(c.total), 250_000);
});

test('월 한도를 넘으면 초과분이 100% 본인부담으로 잡힌다', () => {
  const c = calcCost({
    grade: 5, scenario: 'home', tier: 'general',
    input: { minutes: 240, perWeek: 7, bathCount: 4, bathType: 'car_in', welfare: 0 },
  });
  assert.ok(c.gross > MONTHLY_LIMIT[5]);
  assert.ok(c.rows.some((r) => r.k.includes('초과')));
});

test('한도 안에서는 초과분 항목이 없다', () => {
  const c = calcCost({
    grade: 1, scenario: 'home', tier: 'general',
    input: { minutes: 60, perWeek: 2, bathCount: 0, bathType: 'car_in', welfare: 0 },
  });
  assert.ok(!c.rows.some((r) => r.k.includes('초과')));
});

test('주야간보호 월 15일 이상이면 한도가 20% 늘어난다', () => {
  const few = calcCost({ grade: 3, scenario: 'day', tier: 'general', input: { daysPerWeek: 2, welfare: 0 } });
  const many = calcCost({ grade: 3, scenario: 'day', tier: 'general', input: { daysPerWeek: 5, welfare: 0 } });
  assert.equal(few.limit, MONTHLY_LIMIT[3]);
  assert.equal(many.limit, Math.round(MONTHLY_LIMIT[3] * 1.2));
});

test('인지지원등급은 요양원 입소 불가 안내가 나온다', () => {
  const c = calcCost({ grade: 6, scenario: 'fac', tier: 'general', input: { meal: 250_000, room: 0 } });
  assert.equal(c.total, 0);
  assert.match(c.note.html, /인지지원등급은 요양원/);
});

test('등급외는 급여를 쓸 수 없다는 안내가 나온다', () => {
  const c = calcCost({
    grade: 0, scenario: 'home', tier: 'general',
    input: { minutes: 180, perWeek: 3, bathCount: 0, bathType: 'car_in', welfare: 0 },
  });
  assert.equal(c.total, 0);
  assert.equal(c.note.type, 'crit');
});

test('요양병원은 간병비가 전액 본인부담으로 더해진다', () => {
  const solo = calcCost({ grade: 1, scenario: 'hosp', tier: 'general', input: { medical: 900_000, caregiver: 'solo' } });
  const none = calcCost({ grade: 1, scenario: 'hosp', tier: 'general', input: { medical: 900_000, caregiver: 'none' } });
  assert.equal(solo.total - none.total, 3_900_000);
  assert.equal(none.covered, 0);
});

console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
process.exit(failed ? 1 : 0);
