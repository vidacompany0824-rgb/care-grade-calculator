/**
 * 관리자 대시보드.
 * 데이터는 /api/admin (Netlify Function) 이 service_role 로 조회해 내려줍니다.
 * 이 파일은 service_role 키를 절대 알지 못합니다.
 */
import { GRADE_NAME } from './grades.js';
import { SCENARIOS } from './cost.js';

const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const pct = (n) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const SVG_NS = 'http://www.w3.org/2000/svg';

let password = sessionStorage.getItem('adminPw') ?? '';
let revealed = false;
let data = null;

/* ── API ──────────────────────────────────────────────────────────────── */
async function fetchData() {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, reveal: revealed }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `조회 실패 (${res.status})`);
  return body;
}

/* ── SVG 헬퍼 ─────────────────────────────────────────────────────────── */
const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** 축 눈금을 사람이 읽기 좋은 값으로 올림 */
function niceTicks(max, count = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

/* ── 일별 추이 (2계열 면적+선) ────────────────────────────────────────── */
function renderDaily(host, tip, daily) {
  host.querySelectorAll('svg').forEach((n) => n.remove());

  const W = 900, H = 260;
  const M = { t: 12, r: 14, b: 28, l: 38 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const max = Math.max(...daily.map((d) => Math.max(d.submissions, d.consults)), 0);
  const { top, ticks } = niceTicks(max);

  const x = (i) => M.l + (daily.length === 1 ? iw / 2 : (i / (daily.length - 1)) * iw);
  const y = (v) => M.t + ih - (v / top) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '최근 30일 일별 제출 추이' });

  // 눈금선 — 배경으로 물러나야 합니다
  for (const t of ticks) {
    svg.appendChild(el('line', { x1: M.l, x2: W - M.r, y1: y(t), y2: y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
    const lb = el('text', { x: M.l - 8, y: y(t) + 4, 'text-anchor': 'end',
      fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'var(--mono)' });
    lb.textContent = String(t);
    svg.appendChild(lb);
  }

  // 날짜 라벨 — 처음/중간/끝만
  for (const i of [0, Math.floor(daily.length / 2), daily.length - 1]) {
    const lb = el('text', { x: x(i), y: H - 8,
      'text-anchor': i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle',
      fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'var(--mono)' });
    lb.textContent = daily[i].day.slice(5).replace('-', '/');
    svg.appendChild(lb);
  }

  const series = [
    { key: 'submissions', color: 'var(--c1)', fill: 'var(--c1-fill)' },
    { key: 'consults', color: 'var(--c2)', fill: 'var(--c2-fill)' },
  ];

  for (const s of series) {
    const pts = daily.map((d, i) => [x(i), y(d[s.key])]);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    svg.appendChild(el('path', {
      d: `${line}L${x(daily.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: s.fill, stroke: 'none',
    }));
    svg.appendChild(el('path', {
      d: line, fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // 호버 레이어
  const cross = el('line', { y1: M.t, y2: M.t + ih, stroke: 'var(--ink-3)', 'stroke-width': 1,
    'stroke-dasharray': '3 3', opacity: 0 });
  svg.appendChild(cross);
  const dots = series.map((s) => {
    const c = el('circle', { r: 4.5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(c);
    return c;
  });

  const hit = el('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
  svg.appendChild(hit);

  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(daily.length - 1,
      Math.round(((px - M.l) / iw) * (daily.length - 1))));
    const d = daily[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
    dots.forEach((c, k) => {
      c.setAttribute('cx', x(i));
      c.setAttribute('cy', y(d[series[k].key]));
      c.setAttribute('opacity', 1);
    });
    tip.innerHTML = `${d.day}<br>`
      + `<span class="sw" style="background:var(--c1)"></span>전체 <b>${d.submissions}</b>건<br>`
      + `<span class="sw" style="background:var(--c2)"></span>상담 <b>${d.consults}</b>건`;
    tip.classList.add('on');
    const hostRect = host.getBoundingClientRect();
    const left = ((x(i) / W) * hostRect.width);
    tip.style.left = `${Math.min(hostRect.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(0, ((M.t / H) * hostRect.height) - 6)}px`;
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => {
    tip.classList.remove('on');
    cross.setAttribute('opacity', 0);
    dots.forEach((c) => c.setAttribute('opacity', 0));
  });

  host.appendChild(svg);
}

/* ── 가로 막대 (단일 계열) ────────────────────────────────────────────── */
function renderBars(host, tip, items, { unit = '건' } = {}) {
  host.querySelectorAll('svg').forEach((n) => n.remove());

  const rowH = 30, gap = 2, labelW = 78, valueW = 46;
  const W = 480;
  const H = items.length * rowH;
  const barX = labelW;
  const barW = W - labelW - valueW;
  const max = Math.max(...items.map((d) => d.count), 1);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

  items.forEach((d, i) => {
    const cy = i * rowH;
    const h = rowH - gap * 2 - 8;
    const w = Math.max(d.count > 0 ? 3 : 0, (d.count / max) * barW);

    const label = el('text', { x: labelW - 10, y: cy + rowH / 2 + 4, 'text-anchor': 'end',
      fill: 'var(--ink-2)', 'font-size': 12.5 });
    label.textContent = d.label;
    svg.appendChild(label);

    // 트랙
    svg.appendChild(el('rect', { x: barX, y: cy + (rowH - h) / 2, width: barW, height: h,
      rx: 4, fill: 'var(--surface-3)' }));
    if (w > 0) {
      svg.appendChild(el('rect', { x: barX, y: cy + (rowH - h) / 2, width: w, height: h,
        rx: 4, fill: 'var(--c1)' }));
    }

    const val = el('text', { x: W - 4, y: cy + rowH / 2 + 4, 'text-anchor': 'end',
      fill: d.count ? 'var(--ink)' : 'var(--ink-3)', 'font-size': 12,
      'font-family': 'var(--mono)', 'font-weight': 500 });
    val.textContent = String(d.count);
    svg.appendChild(val);

    const hit = el('rect', { x: 0, y: cy, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('mouseenter', () => {
      const share = items.reduce((a, b) => a + b.count, 0);
      tip.innerHTML = `${d.label}<br><b>${d.count}</b>${unit}`
        + (share ? ` · 전체의 <b>${pct(d.count / share)}</b>` : '');
      tip.classList.add('on');
      const hr = host.getBoundingClientRect();
      tip.style.left = `${Math.min(hr.width - tip.offsetWidth - 4, labelW / W * hr.width)}px`;
      tip.style.top = `${((cy + rowH) / H) * hr.height + 2}px`;
    });
    hit.addEventListener('mouseleave', () => tip.classList.remove('on'));
    svg.appendChild(hit);
  });

  host.appendChild(svg);
}

/* ── 통계 타일 ────────────────────────────────────────────────────────── */
function renderTiles(t) {
  const tiles = [
    { k: '총 제출', n: won(t.submissions), s: '누적', cls: 'accent' },
    { k: '상담 신청', n: won(t.consults), s: `전환율 ${pct(t.conversion)}`, cls: 'alt' },
    { k: '평균 인정점수', n: t.avgScore.toFixed(1), s: '100점 만점' },
    { k: '평균 월 부담금', n: won(t.avgCost), s: '원' },
    { k: '평균 연세', n: t.avgAge ? `${t.avgAge}` : '—', s: '세' },
    { k: '치매 진단 비율', n: pct(t.dementiaRate), s: '전체 대비' },
  ];
  $('tiles').innerHTML = tiles.map((x) =>
    `<div class="tile ${x.cls ?? ''}"><span class="k">${x.k}</span>`
  + `<span class="n">${x.n}</span><span class="s">${x.s}</span></div>`).join('');
}

/* ── 상담 신청 표 ─────────────────────────────────────────────────────── */
function renderConsults(rows) {
  $('consultCount').textContent = `${rows.length}건`;
  const wrap = $('consultWrap');

  if (!rows.length) {
    wrap.innerHTML = '<p class="empty">아직 상담 신청이 없습니다.</p>';
    return;
  }

  wrap.innerHTML = '<table><thead><tr>'
    + ['신청일', '이름', '연락처', '이메일', '예측 등급', '점수', '월 부담금', '유입']
        .map((h) => `<th>${h}</th>`).join('')
    + '</tr></thead><tbody>'
    + rows.map((r) => {
        const d = new Date(r.created_at);
        const day = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        return '<tr>'
          + `<td class="mono">${day}</td>`
          + `<td>${r.name ?? '—'}</td>`
          + `<td class="mono">${r.phone ?? '—'}</td>`
          + `<td class="mono">${r.email ?? '—'}</td>`
          + `<td><span class="grade">${GRADE_NAME(r.predicted_grade)}</span></td>`
          + `<td class="mono">${r.score?.toFixed(1) ?? '—'}</td>`
          + `<td class="mono">${r.monthly_cost ? won(r.monthly_cost) : '—'}</td>`
          + `<td>${r.utm_source ?? '직접'}</td>`
          + '</tr>';
      }).join('')
    + '</tbody></table>';
}

/* ── 렌더 ─────────────────────────────────────────────────────────────── */
function renderAll() {
  const d = data;
  $('stamp').textContent = `기준 ${new Date(d.generatedAt).toLocaleString('ko-KR')}`;
  renderTiles(d.totals);
  renderDaily($('plotDaily'), $('tipDaily'), d.daily);
  renderBars($('plotGrade'), $('tipGrade'),
    d.byGrade.map((g) => ({ label: GRADE_NAME(g.grade), count: g.count })));
  renderBars($('plotScenario'), $('tipScenario'),
    d.byScenario.map((s) => ({ label: SCENARIOS[s.scenario] ?? s.scenario, count: s.count })));
  renderConsults(d.consults);

  $('revealBtn').textContent = revealed ? '연락처 가리기' : '연락처 보기';
  $('revealNote').innerHTML = revealed
    ? '<b>연락처가 표시되고 있습니다.</b> 건강정보와 결합된 민감정보입니다 — 화면 공유·촬영에 주의하고, 확인이 끝나면 다시 가려 주세요.'
    : '연락처는 기본적으로 가려져 있습니다. 상담을 위해 필요할 때만 「연락처 보기」를 누르세요.';
}

async function load() {
  const btn = $('refreshBtn');
  btn.disabled = true;
  btn.textContent = '불러오는 중…';
  try {
    data = await fetchData();
    renderAll();
  } catch (e) {
    if (String(e.message).includes('비밀번호')) {
      lock();
      $('gateErr').textContent = e.message;
      $('gateErr').hidden = false;
    } else {
      alert(e.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '새로고침';
  }
}

function unlock() {
  $('gate').hidden = true;
  $('dash').hidden = false;
  load();
}
function lock() {
  password = '';
  revealed = false;
  sessionStorage.removeItem('adminPw');
  $('dash').hidden = true;
  $('gate').hidden = false;
  $('pw').value = '';
}

/* ── 이벤트 ───────────────────────────────────────────────────────────── */
$('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('gateErr').hidden = true;
  const btn = $('gateBtn');
  btn.disabled = true;
  btn.textContent = '확인 중…';
  password = $('pw').value;
  try {
    data = await fetchData();
    sessionStorage.setItem('adminPw', password);
    $('gate').hidden = true;
    $('dash').hidden = false;
    renderAll();
  } catch (err) {
    $('gateErr').textContent = err.message;
    $('gateErr').hidden = false;
    password = '';
  } finally {
    btn.disabled = false;
    btn.textContent = '열기';
  }
});

$('refreshBtn').addEventListener('click', load);
$('logoutBtn').addEventListener('click', lock);
$('revealBtn').addEventListener('click', () => { revealed = !revealed; load(); });
window.addEventListener('resize', () => { if (data) renderAll(); });

if (password) unlock();
