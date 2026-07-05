// ATM Office 서버 — 정적 서빙 + SSE 이벤트 스트림 + 명령/ingest API. 의존성 0 (Node 내장만).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from './sim/engine.js';
import { runTask } from './sim/demo.js';
import { ingest } from './sim/adapter.js';
import * as real from './real.js';
import { ROSTER, ZONES } from './sim/roster.js';
import { PIPELINES } from './sim/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, '..', 'public');
const PORT = 3777;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── SSE 스트림 ──
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    send(engine.snapshot());                       // 연결/재연결 시 항상 스냅샷 선송신
    const off = engine.onEvent(send);
    const ka = setInterval(() => res.write(': ka\n\n'), 25000);
    req.on('close', () => { off(); clearInterval(ka); });
    return;
  }

  // ── 명령 ──
  if (req.method === 'POST' && url.pathname === '/api/cmd') {
    try {
      const c = await readBody(req);
      switch (c.cmd) {
        case 'start_task': {
          if (engine.isBusy() || real.isRunning()) return json(res, 409, { ok: false, error: '이미 진행 중인 태스크가 있습니다' });
          if (c.mode === 'real') {
            if (!c.instruction || !c.instruction.trim()) return json(res, 400, { ok: false, error: '작업 지시 내용이 비어 있습니다' });
            real.runRealTask(c.instruction.trim(), c.title).catch((e) =>
              engine.dispatch({ source: 'real', type: 'task_state', taskId: 'unknown', state: 'failed', note: String(e.message) }));
            return json(res, 200, { ok: true, mode: 'real' });
          }
          runTask(c.pipeline || 'weekly', c.title).catch((e) =>
            engine.dispatch({ type: 'task_state', taskId: 'unknown', state: 'failed', note: String(e.message) }));
          return json(res, 200, { ok: true });
        }
        case 'cancel_task':
          return json(res, 200, { ok: real.cancel() });
        case 'approve':
          return json(res, 200, { ok: engine.resolveGate(c.gateId, c.decision, c.note) });
        case 'set_auto':
          engine.dispatch({ type: 'set_auto', value: !!c.value });
          return json(res, 200, { ok: true });
        case 'set_speed':
          engine.dispatch({ type: 'set_speed', value: +c.value });
          return json(res, 200, { ok: true });
        default:
          return json(res, 400, { ok: false, error: `알 수 없는 cmd: ${c.cmd}` });
      }
    } catch (e) { return json(res, 400, { ok: false, error: String(e.message) }); }
  }

  // ── Phase-2 시임: 외부 이벤트 주입 ──
  if (req.method === 'POST' && url.pathname === '/api/ingest') {
    try { return json(res, 200, ingest(await readBody(req))); }
    catch (e) { return json(res, 400, { ok: false, error: String(e.message) }); }
  }

  // ── 정적 데이터(클라 공용) ──
  if (url.pathname === '/api/meta') {
    return json(res, 200, { roster: ROSTER, zones: ZONES, pipelines: Object.fromEntries(Object.entries(PIPELINES).map(([k, v]) => [k, v.title])) });
  }

  // ── 정적 파일 ──
  let fp = path.join(PUB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!fp.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`✅ ATM Office → http://localhost:${PORT}`));
