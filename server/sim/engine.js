// 서버 권위 상태머신. 모든 producer(demo/adapter)는 dispatch()만 호출한다.
// dispatch: seq 부여 → 월드 상태 반영 → 전 SSE 클라이언트 broadcast.
import { AGENT_IDS } from './roster.js';

const world = {
  auto: false,
  speed: 1,
  task: null,            // { id, title, state, stage, pipelineKey }
  lastResult: null,      // { taskId, title, ok, summary, artifacts[], log, ts } — 최근 완료 작업 결과(스냅샷 복원)
  agents: Object.fromEntries(AGENT_IDS.map((id) => [id, { state: 'idle', detail: '', taskId: null, at: `desk:${id}` }])),
  pendingApproval: null, // { gateId, taskId, summary, artifacts }
  log: [],               // 최근 이벤트(스냅샷 복원용 축약 로그)
};

let seq = 0;
const listeners = new Set();       // SSE 클라이언트 send 함수들
const gateWaiters = new Map();     // gateId -> {resolve}

export function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function snapshot() {
  return { v: 1, seq, ts: Date.now(), source: 'server', type: 'snapshot', world: structuredClone(world) };
}

export function dispatch(ev) {
  ev = { v: 1, seq: ++seq, ts: Date.now(), source: ev.source || 'demo', ...ev };
  apply(ev);
  world.log.push(compact(ev));
  if (world.log.length > 200) world.log.shift();
  for (const send of listeners) { try { send(ev); } catch { /* dead client — SSE cleanup에서 제거 */ } }
  return ev;
}

function compact(ev) {
  const { v, source, ...rest } = ev;
  return rest;
}

function apply(ev) {
  switch (ev.type) {
    case 'task_created':
      world.task = { id: ev.taskId, title: ev.title, state: 'queued', stage: null, pipelineKey: ev.pipelineKey };
      break;
    case 'task_state':
      if (world.task && world.task.id === ev.taskId) {
        world.task.state = ev.state;
        if (ev.stage !== undefined) world.task.stage = ev.stage;
      }
      if (['done', 'rejected', 'failed'].includes(ev.state)) {
        for (const a of Object.values(world.agents)) { a.state = 'idle'; a.detail = ''; a.taskId = null; }
        world.pendingApproval = null;
      }
      break;
    case 'agent_state': {
      const a = world.agents[ev.agent];
      if (a) { a.state = ev.state; a.detail = ev.detail || ''; a.taskId = ev.taskId ?? a.taskId; }
      break;
    }
    case 'agent_move': {
      const a = world.agents[ev.agent];
      if (a) a.at = ev.to;
      break;
    }
    case 'approval_request':
      world.pendingApproval = { gateId: ev.gateId, taskId: ev.taskId, summary: ev.summary, artifacts: ev.artifacts || [] };
      break;
    case 'approval_result':
      world.pendingApproval = null;
      break;
    case 'task_result':
      world.lastResult = { taskId: ev.taskId, title: ev.title, ok: ev.ok, summary: ev.summary || '', artifacts: ev.artifacts || [], log: ev.log || '', ts: ev.ts };
      break;
    case 'set_auto':
      world.auto = !!ev.value;
      break;
    case 'set_speed':
      world.speed = Math.min(4, Math.max(0.5, +ev.value || 1));
      break;
    // message / gate_qc / artifact: 월드 필드 변화 없음(피드 전용) — log에는 남음
  }
}

// ── 승인 게이트 ──────────────────────────────────────────────
// demo.js가 호출: AUTO면 즉시 통과, 아니면 approval_request 발행 후 approve 명령까지 대기.
export function waitGate(gateId, taskId, summary, artifacts) {
  if (world.auto) {
    dispatch({ type: 'approval_request', gateId, taskId, summary, artifacts });
    dispatch({ type: 'approval_result', gateId, taskId, decision: 'approved', by: 'auto', note: 'AUTO 모드 자동 결재' });
    return Promise.resolve({ decision: 'approved', by: 'auto' });
  }
  dispatch({ type: 'approval_request', gateId, taskId, summary, artifacts });
  return new Promise((resolve) => gateWaiters.set(gateId, { resolve, taskId }));
}

export function resolveGate(gateId, decision, note) {
  const w = gateWaiters.get(gateId);
  if (!w && !(world.pendingApproval && world.pendingApproval.gateId === gateId)) return false;
  dispatch({ type: 'approval_result', gateId, taskId: w?.taskId, decision, by: 'YJ', note: note || '' });
  if (w) { gateWaiters.delete(gateId); w.resolve({ decision, by: 'YJ', note }); }
  return true;
}

export function getWorld() { return world; }
export function isBusy() { return !!(world.task && !['done', 'rejected', 'failed'].includes(world.task.state)); }
