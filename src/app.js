/**
 * UI 컨트롤러.
 * 계산 로직은 scoring.js / cost.js 에, 데이터는 rates.js / questions.js 에 있습니다.
 * 이 파일은 화면을 그리고 이벤트를 붙이는 일만 합니다.
 */
import {
  PHYSICAL, PHYSICAL_LEVELS, COGNITIVE, BEHAVIOR, NURSING,
  REHAB_MOTOR, REHAB_MOTOR_LEVELS, REHAB_JOINT, REHAB_JOINT_LEVELS, CASES,
} from './questions.js';
import { calcScore, calcProbabilities, mostLikely, SIGMA, BASELINE, WEIGHTS } from './scoring.js';
import { GRADES, GRADE_NAME, gradeRangeText, gradeLimit } from './grades.js';
import { calcCost, SCENARIOS } from './cost.js';
import { VISIT_CARE, RATE_YEAR } from './rates.js';
import { submitAssessment, isConfigured, trackingInfo } from './submit.js';

const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');

/* ── 상태 ─────────────────────────────────────────────────────────────── */
const S = {
  age: 82,
  hasDementia: true,
  tier: 'general',
  physical: [], cognitive: [], behavior: [], nursing: [], rehabMotor: [], rehabJoint: [],
  scenario: 'home',
  input: {
    home: { minutes: 180, perWeek: 5, bathCount: 2, bathType: 'car_in', welfare: 1 },
    day: { daysPerWeek: 4, welfare: 1 },
    fac: { meal: 250_000, room: 0 },
    hosp: { caregiver: 'shared', medical: 900_000 },
  },
};
let LAST = {};

function loadCase(key) {
  const c = CASES[key];
  Object.assign(S, {
    age: c.age, hasDementia: c.hasDementia,
    physical: [...c.physical], cognitive: [...c.cognitive], behavior: [...c.behavior],
    nursing: [...c.nursing], rehabMotor: [...c.rehabMotor], rehabJoint: [...c.rehabJoint],
  });
}

/* ── 문진표 만들기 ────────────────────────────────────────────────────── */
function segRow(name, value, levels, onPick) {
  const row = document.createElement('div');
  row.className = 'row3';
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = name;
  row.appendChild(nm);

  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', name);
  levels.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = String(i);
    b.textContent = label;
    b.setAttribute('aria-pressed', String(value === i));
    b.addEventListener('click', () => { onPick(i); render(); });
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

function toggleGrid(el, items, key) {
  el.innerHTML = '';
  items.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(Boolean(S[key][i])));
    const bx = document.createElement('span');
    bx.className = 'bx';
    const tx = document.createElement('span');
    tx.textContent = label;
    b.append(bx, tx);
    b.addEventListener('click', () => { S[key][i] = S[key][i] ? 0 : 1; render(); });
    el.appendChild(b);
  });
}

function buildQuestions() {
  const ph = $('physical');
  ph.innerHTML = '';
  PHYSICAL.forEach((nm, i) =>
    ph.appendChild(segRow(nm, S.physical[i], PHYSICAL_LEVELS, (v) => { S.physical[i] = v; })));

  toggleGrid($('cognitive'), COGNITIVE, 'cognitive');
  toggleGrid($('behavior'), BEHAVIOR, 'behavior');
  toggleGrid($('nursing'), NURSING, 'nursing');

  const rh = $('rehab');
  rh.innerHTML = '';
  REHAB_MOTOR.forEach((nm, i) =>
    rh.appendChild(segRow(`운동장애 · ${nm}`, S.rehabMotor[i], REHAB_MOTOR_LEVELS, (v) => { S.rehabMotor[i] = v; })));
  REHAB_JOINT.forEach((nm, i) =>
    rh.appendChild(segRow(`관절제한 · ${nm}`, S.rehabJoint[i], REHAB_JOINT_LEVELS, (v) => { S.rehabJoint[i] = v; })));

  $('age').value = String(S.age);
  document.querySelectorAll('#dementia button')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === Number(S.hasDementia))));
  $('tier').value = S.tier;
}

/** 다시 그리지 않고 눌림 상태만 맞춥니다 (입력 포커스를 잃지 않기 위해). */
function syncPressed() {
  const ph = $('physical').children;
  for (let i = 0; i < ph.length; i++) {
    ph[i].querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === S.physical[i])));
  }
  const rh = $('rehab').children;
  for (let i = 0; i < rh.length; i++) {
    const v = i < REHAB_MOTOR.length ? S.rehabMotor[i] : S.rehabJoint[i - REHAB_MOTOR.length];
    rh[i].querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v)));
  }
  for (const key of ['cognitive', 'behavior', 'nursing']) {
    const ch = $(key).children;
    for (let i = 0; i < ch.length; i++) ch[i].setAttribute('aria-pressed', String(Boolean(S[key][i])));
  }
}

/* ── 점수 트랙 ────────────────────────────────────────────────────────── */
function buildTrack() {
  const zones = [
    { a: 0, b: 45, c: 'var(--surface-3)' }, { a: 45, b: 51, c: 'var(--accent-soft)' },
    { a: 51, b: 60, c: 'var(--warn-soft)' }, { a: 60, b: 75, c: 'var(--warn-soft)' },
    { a: 75, b: 95, c: 'var(--crit-soft)' }, { a: 95, b: 100, c: 'var(--crit-soft)' },
  ];
  const z = $('zones');
  z.innerHTML = '';
  zones.forEach((s, i) => {
    const e = document.createElement('i');
    e.style.width = `${s.b - s.a}%`;
    e.style.background = s.c;
    if (i > 0) e.style.borderLeft = '1px solid var(--line)';
    z.appendChild(e);
  });

  const t = $('ticks');
  t.innerHTML = '';
  [0, 45, 51, 60, 75, 95, 100].forEach((v) => {
    const s = document.createElement('span');
    s.textContent = String(v);
    s.style.left = `${v}%`;
    if (v === 0) s.style.transform = 'translateX(0)';
    if (v === 100) s.style.transform = 'translateX(-100%)';
    t.appendChild(s);
  });

  const zl = $('zlabels');
  zl.innerHTML = '';
  [['1·2등급', 'var(--crit-soft)'], ['3·4등급', 'var(--warn-soft)'],
   ['5등급', 'var(--accent-soft)'], ['등급외', 'var(--surface-3)']].forEach(([n, c]) => {
    const e = document.createElement('em');
    const i = document.createElement('i');
    i.style.background = c;
    e.append(i, document.createTextNode(n));
    zl.appendChild(e);
  });
}

/* ── 비용 입력 컨트롤 ─────────────────────────────────────────────────── */
function buildControls() {
  const c = $('ctrl');
  const inp = S.input[S.scenario];
  c.innerHTML = '';

  const row = (labelText, node) => {
    const r = document.createElement('div');
    r.className = 'r';
    const l = document.createElement('label');
    l.textContent = labelText;
    r.append(l, node);
    c.appendChild(r);
    return l;
  };
  const select = (opts, value, onChange) => {
    const s = document.createElement('select');
    opts.forEach(([v, n]) => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = n;
      s.appendChild(o);
    });
    s.value = String(value);
    s.addEventListener('change', () => { onChange(s.value); render(); });
    return s;
  };
  const range = (min, max, step, value, fmt, onInput) => {
    const w = document.createElement('div');
    w.style.cssText = 'display:flex;align-items:center;gap:9px;flex:1;justify-content:flex-end';
    const i = document.createElement('input');
    Object.assign(i, { type: 'range', min, max, step, value });
    const o = document.createElement('span');
    o.className = 'rv';
    o.textContent = fmt(value);
    i.addEventListener('input', () => {
      o.textContent = fmt(Number(i.value));
      onInput(Number(i.value));
      renderCost();
    });
    w.append(i, o);
    return w;
  };

  if (S.scenario === 'home') {
    row('1회 방문 시간', select(
      Object.keys(VISIT_CARE).map((k) => [k, `${k}분 (${won(VISIT_CARE[k])}원)`]),
      inp.minutes, (v) => { inp.minutes = Number(v); }));
    row('주 몇 회', range(1, 7, 1, inp.perWeek, (v) => `주 ${v}회`, (v) => { inp.perWeek = v; }));
    row('방문목욕 (월)', range(0, 5, 1, inp.bathCount, (v) => (v === 0 ? '안 함' : `월 ${v}회`), (v) => { inp.bathCount = v; }));
    if (inp.bathCount > 0) {
      row('목욕 방식', select(
        [['car_in', '차량 내 목욕'], ['car_home', '가정 내 목욕'], ['no_car', '차량 미이용']],
        inp.bathType, (v) => { inp.bathType = v; }));
    }
    row('복지용구 사용', select([[1, '사용 (연 160만원)'], [0, '사용 안 함']], inp.welfare, (v) => { inp.welfare = Number(v); }));
  } else if (S.scenario === 'day') {
    row('주 몇 일 이용', range(1, 6, 1, inp.daysPerWeek, (v) => `주 ${v}일`, (v) => { inp.daysPerWeek = v; }));
    row('복지용구 사용', select([[1, '사용 (연 160만원)'], [0, '사용 안 함']], inp.welfare, (v) => { inp.welfare = Number(v); }));
  } else if (S.scenario === 'fac') {
    row('식사재료비·간식비', range(150_000, 700_000, 10_000, inp.meal, (v) => `${won(v)}원`, (v) => { inp.meal = v; }));
    row('상급침실료', range(0, 900_000, 10_000, inp.room, (v) => (v === 0 ? '없음' : `${won(v)}원`), (v) => { inp.room = v; }));
  } else {
    row('간병 형태', select(
      [['none', '간병인 없음'], ['shared', '공동간병 (6~8인)'], ['solo', '개인간병 1:1']],
      inp.caregiver, (v) => { inp.caregiver = v; }));
    row('월 진료·입원비', range(400_000, 2_000_000, 50_000, inp.medical, (v) => `${won(v)}원`, (v) => { inp.medical = v; }));
  }
}

/* ── 비용 표시 ────────────────────────────────────────────────────────── */
function renderCost() {
  const grade = S.scenario === 'hosp' ? (LAST.grade || 1) : LAST.grade;
  const cost = calcCost({ grade, scenario: S.scenario, tier: S.tier, input: S.input[S.scenario] });
  LAST.cost = cost;

  let html = `<div class="big"><span class="n">${won(cost.total)}</span><span class="u">원 / 월</span>`
           + `<span class="tag">연 ${won(cost.total * 12)}원</span></div>`;

  if (cost.rows.length) {
    const denom = cost.total + cost.covered || 1;
    html += '<div class="stack">'
      + cost.rows.map((r) => `<i style="width:${(r.v / denom) * 100}%;background:${r.c}"></i>`).join('')
      + (cost.covered > 0 ? `<i style="width:${(cost.covered / denom) * 100}%;background:var(--surface-3)"></i>` : '')
      + '</div><div class="lines">'
      + cost.rows.map((r) =>
          `<div class="ln"><span class="sw" style="background:${r.c}"></span>`
        + `<span class="k">${r.k}</span><span class="v">${won(r.v)}원</span></div>`).join('')
      + (cost.covered > 0
          ? `<div class="ln muted"><span class="sw" style="background:var(--surface-3)"></span>`
          + `<span class="k">건강보험공단 부담 (내가 안 내는 돈)</span><span class="v">${won(cost.covered)}원</span></div>`
          : '')
      + `<div class="ln tot"><span class="k">월 실제 본인부담</span><span class="v">${won(cost.total)}원</span></div></div>`;
  }
  if (cost.note?.html) html += `<div class="note ${cost.note.type}">${cost.note.html}</div>`;
  $('costOut').innerHTML = html;
}

/* ── 전체 렌더 ────────────────────────────────────────────────────────── */
function render() {
  const res = calcScore(S);
  const probs = calcProbabilities(res.score, S.hasDementia);
  const likely = mostLikely(probs);
  LAST = { res, probs, grade: likely.grade, likely };

  $('t-physical').textContent = `${res.raw.physical} / 24점`;
  $('t-cognitive').textContent = `${res.raw.cognitive} / 7개`;
  $('t-behavior').textContent = `${res.raw.behavior} / 14개`;
  $('t-nursing').textContent = `${res.raw.nursing} / 9개`;
  $('t-rehab').textContent = `${res.raw.rehab} / 20점`;

  $('scoreN').textContent = res.score.toFixed(1);
  $('scoreBand').textContent = `± ${SIGMA} 구간`;
  $('marker').style.left = `${res.score}%`;
  const lo = Math.max(0, res.score - SIGMA);
  const hi = Math.min(100, res.score + SIGMA);
  $('sigma').style.left = `${lo}%`;
  $('sigma').style.width = `${hi - lo}%`;

  const labels = { physical: '신체기능', cognitive: '인지기능', behavior: '행동변화', nursing: '간호처치', rehab: '재활' };
  const max = Math.max(...Object.values(res.parts), 1);
  $('breakdown').innerHTML = Object.entries(res.parts).map(([k, v]) =>
      `<div class="bdr"><span class="k">${labels[k]}</span>`
    + `<span class="bar"><i style="width:${(v / max) * 100}%"></i></span>`
    + `<span class="v">+${v.toFixed(1)}</span></div>`).join('')
    + `<div class="bdr" style="margin-top:3px;padding-top:6px;border-top:1px solid var(--line)">`
    + `<span class="k" style="color:var(--ink-3)">기준선</span><span class="bar" style="background:none"></span>`
    + `<span class="v">+${BASELINE.toFixed(1)}</span></div>`;

  const colors = { 1: 'var(--crit)', 2: 'var(--crit)', 3: 'var(--warn)', 4: 'var(--warn)', 5: 'var(--accent)', 6: 'var(--accent-2)', 0: 'var(--ink-3)' };
  $('pbars').innerHTML = Object.entries(probs)
    .map(([g, p]) => ({ g: Number(g), p }))
    .filter((x) => x.p > 0.004)
    .sort((a, b) => b.p - a.p)
    .map((x) =>
      `<div class="pb${x.g === likely.grade ? ' top' : ''}"><span class="g">${GRADE_NAME(x.g)}</span>`
    + `<span class="bar"><i style="width:${x.p * 100}%;background:${colors[x.g]}"></i></span>`
    + `<span class="v">${(x.p * 100).toFixed(0)}%</span></div>`).join('');

  const gi = GRADES.find((g) => g.g === likely.grade);
  $('vGrade').textContent = GRADE_NAME(likely.grade);
  $('vText').innerHTML = likely.grade === 0
    ? `현재 상태로는 등급 판정을 받지 못할 가능성이 가장 큽니다.${S.hasDementia ? '' : ' 치매 진단이 있으면 5등급·인지지원등급 문이 열립니다.'}`
    : `${gi.desc}<br><span style="color:var(--ink-3)">가장 가능성이 높은 결과 ${(likely.p * 100).toFixed(0)}%</span>`;

  buildControls();
  renderCost();
  syncPressed();
}

/* ── 제출 폼 ──────────────────────────────────────────────────────────── */
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function showMsg(kind, text) {
  const el = $('formMsg');
  el.className = `form-msg ${kind}`;
  el.textContent = text;
  el.hidden = false;
}
function clearMsg() { $('formMsg').hidden = true; }

function updateFormState() {
  const consult = $('consentConsult').checked;
  const stats = $('consentStats').checked;
  $('contactFields').hidden = !consult;
  const btn = $('submitBtn');
  btn.textContent = consult ? '상담 신청하기' : '결과 저장하기';

  if (!isConfigured()) {
    btn.disabled = true;
    btn.title = '서버가 연결되지 않아 저장이 비활성화되어 있습니다.';
    return;
  }
  btn.disabled = !(stats || consult);
  btn.title = btn.disabled ? '동의 항목을 하나 이상 선택해 주세요.' : '';
}

function validateContact() {
  let ok = true;
  const phone = $('cPhone').value.trim();
  const email = $('cEmail').value.trim();

  const setErr = (inputId, errId, message) => {
    const input = $(inputId);
    const err = $(errId);
    input.setAttribute('aria-invalid', String(Boolean(message)));
    err.textContent = message ?? '';
    err.hidden = !message;
    if (message) ok = false;
  };

  setErr('cPhone', 'errPhone', !phone
    ? '연락받으실 휴대폰 번호를 입력해 주세요.'
    : (!PHONE_RE.test(phone) ? '휴대폰 번호 형식이 올바르지 않습니다. 예) 010-1234-5678' : null));
  setErr('cEmail', 'errEmail', email && !EMAIL_RE.test(email) ? '이메일 형식이 올바르지 않습니다.' : null);

  return ok;
}

function buildRow() {
  const consult = $('consentConsult').checked;
  const { res, probs, grade } = LAST;
  const cost = LAST.cost;

  const row = {
    age: S.age || null,
    has_dementia: Boolean(S.hasDementia),
    benefit_tier: S.tier,
    answers: {
      physical: S.physical, cognitive: S.cognitive, behavior: S.behavior,
      nursing: S.nursing, rehabMotor: S.rehabMotor, rehabJoint: S.rehabJoint,
    },
    score: res.score,
    score_parts: Object.fromEntries(Object.entries(res.parts).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    grade_probs: Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    predicted_grade: grade,
    care_scenario: S.scenario,
    scenario_input: S.input[S.scenario],
    monthly_cost: Math.round(cost?.total ?? 0),
    rate_year: RATE_YEAR,
    wants_consult: consult,
    ...trackingInfo(),
  };

  if (consult) {
    row.name = $('cName').value.trim() || null;
    row.phone = $('cPhone').value.trim() || null;
    row.email = $('cEmail').value.trim() || null;
    row.consent_sensitive = true;
    row.consent_at = new Date().toISOString();
  }
  return row;
}

async function onSubmit(e) {
  e.preventDefault();
  clearMsg();

  const consult = $('consentConsult').checked;
  if (consult && !validateContact()) {
    showMsg('bad', '입력하신 내용을 다시 확인해 주세요.');
    return;
  }

  const btn = $('submitBtn');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '보내는 중…';

  const result = await submitAssessment(buildRow());

  if (result.ok) {
    showMsg('ok', consult
      ? '상담 신청이 접수되었습니다. 영업일 기준 1~2일 내에 연락드리겠습니다.'
      : '결과가 저장되었습니다. 참여해 주셔서 감사합니다.');
    $('submitForm').querySelectorAll('input').forEach((i) => {
      if (i.type === 'checkbox') i.checked = false; else i.value = '';
    });
    updateFormState();
  } else {
    showMsg('bad', result.error);
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ── 이벤트 연결 ──────────────────────────────────────────────────────── */
function wire() {
  $('age').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    S.age = Number.isFinite(v) ? v : 0;
  });

  document.querySelectorAll('#dementia button').forEach((b) => {
    b.addEventListener('click', () => {
      S.hasDementia = b.dataset.v === '1';
      document.querySelectorAll('#dementia button')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
  });

  $('tier').addEventListener('change', (e) => { S.tier = e.target.value; render(); });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.scenario = b.dataset.t;
    document.querySelectorAll('#tabs button')
      .forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    render();
  });

  document.querySelectorAll('.casebar .chip').forEach((b) => {
    b.addEventListener('click', () => {
      loadCase(b.dataset.case);
      buildQuestions();
      render();
      toast(`${CASES[b.dataset.case].label} 불러옴`);
    });
  });

  $('copyBtn').addEventListener('click', copySummary);
  $('consentStats').addEventListener('change', updateFormState);
  $('consentConsult').addEventListener('change', () => { clearMsg(); updateFormState(); });
  $('submitForm').addEventListener('submit', onSubmit);
}

let toastTimer;
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

async function copySummary() {
  const { res, likely, cost } = LAST;
  const text = [
    '[요양등급·돌봄비용 추정 결과]',
    `예상 인정점수: ${res.score.toFixed(1)}점 (±${SIGMA})`,
    `가장 가능성 높은 등급: ${GRADE_NAME(likely.grade)} (${(likely.p * 100).toFixed(0)}%)`,
    `영역별 기여: 신체 +${res.parts.physical.toFixed(1)} / 인지 +${res.parts.cognitive.toFixed(1)}`
      + ` / 행동 +${res.parts.behavior.toFixed(1)} / 간호 +${res.parts.nursing.toFixed(1)} / 재활 +${res.parts.rehab.toFixed(1)}`,
    `돌봄 방식: ${SCENARIOS[S.scenario]}`,
    `월 실제 본인부담: ${won(cost.total)}원 (연 ${won(cost.total * 12)}원)`,
    '',
    `※ ${RATE_YEAR}년 수가 기준 교육용 추정이며 공식 판정이 아닙니다.`,
  ].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    toast('결과 요약을 복사했습니다');
  } catch {
    toast('복사에 실패했습니다');
  }
}

/* ── 해설 패널 정적 내용 ──────────────────────────────────────────────── */
function fillTeaching() {
  $('formula').textContent =
    `점수 = ${BASELINE} + 신체기능×${WEIGHTS.physical} + 인지기능×${WEIGHTS.cognitive.toFixed(2)}`
    + ` + 행동변화×${WEIGHTS.behavior} + 간호처치×${WEIGHTS.nursing} + 재활×${WEIGHTS.rehab}`;

  $('gradetbl').innerHTML = GRADES.map((g) =>
    `<tr><td>${g.name}</td><td>${gradeRangeText(g.g)}</td>`
  + `<td>${g.needDementia ? '치매 진단 필요' : '—'}</td>`
  + `<td>${won(gradeLimit(g.g))}원</td></tr>`).join('');
}

/* ── 시작 ─────────────────────────────────────────────────────────────── */
loadCase('moderate');
buildQuestions();
buildTrack();
fillTeaching();
wire();
render();
updateFormState();

if (!isConfigured()) {
  console.warn('[care-calculator] Supabase 미설정 — 계산기는 동작하지만 저장은 비활성화됩니다.');
}
