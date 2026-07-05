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

// 미니 마크다운 → 읽기용 HTML (의존성 0): 제목/볼드/이탤릭/링크/리스트/표/코드/인용/구분선
function mdToHtml(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let html = '', inCode = false, inList = false, inTable = false;
  const closeAll = () => { if (inList) { html += '</ul>'; inList = false; } if (inTable) { html += '</table>'; inTable = false; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (l.startsWith('```')) { closeAll(); html += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue; }
    if (inCode) { html += esc(raw) + '\n'; continue; }
    if (/^\|.*\|$/.test(l)) {
      if (/^\|[\s:|-]+\|$/.test(l)) continue;                     // 구분행 스킵
      if (!inTable) { closeAll(); html += '<table>'; inTable = true; }
      html += '<tr>' + l.slice(1, -1).split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>';
      continue;
    }
    if (inTable) { html += '</table>'; inTable = false; }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeAll(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    if (/^(-{3,}|\*{3,})$/.test(l)) { closeAll(); html += '<hr>'; continue; }
    if (/^>\s?/.test(l)) { closeAll(); html += `<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (!l.trim()) { closeAll(); continue; }
    closeAll(); html += `<p>${inline(l)}</p>`;
  }
  if (inCode) html += '</pre>';
  closeAll();
  return html;
}

function mdPage(title, src, rel) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{max-width:860px;margin:0 auto;padding:44px 26px 90px;font-family:'Pretendard','Malgun Gothic',sans-serif;background:#fdfcfa;color:#24292f;line-height:1.7;font-size:15.5px}
h1{font-size:26px;border-bottom:2px solid #e8e2d9;padding-bottom:10px;margin:8px 0 18px}
h2{font-size:20px;margin:30px 0 10px;padding-left:10px;border-left:4px solid #0691B4}
h3{font-size:16.5px;margin:22px 0 8px}h4{font-size:15px;margin:18px 0 6px;color:#57606a}
p{margin:8px 0}ul{margin:8px 0 8px 22px}li{margin:4px 0}
table{border-collapse:collapse;margin:12px 0;width:100%;font-size:14px}td{border:1px solid #e0d9cf;padding:7px 10px}tr:first-child td{background:#f3efe8;font-weight:700}
blockquote{margin:10px 0;padding:8px 14px;background:#f3f7f9;border-left:4px solid #67c3d8;border-radius:0 8px 8px 0;color:#3a5560}
code{background:#f0ece5;padding:1px 6px;border-radius:5px;font-size:13.5px}
pre{background:#22272e;color:#dbe3ea;padding:14px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.5}
hr{border:none;border-top:1px solid #e8e2d9;margin:22px 0}a{color:#0969da}
.meta{font-size:12px;color:#8b949e;margin-bottom:14px}.meta a{color:#8b949e}
</style></head><body>
<div class="meta">📄 ${rel} · <a href="/api/file?path=${encodeURIComponent(rel)}&raw=1">원문 md</a> · ATM Office 뷰어</div>
${mdToHtml(src)}
</body></html>`;
}

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

  // ── 결과물 열람(읽기 전용, 프로젝트 루트 하위만). .md는 스타일 HTML로 렌더(?raw=1이면 원문) ──
  if (url.pathname === '/api/file') {
    const rel = url.searchParams.get('path') || '';
    const ROOT = path.resolve(__dirname, '..', '..');            // C:\dev\ATM sns
    const fp = path.resolve(ROOT, rel);
    if (!fp.startsWith(ROOT)) return json(res, 403, { ok: false, error: '허용 범위 밖 경로' });
    fs.readFile(fp, (err, data) => {
      if (err) return json(res, 404, { ok: false, error: '파일 없음: ' + rel });
      const ext = path.extname(fp).toLowerCase();
      if (ext === '.md' && url.searchParams.get('raw') !== '1') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(mdPage(path.basename(fp), data.toString('utf8'), rel));
      }
      const ct = MIME[ext] || (['.md', '.txt', '.log', '.json', '.py', '.js'].includes(ext) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    });
    return;
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
