// 클라이언트 스토어 — 서버 이벤트를 월드/UI에 반영. seq 중복 폐기, snapshot 전체 재구축.
import { anchorOf } from './iso/anchors.js';

export class Store {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;               // { taskConsole, approvalInbox, inspector, eventLog, topbar }
    this.lastSeq = 0;
    this.speed = 1;
    this.auto = false;
  }

  handle(ev) {
    if (ev.type !== 'snapshot' && ev.seq <= this.lastSeq) return;   // 중복/역행 폐기
    this.lastSeq = Math.max(this.lastSeq, ev.seq || 0);

    switch (ev.type) {
      case 'snapshot': return this._restore(ev.world);
      case 'agent_state':
        this.world.setAgentState(ev.agent, ev.state, ev.detail);
        if (ev.state === 'working') {
          const ent = this.world.agents[ev.agent];
          if (ent && !ent.atDesk && ent.currentAnchor !== `desk:${ev.agent}`) {
            this.world.moveTo(ev.agent, `desk:${ev.agent}`, this.speed, () => this.world.setAgentState(ev.agent, 'working', ev.detail));
          } else if (ent) { ent.atDesk = true; this.world.setAgentState(ev.agent, 'working', ev.detail); }
          if (ev.detail) this.world.bubble(ev.agent, `⚙️ ${ev.detail}`);
        }
        break;
      case 'agent_move':
        this.world.moveTo(ev.agent, ev.to, this.speed, () => {
          const st = this.world.agents[ev.agent]?.state;
          if (st === 'walking') this.world.setAgentState(ev.agent, ev.to.startsWith('desk:') ? 'idle' : 'reporting');
        });
        break;
      case 'message':
        if (ev.from && this.world.agents[ev.from]) this.world.bubble(ev.from, ev.text, ev.kind === 'report' ? 'report' : 'cmd');
        else if (ev.from === 'yj') this.world.bubble('yj', ev.text, 'cmd');
        this.ui.eventLog.add(ev);
        break;
      case 'gate_qc':
        this.world.gateSignal(ev.verdict);
        this.world.bubble(ev.gate, ev.note, ev.verdict === 'pass' ? 'report' : '');
        this.ui.eventLog.add({ ...ev, type: 'message', from: ev.gate, to: 'manager', kind: ev.verdict === 'pass' ? 'qc-pass' : 'qc-fail', text: ev.note });
        break;
      case 'approval_request':
        this.ui.approvalInbox.push(ev);
        this.world.setAgentState('yj', 'working', ev.summary);
        this.world.bubble('yj', `📥 결재 요청: ${ev.summary}`);
        this.ui.topbar.status('waiting', '⏳ CEO 승인 대기');
        break;
      case 'approval_result':
        this.ui.approvalInbox.remove(ev.gateId);
        this.world.setAgentState('yj', 'idle');
        this.world.bubble('yj', ev.decision === 'approved' ? `✅ 승인 (${ev.by})` : `❌ 반려 (${ev.by})`, ev.decision === 'approved' ? 'report' : '');
        this.ui.eventLog.add({ type: 'message', from: 'yj', to: 'manager', kind: 'approval', text: `${ev.decision === 'approved' ? '승인' : '반려'} — ${ev.gateId}${ev.note ? ' · ' + ev.note : ''}`, ts: ev.ts });
        break;
      case 'task_created':
        this.ui.topbar.status('running', `▶ ${ev.title}`);
        this.ui.eventLog.add({ type: 'message', from: 'yj', to: 'manager', kind: 'command', text: `태스크 시작: ${ev.title}`, ts: ev.ts });
        break;
      case 'task_state':
        if (ev.state === 'running') this.ui.topbar.status('running', `▶ 진행: ${ev.stage || ''}`);
        if (ev.state === 'done') this.ui.topbar.status('done', '✅ 완료');
        if (ev.state === 'rejected') this.ui.topbar.status('', '❌ 반려됨');
        if (ev.state === 'failed') this.ui.topbar.status('', '⚠️ 실패');
        if (['done', 'rejected', 'failed'].includes(ev.state)) this.ui.taskConsole.setBusy(false);
        else this.ui.taskConsole.setBusy(true);
        break;
      case 'set_auto':
        this.auto = ev.value; this.ui.taskConsole.reflectAuto(ev.value);
        break;
      case 'set_speed':
        this.speed = ev.value; this.ui.taskConsole.reflectSpeed(ev.value);
        break;
      case 'artifact':
        this.ui.inspector.noteArtifact(ev.agent, ev.path);
        break;
    }
  }

  _restore(w) {
    this.auto = w.auto; this.speed = w.speed;
    this.ui.taskConsole.reflectAuto(w.auto);
    this.ui.taskConsole.reflectSpeed(w.speed);
    this.ui.taskConsole.setBusy(!!(w.task && !['done', 'rejected', 'failed'].includes(w.task.state)));
    for (const [id, a] of Object.entries(w.agents)) {
      const ent = this.world.agents[id];
      if (!ent) continue;
      ent.cancelWalk?.();
      const anchor = a.at || `desk:${id}`;
      ent.currentAnchor = anchor;
      const pos = anchorOf(anchor);
      ent.pos = { x: pos.x, y: pos.y };
      ent.atDesk = anchor.startsWith('desk:');
      this.world._place(ent);
      this.world.setAgentState(id, a.state, a.detail);
    }
    this.ui.approvalInbox.clear();
    if (w.pendingApproval) this.ui.approvalInbox.push({ ...w.pendingApproval, type: 'approval_request' });
    if (w.task) {
      const stMap = { queued: ['running', '▶ 대기'], awaiting_approval: ['waiting', '⏳ CEO 승인 대기'], running: ['running', `▶ 진행: ${w.task.stage || ''}`], done: ['done', '✅ 완료'], rejected: ['', '❌ 반려됨'], failed: ['', '⚠️ 실패'] };
      const [cls, txt] = stMap[w.task.state] || ['', '대기 중'];
      this.ui.topbar.status(cls, txt);
    }
    this.ui.eventLog.restore(w.log || []);
  }
}
