// One existing chart stream per URL/tab. No full-snapshot polling to simulate ticks.
type Consumer = { once?: boolean; symbol: string; message: (m: unknown) => void; status: (s: string) => void };
const hubs = new Map<string, ReturnType<typeof createHub>>();
function createHub(url: string) {
  const consumers = new Set<Consumer>();
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const status = (s: string) => consumers.forEach(c => c.status(s));
  const send = () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:"subscribe", symbols:[...new Set([...consumers].map(c=>c.symbol))]}));
  };
  const close = () => {
    if (retry) clearTimeout(retry); retry = undefined;
    const old = socket; socket = undefined;
    if (old) { old.onclose = null; old.onmessage = null; old.close(); }
  };
  const connect = () => {
    if (stopped || document.hidden || socket || !consumers.size) return;
    status("Connecting");
    const ws = socket = new WebSocket(url);
    ws.onopen = () => { if (socket === ws) { status("Connected"); send(); } };
    ws.onmessage = event => {
      if (socket !== ws || document.hidden) return;
      try { const m = JSON.parse(event.data); consumers.forEach(c => { c.message(m); if (c.once && m.type === "snapshot") hub.remove(c); }); } catch { /* invalid payload */ }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = undefined; status("Reconnecting");
      if (!stopped && !document.hidden) retry = setTimeout(connect, 5000);
    };
  };
  const visible = () => { if (document.hidden) { close(); status("Paused while hidden"); } else connect(); };
  document.addEventListener("visibilitychange", visible);
  const hub = {
    add(c: Consumer) { consumers.add(c); connect(); send(); },
    remove(c: Consumer) {
      if (!consumers.has(c)) return;
      consumers.delete(c);
      if (consumers.size) { send(); return; }
      stopped = true; close(); document.removeEventListener("visibilitychange", visible); hubs.delete(url);
    },
  };
  return hub;
}
export function subscribeCandles(url: string, symbol: string, message: Consumer["message"], status: Consumer["status"], once = false) {
  let hub = hubs.get(url);
  if (!hub) { hub = createHub(url); hubs.set(url, hub); }
  const consumer = {symbol, message, status, once}; hub.add(consumer);
  return () => hub.remove(consumer);
}
