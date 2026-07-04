// 걷기: 웨이포인트 BFS 경로 + rAF 트윈. 캐릭터끼리 충돌 무시(서로 통과).
import { WAYPOINTS, WP_EDGES, anchorOf } from './anchors.js';

const SPEED = 260; // px/sec (world 좌표)

function nearestWp(p) {
  let best = null, bd = Infinity;
  for (const [id, w] of Object.entries(WAYPOINTS)) {
    const d = (w.x - p.x) ** 2 + (w.y - p.y) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

function bfs(a, b) {
  if (a === b) return [a];
  const prev = { [a]: null }, q = [a];
  while (q.length) {
    const n = q.shift();
    for (const m of WP_EDGES[n] || []) {
      if (!(m in prev)) { prev[m] = n; if (m === b) { const path = [b]; let c = b; while (prev[c]) { c = prev[c]; path.unshift(c); } return path; } q.push(m); }
    }
  }
  return [a, b];
}

export function buildPath(fromKey, toKey) {
  const A = anchorOf(fromKey), B = anchorOf(toKey);
  const wa = nearestWp(A), wb = nearestWp(B);
  const pts = [{ x: A.x, y: A.y }];
  for (const id of bfs(wa, wb)) pts.push({ ...WAYPOINTS[id] });
  pts.push({ x: B.x, y: B.y });
  // 너무 가까운 중복점 제거
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 24);
}

// 경로 트윈: onStep(pos, dir) 매 프레임, 완료 시 onDone()
export function walkAlong(path, speedMul, onStep, onDone) {
  let seg = 0, t = 0, cancelled = false;
  let last = performance.now();
  function frame(now) {
    if (cancelled) return;
    const dt = Math.min(0.05, (now - last) / 1000) * speedMul;
    last = now;
    let a = path[seg], b = path[seg + 1];
    if (!b) { onDone(); return; }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    t += (SPEED * dt) / Math.max(len, 1);
    while (t >= 1) {
      t -= 1; seg++;
      a = path[seg]; b = path[seg + 1];
      if (!b) { onStep({ x: a.x, y: a.y }, 0); onDone(); return; }
    }
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    onStep({ x, y }, Math.sign(b.x - a.x));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => { cancelled = true; };
}
