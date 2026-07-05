// 부트스트랩 — meta 로드 → 월드·UI 구성 → SSE 연결.
import { connect, getMeta } from './net.js';
import { World } from './iso/world.js';
import { Store } from './state.js';
import * as ui from './ui/panels.js';

const meta = await getMeta();
const world = new World(meta);
const panels = {
  topbar: ui.topbar(),
  taskConsole: ui.taskConsole(meta.pipelines),
  approvalInbox: ui.approvalInbox(),
  results: ui.resultsPanel(),
  inspector: ui.inspector(meta.roster, meta.zones),
  eventLog: ui.eventLog(meta.roster),
};
world.onSelect = (id) => panels.inspector.show(id);

// 줌 컨트롤 (버튼 + 키보드 +/-/0)
document.getElementById('zIn').addEventListener('click', () => world.zoomBy(1.25));
document.getElementById('zOut').addEventListener('click', () => world.zoomBy(0.8));
document.getElementById('zFit').addEventListener('click', () => world.fit());
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '+' || e.key === '=') world.zoomBy(1.25);
  else if (e.key === '-') world.zoomBy(0.8);
  else if (e.key === '0') world.fit();
});

const store = new Store(world, panels);
connect((ev) => store.handle(ev), (on) => panels.topbar.conn(on));
