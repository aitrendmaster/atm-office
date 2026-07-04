// 월드 렌더 레이어 — 존 러그·책상·캐릭터 엔티티(스프라이트 or CSS 폴백 치비)·팬/줌·클릭.
import { ANCHORS, ZONE_RECTS, anchorOf } from './anchors.js';
import { buildPath, walkAlong } from './walk.js';

const $ = (s, r = document) => r.querySelector(s);
const STATE_EMOJI = { idle: '💤', walking: '🚶', working: '⚙️', reporting: '📋', waiting_gate: '⏳', blocked: '⛔' };

export class World {
  constructor(meta) {
    this.meta = meta;                 // { roster, zones }
    this.el = $('#world');
    this.viewport = $('#viewport');
    this.agents = {};                 // id -> entity
    this.onSelect = null;
    this.gate = null;
    const bg = $('#bg');
    const markBg = () => document.body.classList.add('has-bg');
    if (bg.complete && bg.naturalWidth) markBg(); else bg.addEventListener('load', markBg);
    this._buildZones();
    this._buildDesks();
    this._buildAgents();
    this._panZoom();
    if (new URLSearchParams(location.search).get('debug')) this._debugOverlay();
    this._fitInitial();
  }

  // ── 존 러그(배경 이미지가 있어도 라벨은 표시) ──
  _buildZones() {
    const zc = $('#zones');
    for (const [zid, r] of Object.entries(ZONE_RECTS)) {
      const z = this.meta.zones[zid];
      const d = document.createElement('div');
      d.className = 'zone';
      Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', background: z.tint + '22', border: `2px dashed ${z.tint}55` });
      d.innerHTML = `<span class="zlabel">${z.label}</span>`;
      zc.appendChild(d);
    }
  }

  // ── 책상 + 게이트 소품 (CSS — 배경 이미지에 책상이 있어도 얹혀서 앵커 캘리브레이션 기준이 됨) ──
  _buildDesks() {
    const pc = $('#props');
    for (const [key, a] of Object.entries(ANCHORS)) {
      if (!key.startsWith('desk:') || !a.deskAt) continue;
      const d = document.createElement('div');
      d.className = 'desk' + (key === 'desk:yj' ? ' ceo' : '');
      Object.assign(d.style, { left: a.deskAt.x - 46 + 'px', top: a.deskAt.y - 28 + 'px', zIndex: Math.round(a.deskAt.y) });
      pc.appendChild(d);
    }
    // iris QC 게이트 차단바 + 램프
    const g = anchorOf('anchor:gate');
    const bar = document.createElement('div');
    bar.className = 'gatebar';
    Object.assign(bar.style, { left: g.x - 55 + 'px', top: g.y + 'px', zIndex: Math.round(g.y) + 1 });
    const lamp = document.createElement('div');
    lamp.className = 'gatelamp';
    Object.assign(lamp.style, { left: g.x - 70 + 'px', top: g.y - 4 + 'px', zIndex: Math.round(g.y) + 1 });
    pc.append(bar, lamp);
    this.gate = { bar, lamp };
    // 회의 테이블(허브) — 배경 이미지에 원탁이 있으므로 has-bg에서는 CSS로 숨김
    const mt = document.createElement('div');
    mt.className = 'prop table';
    Object.assign(mt.style, { left: '985px', top: '585px', zIndex: 590 });
    mt.textContent = '🟤';
    mt.style.fontSize = '54px';
    pc.appendChild(mt);
  }

  gateSignal(verdict) {
    const { bar, lamp } = this.gate;
    lamp.className = 'gatelamp ' + (verdict === 'pass' ? 'pass' : 'fail');
    if (verdict === 'pass') { bar.classList.add('open'); setTimeout(() => { bar.classList.remove('open'); lamp.className = 'gatelamp'; }, 2600); }
    else setTimeout(() => { lamp.className = 'gatelamp'; }, 2600);
  }

  // ── 캐릭터 ──
  _buildAgents() {
    const ec = $('#entities');
    for (const [id, info] of Object.entries(this.meta.roster)) {
      const home = anchorOf(`desk:${id}`);
      const el = document.createElement('div');
      el.className = 'agent idle';
      el.dataset.id = id;
      const zoneTint = this.meta.zones[info.zone]?.tint || '#888';
      el.innerHTML = `
        <div class="bubble"></div>
        <div class="sprite">
          <img class="spr" src="/assets/sprites/${id}_sit.png" style="display:none">
          <div class="chibi">
            <div class="hair"></div><div class="head"><i class="eye l"></i><i class="eye r"></i></div>
            <div class="body" style="background:${info.color}"></div>
            <div class="legs"><i></i><i></i></div>
          </div>
        </div>
        <div class="tag" style="border:1px solid ${zoneTint}66">
          <span class="chip" style="background:${info.color}"></span>${info.name.split(' ')[0]}
          <span class="perm">${info.perms}</span><span class="st">💤</span>
        </div>`;
      ec.appendChild(el);
      const ent = {
        id, el, info, pos: { x: home.x, y: home.y }, state: 'idle', cancelWalk: null,
        currentAnchor: `desk:${id}`, atDesk: true,
        img: el.querySelector('img.spr'), chibi: el.querySelector('.chibi'),
        bubbleEl: el.querySelector('.bubble'), stEl: el.querySelector('.st'), bubbleTimer: null,
      };
      // 스프라이트 로드 시도(idle/sit/carry) — 성공하면 CSS 치비 대체. carry 없으면 idle 폴백.
      ent.sprites = { idle: `/assets/sprites/${id}_idle.png`, sit: `/assets/sprites/${id}_sit.png`, carry: `/assets/sprites/${id}_carry.png` };
      const probe = new Image();
      probe.onload = () => { ent.hasSprites = true; this._applyPose(ent); };
      probe.src = ent.sprites.idle;
      const probeCarry = new Image();
      probeCarry.onerror = () => { ent.sprites.carry = ent.sprites.idle; };
      probeCarry.src = ent.sprites.carry;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(id); });
      this.agents[id] = ent;
      this._place(ent);
      // 스프라이트 원본 = 좌향. face:'r'(오른쪽을 봐야 함)이면 flip.
      if (anchorOf(`desk:${id}`).face === 'r') el.classList.add('flip');
    }
  }

  _place(ent) {
    ent.el.style.left = ent.pos.x + 'px';
    ent.el.style.top = ent.pos.y + 'px';
    ent.el.style.zIndex = Math.round(ent.pos.y);
  }

  _applyPose(ent) {
    if (!ent.hasSprites) return;                       // 폴백 치비 유지
    // 포즈 규칙(운영자 확정): 책상에 있으면 착석 / 이동 중엔 서있기 / 보고 이동·보고 중엔 서류 운반
    let pose = 'idle';
    if (ent.atDesk && (ent.state === 'idle' || ent.state === 'working')) pose = 'sit';
    else if (ent.state === 'reporting') pose = 'carry';
    else if (ent.state === 'walking' && ent.reportingMove) pose = 'carry';
    const src = ent.sprites[pose] || ent.sprites.idle;
    if (!ent.img.src.endsWith(src)) ent.img.src = src;
    ent.img.style.display = '';
    ent.chibi.style.display = 'none';
  }

  setAgentState(id, state, detail) {
    const ent = this.agents[id];
    if (!ent) return;
    ent.state = state;
    ent.el.className = `agent ${state}` + (ent.el.classList.contains('flip') ? ' flip' : '');
    ent.stEl.textContent = STATE_EMOJI[state] || '💤';
    ent.el.title = detail || '';
    this._applyPose(ent);
  }

  moveTo(id, toKey, speedMul, onArrive) {
    const ent = this.agents[id];
    if (!ent) return;
    ent.cancelWalk?.();
    const fromKey = ent.currentAnchor || `desk:${id}`;
    const path = buildPath(fromKey, toKey);
    path[0] = { ...ent.pos };                          // 현재 위치에서 시작
    // 보고성 이동 = 직전 상태가 reporting이거나 목적지가 보고 큐/타 책상 → 서류 운반 포즈
    ent.reportingMove = ent.state === 'reporting' || toKey.startsWith('anchor:manager') || (toKey.startsWith('desk:') && toKey !== `desk:${id}`);
    ent.atDesk = false;
    this.setAgentState(id, 'walking', ent.el.title);
    ent.cancelWalk = walkAlong(path, speedMul, (pos, dir) => {
      ent.pos = pos; this._place(ent);
      // 원본 좌향: 오른쪽 이동(dir>0) 시 flip으로 우향
      if (dir > 0) ent.el.classList.add('flip');
      else if (dir < 0) ent.el.classList.remove('flip');
    }, () => {
      ent.currentAnchor = toKey;
      ent.atDesk = toKey.startsWith('desk:');
      if (ent.atDesk) {
        ent.reportingMove = false;
        const a = anchorOf(toKey);
        if (a.face === 'r') ent.el.classList.add('flip'); else ent.el.classList.remove('flip');
      }
      onArrive?.();
    });
  }

  bubble(id, text, kind = '') {
    const ent = this.agents[id];
    if (!ent) return;
    clearTimeout(ent.bubbleTimer);
    ent.bubbleEl.textContent = text.length > 60 ? text.slice(0, 57) + '…' : text;
    ent.bubbleEl.className = `bubble show ${kind}`;
    ent.bubbleTimer = setTimeout(() => ent.bubbleEl.classList.remove('show'), 3600);
  }

  // ── 팬/줌 ──
  _panZoom() {
    let scale = 0.62, tx = 0, ty = 40, dragging = false, sx = 0, sy = 0;
    const apply = () => { this.el.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    this._applyView = apply;
    this._view = () => ({ scale, tx, ty });
    this._setView = (s, x, y) => { scale = s; tx = x; ty = y; apply(); };
    // 버튼/키보드 줌 — 뷰포트 중심 기준
    this.zoomBy = (k) => {
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const ns = Math.min(1.8, Math.max(0.25, scale * k));
      tx = cx - (cx - tx) * (ns / scale);
      ty = cy - (cy - ty) * (ns / scale);
      scale = ns; apply();
    };
    this.fit = () => this._fitInitial();
    this.viewport.addEventListener('mousedown', (e) => { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; this.viewport.classList.add('dragging'); });
    window.addEventListener('mousemove', (e) => { if (dragging) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
    window.addEventListener('mouseup', () => { dragging = false; this.viewport.classList.remove('dragging'); });
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.1 : 0.9;
      const ns = Math.min(1.6, Math.max(0.3, scale * k));
      tx = e.clientX - (e.clientX - tx) * (ns / scale);
      ty = e.clientY - (e.clientY - ty) * (ns / scale);
      scale = ns; apply();
    }, { passive: false });
    apply();
  }

  _fitInitial() {
    const vw = innerWidth, vh = innerHeight;
    const s = Math.min(vw / 1980, vh / 1140);
    this._setView(s, (vw - 1920 * s) / 2, (vh - 1080 * s) / 2 + 20);
  }

  _debugOverlay() {
    for (const [key, a] of Object.entries(ANCHORS)) {
      const d = document.createElement('div');
      d.className = 'dbg';
      Object.assign(d.style, { left: a.x + 'px', top: a.y + 'px' });
      d.innerHTML = `<span>${key}</span>`;
      $('#fx').appendChild(d);
    }
  }
}
