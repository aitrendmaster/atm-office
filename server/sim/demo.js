// 데모 타임라인 — pipeline 그래프를 걸으며 이벤트를 방출하는 시나리오 플레이어.
// 실제 실행처럼 보이는 리듬: 지시(매니저→에이전트) → 이동/작업 → (보고) → 다음 스테이지.
import { PIPELINES } from './pipeline.js';
import { ROSTER } from './roster.js';
import * as engine from './engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
let taskCounter = 0;

function secs([a, b]) { return rand(a, b) * 1000 / engine.getWorld().speed; }

async function agentWork(agent, taskId, detail, durRange, { report = false, artifact = null } = {}) {
  engine.dispatch({ type: 'message', from: 'manager', to: agent, kind: 'command', text: `${detail} 진행해줘` });
  engine.dispatch({ type: 'agent_state', agent, state: 'working', taskId, detail });
  await sleep(secs(durRange));
  if (artifact) engine.dispatch({ type: 'artifact', agent, path: artifact, kind: 'output' });
  if (report) {
    engine.dispatch({ type: 'agent_state', agent, state: 'reporting', taskId, detail: '매니저 보고' });
    engine.dispatch({ type: 'agent_move', agent, from: `desk:${agent}`, to: 'anchor:manager_q' });
    await sleep(secs([1.6, 2.4]));
    engine.dispatch({ type: 'message', from: agent, to: 'manager', kind: 'report', text: `${detail} — 완료 보고` });
    await sleep(secs([1, 1.6]));
    engine.dispatch({ type: 'agent_move', agent, from: 'anchor:manager_q', to: `desk:${agent}` });
  }
  engine.dispatch({ type: 'agent_state', agent, state: 'idle', taskId: null, detail: '' });
}

async function qcStage(stage, taskId) {
  const qc = stage.agents[0]; // iris | samuel
  engine.dispatch({ type: 'message', from: 'manager', to: qc, kind: 'command', text: `${stage.label} 요청` });
  engine.dispatch({ type: 'agent_state', agent: qc, state: 'working', taskId, detail: stage.detail[qc] });

  let pass = Math.random() >= (stage.failChance || 0);
  await sleep(secs(stage.dur));
  engine.dispatch({ type: 'gate_qc', gate: qc, verdict: pass ? 'pass' : 'fail', target: taskId, note: pass ? '통과 ✅' : '반려 ❌ — 재작업 지시' });

  if (!pass && stage.failFix) {
    engine.dispatch({ type: 'message', from: qc, to: stage.failFix.agents[0], kind: 'command', text: `${stage.failFix.detail} (QC 반려)` });
    engine.dispatch({ type: 'agent_state', agent: qc, state: 'waiting_gate', taskId, detail: '재작업 대기' });
    for (const fixer of stage.failFix.agents) {
      await agentWork(fixer, taskId, stage.failFix.detail, stage.failFix.dur);
    }
    engine.dispatch({ type: 'agent_state', agent: qc, state: 'working', taskId, detail: '재검수' });
    await sleep(secs([2, 3.5]));
    engine.dispatch({ type: 'gate_qc', gate: qc, verdict: 'pass', target: taskId, note: '재검수 통과 ✅' });
  }
  engine.dispatch({ type: 'message', from: qc, to: 'manager', kind: 'report', text: `${stage.label} 통과` });
  engine.dispatch({ type: 'agent_state', agent: qc, state: 'idle', taskId: null, detail: '' });
}

export async function runTask(pipelineKey, title) {
  if (engine.isBusy()) throw new Error('이미 진행 중인 태스크가 있습니다');
  const pl = PIPELINES[pipelineKey];
  if (!pl) throw new Error(`알 수 없는 파이프라인: ${pipelineKey}`);
  const taskId = `t${++taskCounter}_${Date.now().toString(36)}`;
  const taskTitle = title || pl.title;

  engine.dispatch({ type: 'task_created', taskId, title: taskTitle, pipelineKey });

  for (const stage of pl.stages) {
    engine.dispatch({ type: 'task_state', taskId, state: stage.kind === 'gate_approval' ? 'awaiting_approval' : 'running', stage: stage.id });

    if (stage.kind === 'gate_approval') {
      const summary = stage.gate === 'gate_kickoff'
        ? `「${taskTitle}」 시작 승인 요청`
        : `${stage.label} — 「${taskTitle}」`;
      const res = await engine.waitGate(stage.gate, taskId, summary,
        stage.gate === 'gate_publish' ? ['콘텐츠_자동화/카드뉴스/_daily/…'] : []);
      if (res.decision !== 'approved') {
        engine.dispatch({ type: 'message', from: 'yj', to: 'manager', kind: 'command', text: `반려: ${res.note || '사유 미기재'}` });
        engine.dispatch({ type: 'task_state', taskId, state: 'rejected', stage: stage.id });
        return;
      }
      engine.dispatch({ type: 'message', from: 'yj', to: 'manager', kind: 'command', text: `${stage.label} — 승인. 진행하세요` });
      continue;
    }

    if (stage.kind === 'gate_qc') { await qcStage(stage, taskId); continue; }

    // work 스테이지 — agents 병렬
    if (stage.handoff) {
      engine.dispatch({ type: 'agent_state', agent: stage.handoff.from, state: 'reporting', taskId, detail: stage.detail[stage.handoff.from] });
      engine.dispatch({ type: 'agent_move', agent: stage.handoff.from, from: `desk:${stage.handoff.from}`, to: `desk:${stage.handoff.to}` });
      await sleep(secs(stage.dur));
      engine.dispatch({ type: 'message', from: stage.handoff.from, to: stage.handoff.to, kind: 'handoff', text: stage.handoff.text });
      engine.dispatch({ type: 'agent_move', agent: stage.handoff.from, from: `desk:${stage.handoff.to}`, to: `desk:${stage.handoff.from}` });
      engine.dispatch({ type: 'agent_state', agent: stage.handoff.from, state: 'idle', taskId: null, detail: '' });
      continue;
    }
    await Promise.all(stage.agents.map((a) => agentWork(a, taskId, stage.detail[a], stage.dur, { report: stage.report })));
  }

  engine.dispatch({ type: 'message', from: 'manager', to: 'yj', kind: 'report', text: `「${taskTitle}」 전체 완료 — 최종 보고` });
  engine.dispatch({ type: 'task_state', taskId, state: 'done', stage: null });
}
