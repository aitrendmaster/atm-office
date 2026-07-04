// SSE 연결(EventSource 네이티브 자동 재연결) + 명령 POST 헬퍼.
export function connect(onEvent, onStatus) {
  const es = new EventSource('/api/events');
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);          // EventSource가 스스로 재연결 시도
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* skip */ } };
  return es;
}

export async function cmd(body) {
  const r = await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

export async function getMeta() {
  return (await fetch('/api/meta')).json();
}
