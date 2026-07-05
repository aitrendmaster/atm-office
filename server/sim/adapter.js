// Phase-2 시임: 외부(실제 실행 훅)에서 들어오는 이벤트를 정규화해 engine으로 전달.
// Phase 1에서는 스키마 계약 검증용(curl 테스트). Phase 2에서 .claude hooks → POST /api/ingest 로 연결.
import { AGENT_IDS } from './roster.js';
import * as engine from './engine.js';

const ALLOWED_TYPES = new Set(['agent_state', 'agent_move', 'message', 'artifact', 'gate_qc', 'task_created', 'task_state', 'task_result']);
const ALLOWED_STATES = new Set(['idle', 'walking', 'working', 'reporting', 'waiting_gate', 'blocked']);

export function ingest(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON 객체 필요' };
  if (!ALLOWED_TYPES.has(raw.type)) return { ok: false, error: `허용되지 않는 type: ${raw.type}` };
  if (raw.agent && !AGENT_IDS.includes(raw.agent)) return { ok: false, error: `로스터에 없는 agent: ${raw.agent}` };
  if (raw.type === 'agent_state' && !ALLOWED_STATES.has(raw.state)) return { ok: false, error: `허용되지 않는 state: ${raw.state}` };
  const ev = engine.dispatch({ ...raw, source: 'real' });
  return { ok: true, seq: ev.seq };
}
