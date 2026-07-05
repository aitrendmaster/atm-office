// UI 4패널: 작업 콘솔 / CEO 승인함 / 인스펙터 / 보고 피드 (+ 톱바) — 한 파일에 컴팩트하게.
import { cmd } from '../net.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 톱바 ──
export function topbar() {
  const st = $('#taskStatus'), dot = $('#connDot');
  return {
    status: (cls, txt) => { st.className = 'task-status ' + (cls || ''); st.textContent = txt; },
    conn: (on) => dot.classList.toggle('on', on),
  };
}

// ── 작업 콘솔 ──
export function taskConsole(pipelines) {
  const el = $('#taskConsole');
  el.innerHTML = `
    <h3>🎯 작업 지시 (탑다운)</h3>
    <textarea id="tcInstr" rows="3" placeholder="실제 작업 지시를 입력하세요 — 팀이 진짜로 실행합니다&#10;예) 오늘자 AI 트렌드 3개 조사해서 리서치 메모로 저장해줘"></textarea>
    <div class="row" style="margin-top:6px">
      <button class="btn primary" id="tcRunReal" style="flex:1;text-align:center">🚀 실제 실행 (팀 가동)</button>
      <button class="btn" id="tcCancel" style="display:none;background:#7f1d1d;border-color:#7f1d1d">■ 중지</button>
    </div>
    <div style="margin:10px 0 6px;font-size:11px;color:#8b949e;font-weight:700;letter-spacing:1px">데모 시나리오</div>
    <input type="text" id="tcTitle" placeholder="작업 제목 (선택)">
    <div class="presets">
      ${Object.entries(pipelines).map(([k, t]) => `<button class="btn" data-pl="${k}">▶ ${esc(t)}</button>`).join('')}
    </div>
    <div class="row"><label>AUTO 결재</label><div class="switch" id="tcAuto"></div><span id="tcAutoTxt" style="color:#8b949e;font-size:11px">수동 승인</span></div>
    <div class="row"><label>속도</label><input type="range" id="tcSpeed" min="0.5" max="4" step="0.5" value="1"><b id="tcSpeedV">1x</b></div>`;
  const autoSw = $('#tcAuto', el), autoTxt = $('#tcAutoTxt', el), speed = $('#tcSpeed', el), speedV = $('#tcSpeedV', el);
  const instr = $('#tcInstr', el), runReal = $('#tcRunReal', el), cancelBtn = $('#tcCancel', el);
  runReal.addEventListener('click', async () => {
    const text = instr.value.trim();
    if (!text) { instr.focus(); return; }
    const r = await cmd({ cmd: 'start_task', mode: 'real', instruction: text, title: text.slice(0, 30) });
    if (!r.ok) alert(r.error || '실행 실패');
  });
  cancelBtn.addEventListener('click', () => cmd({ cmd: 'cancel_task' }));
  el.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', async () => {
    const r = await cmd({ cmd: 'start_task', pipeline: b.dataset.pl, title: $('#tcTitle', el).value.trim() || undefined });
    if (!r.ok) alert(r.error || '시작 실패');
  }));
  autoSw.addEventListener('click', () => cmd({ cmd: 'set_auto', value: !autoSw.classList.contains('on') }));
  speed.addEventListener('change', () => cmd({ cmd: 'set_speed', value: +speed.value }));
  return {
    setBusy: (busy) => {
      el.querySelectorAll('[data-pl]').forEach((b) => (b.disabled = busy));
      runReal.disabled = busy;
      cancelBtn.style.display = busy ? '' : 'none';
    },
    reflectAuto: (v) => { autoSw.classList.toggle('on', v); autoTxt.textContent = v ? 'AUTO — 자동 결재 🖃' : '수동 승인'; },
    reflectSpeed: (v) => { speed.value = v; speedV.textContent = v + 'x'; },
  };
}

// ── CEO 승인함 ──
export function approvalInbox() {
  const el = $('#approvalInbox');
  const cards = new Map();
  const render = () => {
    el.innerHTML = `<h3>📥 CEO 승인함${cards.size ? `<span class="badge">${cards.size}</span>` : ''}</h3>` +
      (cards.size ? '' : '<div class="appr-empty">대기 중인 결재가 없습니다</div>');
    for (const [gateId, ev] of cards) {
      const c = document.createElement('div');
      c.className = 'appr-card';
      c.innerHTML = `
        <div class="t">🔖 ${esc(ev.gateId)}</div>
        <div class="s">${esc(ev.summary)}</div>
        ${ev.artifacts?.length ? `<div class="s">📎 ${ev.artifacts.map(esc).join('<br>📎 ')}</div>` : ''}
        <input type="text" placeholder="반려 사유(선택)" style="width:100%;margin-bottom:6px;padding:5px 8px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;font-size:12px">
        <div class="acts"><button class="btn ok">✅ 승인</button><button class="btn no">❌ 반려</button></div>`;
      const note = c.querySelector('input');
      c.querySelector('.ok').addEventListener('click', () => cmd({ cmd: 'approve', gateId, decision: 'approved', note: note.value }));
      c.querySelector('.no').addEventListener('click', () => cmd({ cmd: 'approve', gateId, decision: 'rejected', note: note.value }));
      el.appendChild(c);
    }
  };
  render();
  return {
    push: (ev) => { cards.set(ev.gateId, ev); render(); },
    remove: (gateId) => { cards.delete(gateId); render(); },
    clear: () => { cards.clear(); render(); },
  };
}

// ── 에이전트 인스펙터 ──
export function inspector(roster, zones) {
  const el = $('#inspector');
  const artifacts = {};                       // agent -> [paths]
  let current = null;
  const render = (id) => {
    current = id;
    if (!id) { el.classList.add('hidden'); return; }
    const a = roster[id], z = zones[a.zone];
    el.classList.remove('hidden');
    el.innerHTML = `
      <h3>👤 에이전트 정보 <span style="float:right;cursor:pointer" id="insX">✕</span></h3>
      <div class="name"><span class="chip" style="background:${a.color}"></span>${esc(a.name)}
        <span class="perm" style="font-size:10px;background:#21262d;border:1px solid #30363d;padding:1px 6px;border-radius:6px">${esc(a.model)}</span></div>
      <div class="kv"><b>역할</b>${esc(a.role)}</div>
      <div class="kv"><b>소속 존</b><span style="color:${z.tint}">${esc(z.label)}</span></div>
      <div class="kv"><b>권한</b>${esc(a.perms)}</div>
      <div class="kv"><b>도구</b><div class="tools">${a.tools.map((t) => `<i>${esc(t)}</i>`).join('')}</div></div>
      <div class="kv"><b>업무 범위</b>${esc(a.scope)}</div>
      ${a.file ? `<div class="kv"><b>정의 파일</b>.claude/agents/${esc(a.file)}</div>` : ''}
      <div class="kv"><b>산출물</b><span id="insArt">${(artifacts[id] || []).map(esc).join('<br>') || '—'}</span></div>`;
    $('#insX', el).addEventListener('click', () => render(null));
  };
  return {
    show: render,
    noteArtifact: (agent, path) => {
      (artifacts[agent] ||= []).push(path);
      if (artifacts[agent].length > 5) artifacts[agent].shift();
      if (current === agent) render(agent);
    },
  };
}

// ── 작업 결과 패널 — 완료된 실제 작업의 요약 전문 + 산출물 파일(클릭=새 탭 열람) ──
export function resultsPanel() {
  const el = $('#results');
  const render = (r) => {
    if (!r) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const t = new Date(r.ts || Date.now());
    el.innerHTML = `
      <h3>📦 작업 결과 ${r.ok ? '<span style="color:#4ade80">완료</span>' : '<span style="color:#f87171">실패</span>'}
        <span style="float:right;cursor:pointer" id="resX">✕</span></h3>
      <div class="res-title">${esc(r.title || r.taskId)} <span class="res-time">${String(t.getMonth() + 1)}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</span></div>
      <div class="res-summary">${esc(r.summary).replace(/\n/g, '<br>')}</div>
      ${r.artifacts?.length ? `<div class="res-arts"><b>📄 산출물 ${r.artifacts.length}건 (클릭해서 열기)</b>${
        r.artifacts.map((p) => `<a href="/api/file?path=${encodeURIComponent(p)}" target="_blank">${esc(p)}</a>`).join('')
      }</div>` : '<div class="res-arts" style="color:#8b949e">파일 산출물 없음</div>'}
      ${r.log ? `<a class="res-log" href="/api/file?path=${encodeURIComponent('atm-office/' + r.log)}" target="_blank">🧾 전체 실행 로그</a>` : ''}`;
    $('#resX', el).addEventListener('click', () => el.classList.add('hidden'));
  };
  return { show: render };
}

// ── 보고 피드(바텀업) ──
export function eventLog(roster) {
  const el = $('#eventLog');
  el.innerHTML = '<h3>📡 보고 피드 (bottom-up)</h3><div id="evList"></div>';
  const list = $('#evList', el);
  const nameOf = (id) => id === 'yj' ? 'YJ(CEO)' : (roster[id]?.name || id);
  const colorOf = (id) => id === 'yj' ? '#F59E0B' : (roster[id]?.color || '#888');
  const add = (ev) => {
    const d = document.createElement('div');
    d.className = 'ev ' + (ev.kind || '');
    const t = new Date(ev.ts || Date.now());
    d.innerHTML = `
      <span style="color:#6b7280;font-size:10.5px">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}</span>
      <span class="who"><span class="chip" style="background:${colorOf(ev.from)}"></span>${esc(nameOf(ev.from))}</span>
      <span class="arrow">→ ${esc(nameOf(ev.to))}</span>
      <span class="txt">${esc(ev.text)}</span>`;
    list.prepend(d);
    while (list.children.length > 80) list.lastChild.remove();
  };
  return {
    add,
    restore: (log) => {
      list.innerHTML = '';
      for (const ev of log) if (ev.type === 'message') add(ev);
    },
  };
}
