/**
 * 국민건강보험공단 「장기요양인정조사표」 52개 항목.
 * 요약본이 아니라 실제 방문조사에서 쓰는 항목 그대로입니다.
 *
 *   신체기능 12 + 인지기능 7 + 행동변화 14 + 간호처치 9 + 재활 10 = 52
 */

export const PHYSICAL = [
  '옷 벗고 입기', '세수하기', '양치질하기', '목욕하기',
  '식사하기', '체위 변경하기', '일어나 앉기', '옮겨 앉기',
  '방 밖으로 나오기', '화장실 사용하기', '대변 조절하기', '소변 조절하기',
];
export const PHYSICAL_LEVELS = ['완전자립', '부분도움', '완전도움'];

export const COGNITIVE = [
  '단기 기억장애',
  '오늘이 몇 월인지 모름',
  '자신이 있는 장소를 모름',
  '나이·생년월일을 모름',
  '지시를 이해하지 못함',
  '상황 판단력 감퇴',
  '의사소통·전달 장애',
];

export const BEHAVIOR = [
  '망상', '환각·환청', '슬픈 상태, 울기도 함', '불규칙한 수면, 주야 혼돈',
  '도움에 저항', '서성거림, 안절부절 못함', '길을 잃음', '폭언·위협 행동',
  '밖으로 나가려 함', '물건 망가뜨리기', '의미 없거나 부적절한 행동',
  '돈·물건 감추기', '부적절한 옷 입기', '대소변 불결 행위',
];

export const NURSING = [
  '기관지 절개관 간호', '흡인', '산소요법', '욕창 간호', '경관 영양',
  '암성통증 간호', '도뇨 관리', '장루 간호', '투석 간호',
];

export const REHAB_MOTOR = ['우측 상지', '좌측 상지', '우측 하지', '좌측 하지'];
export const REHAB_MOTOR_LEVELS = ['장애 없음', '불완전 장애', '완전 장애'];

export const REHAB_JOINT = ['어깨관절', '팔꿈치관절', '손목·수지관절', '고관절', '무릎관절', '발목관절'];
export const REHAB_JOINT_LEVELS = ['제한 없음', '한쪽 제한', '양쪽 제한'];

/** 강의 시연용 사례 3종 */
export const CASES = {
  mild: {
    label: '사례 A · 경증',
    age: 78, hasDementia: false,
    physical: [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
    cognitive: [1, 0, 0, 0, 0, 1, 0],
    behavior: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    nursing: Array(9).fill(0),
    rehabMotor: [0, 0, 0, 0],
    rehabJoint: [0, 0, 0, 0, 1, 0],
  },
  moderate: {
    label: '사례 B · 중등도 치매',
    age: 82, hasDementia: true,
    physical: [1, 0, 1, 2, 0, 0, 1, 1, 1, 1, 1, 1],
    cognitive: [1, 1, 0, 1, 0, 1, 0],
    behavior: [0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    nursing: Array(9).fill(0),
    rehabMotor: [0, 0, 1, 1],
    rehabJoint: [0, 0, 0, 1, 2, 0],
  },
  severe: {
    label: '사례 C · 와상',
    age: 87, hasDementia: true,
    physical: Array(12).fill(2),
    cognitive: Array(7).fill(1),
    behavior: [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    nursing: [0, 1, 1, 1, 1, 0, 1, 0, 0],
    rehabMotor: [2, 2, 2, 2],
    rehabJoint: [1, 1, 1, 2, 2, 2],
  },
  clear: {
    label: '전부 초기화',
    age: 75, hasDementia: false,
    physical: Array(12).fill(0),
    cognitive: Array(7).fill(0),
    behavior: Array(14).fill(0),
    nursing: Array(9).fill(0),
    rehabMotor: [0, 0, 0, 0],
    rehabJoint: [0, 0, 0, 0, 0, 0],
  },
};
