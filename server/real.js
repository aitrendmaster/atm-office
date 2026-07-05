// 실제 실행 모드 — UI 작업 지시를 헤드리스 Claude(stream-json)로 실행하고,
// 스트림 이벤트를 오피스 이벤트로 번역해 캐릭터를 실시간 구동한다. (Phase 2 ③)
// 패턴은 run_*.bat과 동일: claude.exe -p "..." --dangerously-skip-permissions, cwd = ATM sns 루트.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as engine from './sim/engine.js';
import { AGENT_IDS, ROSTER } from './sim/roster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..', '..');          // C:\dev\ATM sns
const LOGDIR = path.join(__dirname, '..', 'logs');

let child = null;
let taskCounter = 0;

function resolveClaude() {
  const home = os.homedir();
  const direct = path.join(home, '.local', 'bin', 'claude.exe');
  if (fs.existsSync(direct)) return direct;
  const extDir = path.join(home, '.vscode', 'extensions');
  try {
    const cands = fs.readdirSync(extDir)
      .filter((d) => d.startsWith('anthropic.claude-code-'))
      .map((d) => path.join(extDir, d, 'resources', 'native-binary', 'claude.exe'))
      .filter(fs.existsSync);
    if (cands.length) return cands.sort().pop();
  } catch { /* 없음 */ }
  return null;
}

// 서브에이전트 타입 → 오피스 캐릭터 매핑
function agentOf(subagentType) {
  if (!subagentType) return 'manager';
  const t = String(subagentType).toLowerCase();
  if (AGENT_IDS.includes(t)) return t;
  const alias = { 'atm-manager': 'manager', 'general-purpose': 'manager', explore: 'caleb', plan: 'joseph', claude: 'manager' };
  return alias[t] || 'manager';
}

export function isRunning() { return !!child; }

export function cancel() {
  if (!child) return false;
  // 트리 킬: 헤드리스 Claude가 스폰한 백그라운드/중첩 프로세스까지 함께 종료(Windows)
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch { /* fallback */ }
  try { child.kill('SIGTERM'); } catch { /* 이미 종료 */ }
  return true;
}

export async function runRealTask(instruction, title) {
  if (engine.isBusy() || child) throw new Error('이미 진행 중인 태스크가 있습니다');
  const exe = resolveClaude();
  if (!exe) throw new Error('claude.exe 를 찾을 수 없습니다 (.local/bin 또는 VSCode 확장)');

  const taskId = `real${++taskCounter}_${Date.now().toString(36)}`;
  const taskTitle = title || instruction.slice(0, 40);
  fs.mkdirSync(LOGDIR, { recursive: true });
  const logPath = path.join(LOGDIR, `real_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const log = fs.createWriteStream(logPath, { flags: 'a' });

  engine.dispatch({ source: 'real', type: 'task_created', taskId, title: `[실제] ${taskTitle}`, pipelineKey: 'real' });

  // 실행 전 CEO 승인 게이트 (AUTO 모드면 자동 통과) — 데모와 동일한 결재 흐름
  engine.dispatch({ source: 'real', type: 'task_state', taskId, state: 'awaiting_approval', stage: 'kickoff' });
  const res = await engine.waitGate('gate_kickoff', taskId, `[실제 실행] ${taskTitle}`, []);
  if (res.decision !== 'approved') {
    engine.dispatch({ source: 'real', type: 'task_state', taskId, state: 'rejected', stage: 'kickoff' });
    return { taskId, started: false };
  }

  const prompt = [
    `다음 작업을 수행하라: ${instruction}`,
    '',
    '실행 규칙:',
    '- 작업 성격에 맞으면 .claude/agents 서브에이전트(caleb·matt·daniel·joseph·esther·ruth·angel·joas·mark·john·peter·iris·samuel·publisher·luke)를 Task 도구로 활용해 분업하라.',
    '- 프로젝트 CLAUDE.md 규칙(예약발행·무손상 경로·디자인 QC 게이트)을 준수하라.',
    '- 금지: 백그라운드 태스크 생성, run_*.bat 실행, claude/헤드리스 중첩 실행, 장시간 폴링. 모든 명령은 포그라운드로 짧게.',
    '- 현황·보고성 질문이면 API 건별 조회 대신 로컬 파일(_published.flag, 캘린더 md, 폴더 목록) 위주로 빠르게 확인하라.',
    '- 리서치·인사이트 산출물은 반드시 `ATM 템플릿/주간 작업물/해당주월요일날짜/` 폴더에 저장하라(분산 금지).',
    "- 산출물에 운영자 실명('오유진')을 기명하지 마라 — 표기는 항상 YJ.",
    '- 완료 시 결과를 3줄 이내로 요약 보고하라. 총 20분 안에 끝내라(초과 시 중단됨).',
  ].join('\n');

  engine.dispatch({ source: 'real', type: 'task_state', taskId, state: 'running', stage: 'executing' });
  engine.dispatch({ source: 'real', type: 'message', from: 'yj', to: 'manager', kind: 'command', text: `[실제] ${taskTitle} — 실행 승인` });
  engine.dispatch({ source: 'real', type: 'agent_state', agent: 'manager', state: 'working', taskId, detail: '작업 분석·팀 배분' });

  child = spawn(exe, ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'],
    { cwd: PROJECT, windowsHide: true });

  const taskAgents = new Map();   // tool_use_id -> agentId (Task 매핑)
  const artifacts = [];           // Write/Edit 파일 경로 수집 → task_result
  let resultSummary = '';
  let lastDetailAt = 0;
  let buf = '';

  // 워치독: 출력 5분 무활동 or 총 25분 초과 → 트리 킬 (영원한 '진행 중' 방지)
  let lastOutputAt = Date.now();
  const startedAt = Date.now();
  const watchdog = setInterval(() => {
    if (!child) { clearInterval(watchdog); return; }
    const idle = Date.now() - lastOutputAt, total = Date.now() - startedAt;
    if (idle > 5 * 60_000 || total > 25 * 60_000) {
      const why = idle > 5 * 60_000 ? '5분간 무응답' : '총 25분 초과';
      engine.dispatch({ source: 'real', type: 'message', from: 'manager', to: 'yj', kind: 'report', text: `⏱ 워치독 중단: ${why} — 로그: atm-office/logs/${path.basename(logPath)}` });
      cancel();
      clearInterval(watchdog);
    }
  }, 15_000);

  const onLine = (line) => {
    log.write(line + '\n');
    let ev;
    try { ev = JSON.parse(line); } catch { return; }

    if (ev.type === 'assistant' && ev.message?.content) {
      for (const c of ev.message.content) {
        if (c.type !== 'tool_use') continue;
        if (c.name === 'Task') {
          const id = agentOf(c.input?.subagent_type);
          const desc = c.input?.description || '서브 작업';
          taskAgents.set(c.id, id);
          engine.dispatch({ source: 'real', type: 'message', from: 'manager', to: id, kind: 'command', text: desc });
          engine.dispatch({ source: 'real', type: 'agent_state', agent: id, state: 'working', taskId, detail: desc });
        } else if (c.name === 'Write' || c.name === 'Edit') {
          const fp = c.input?.file_path;
          if (fp) {
            const rel = fp.replace(PROJECT, '').replace(/^[\\/]/, '');
            if (!artifacts.includes(rel)) artifacts.push(rel);
            engine.dispatch({ source: 'real', type: 'artifact', agent: 'manager', path: rel, kind: c.name.toLowerCase() });
          }
        } else {
          const now = Date.now();               // 도구 스팸 방지: 2초에 1회만 상태 디테일 갱신
          if (now - lastDetailAt > 2000) {
            lastDetailAt = now;
            engine.dispatch({ source: 'real', type: 'agent_state', agent: 'manager', state: 'working', taskId, detail: `${c.name} 실행 중` });
          }
        }
      }
    }

    if (ev.type === 'user' && ev.message?.content) {
      for (const c of ev.message.content) {
        if (c.type === 'tool_result' && taskAgents.has(c.tool_use_id)) {
          const id = taskAgents.get(c.tool_use_id);
          taskAgents.delete(c.tool_use_id);
          engine.dispatch({ source: 'real', type: 'agent_state', agent: id, state: 'reporting', taskId, detail: '작업 완료 보고' });
          engine.dispatch({ source: 'real', type: 'agent_move', agent: id, from: `desk:${id}`, to: 'anchor:manager_q' });
          engine.dispatch({ source: 'real', type: 'message', from: id, to: 'manager', kind: 'report', text: '서브 작업 완료 보고' });
          setTimeout(() => {
            engine.dispatch({ source: 'real', type: 'agent_move', agent: id, from: 'anchor:manager_q', to: `desk:${id}` });
            engine.dispatch({ source: 'real', type: 'agent_state', agent: id, state: 'idle', taskId: null, detail: '' });
          }, 2500);
        }
      }
    }

    if (ev.type === 'result') {
      resultSummary = (ev.result || ev.error || '').toString().slice(0, 2000);
      const brief = resultSummary.replace(/\s+/g, ' ').slice(0, 180);
      engine.dispatch({ source: 'real', type: 'message', from: 'manager', to: 'yj', kind: 'report', text: `완료 보고: ${brief || '(요약 없음)'}` });
    }
  };

  child.stdout.on('data', (d) => {
    lastOutputAt = Date.now();
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(line); }
  });
  child.stderr.on('data', (d) => log.write('[stderr] ' + d.toString('utf8')));

  child.on('close', (code) => {
    log.end();
    const ok = code === 0;
    engine.dispatch({ source: 'real', type: 'task_result', taskId, title: taskTitle, ok,
      summary: resultSummary || (ok ? '(요약 없음)' : `실행 실패 (exit ${code})`),
      artifacts, log: `logs/${path.basename(logPath)}` });
    engine.dispatch({ source: 'real', type: 'task_state', taskId, state: ok ? 'done' : 'failed', stage: null, note: ok ? '' : `exit ${code}` });
    if (!ok) engine.dispatch({ source: 'real', type: 'message', from: 'manager', to: 'yj', kind: 'report', text: `실행 종료 코드 ${code} — 로그: atm-office/logs/${path.basename(logPath)}` });
    child = null;
  });

  return { taskId, started: true, log: logPath };
}
