/**
 * 장기요양등급 구간.
 * 이 구간은 수가와 달리 매년 바뀌지 않습니다.
 */
import { MONTHLY_LIMIT } from './rates.js';

export const GRADES = [
  { g: 1, name: '1등급', lo: 95, hi: Infinity, desc: '일상생활에서 전적으로 다른 사람의 도움이 필요한 상태' },
  { g: 2, name: '2등급', lo: 75, hi: 95, desc: '일상생활에서 상당 부분 다른 사람의 도움이 필요한 상태' },
  { g: 3, name: '3등급', lo: 60, hi: 75, desc: '일상생활에서 부분적으로 다른 사람의 도움이 필요한 상태' },
  { g: 4, name: '4등급', lo: 51, hi: 60, desc: '일상생활에서 일정 부분 다른 사람의 도움이 필요한 상태' },
  { g: 5, name: '5등급', lo: 45, hi: 51, desc: '치매 환자 (노인성 질병으로 한정)', needDementia: true },
  { g: 6, name: '인지지원등급', lo: 0, hi: 45, desc: '치매 환자 (신체기능과 무관하게 인지 지원이 필요한 상태)', needDementia: true },
];

export const GRADE_NAME = (g) => (g === 0 ? '등급외' : GRADES.find((x) => x.g === g)?.name ?? '—');

export const gradeRangeText = (g) => {
  const gi = GRADES.find((x) => x.g === g);
  if (!gi) return '—';
  if (gi.hi === Infinity) return '95점 이상';
  if (gi.lo === 0) return '45점 미만';
  return `${gi.lo}~${gi.hi}점 미만`;
};

export const gradeLimit = (g) => MONTHLY_LIMIT[g] ?? 0;
