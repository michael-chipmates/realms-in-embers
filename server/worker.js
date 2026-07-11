/**
 * The blind relay — Cloudflare Workers + Durable Objects flavor.
 * Identical protocol to server/relay.mjs; clients cannot tell them apart.
 *
 * Each room is one Durable Object. The log is stored ONE KEY PER ENTRY
 * (`e:<seq>` + a `count` key) — a single-value log would hit the 128 KiB
 * value cap mid-campaign and silently eat every action after it.
 * Idle rooms evaporate after 14 days via the DO alarm.
 *
 * Deploy (from server/): npx wrangler deploy
 * For EU data residency, pin the namespace jurisdiction (see wrangler.toml).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return new Response(JSON.stringify({ app: 'realms-in-embers-relay', blind: true }), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (m && request.headers.get('Upgrade') === 'websocket') {
      const id = env.ROOMS.idFromName(m[1]);
      return env.ROOMS.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};

const MAX_LOG = 40000;
const MAX_BLOB = 16 * 1024;
const MAX_ROOM_BYTES = 4 * 1024 * 1024; // a full campaign is well under 1 MiB
const ROOM_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export class RelayRoom {
  constructor(state) {
    this.state = state;
  }

  async meta() {
    return (await this.state.storage.get('meta')) ?? { count: 0, bytes: 0 };
  }

  async backlog(count) {
    if (count === 0) return [];
    // storage.get() takes at most 128 keys per call — a real campaign logs
    // hundreds of entries, so fetch the log in chunks
    const keys = Array.from({ length: count }, (_, i) => `e:${i}`);
    const log = [];
    for (let at = 0; at < keys.length; at += 128) {
      const slice = keys.slice(at, at + 128);
      const map = await this.state.storage.get(slice);
      for (const k of slice) {
        const v = map.get(k);
        if (typeof v === 'string') log.push(v);
      }
    }
    return log;
  }

  async touch() {
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async alarm() {
    // 14 idle days: the room evaporates, ciphertext and all — unless
    // hibernated sockets are still attached (wiping under them would
    // restart seq at 0 and silently desync every connected client)
    if (this.state.getWebSockets().length > 0) {
      await this.touch();
      return;
    }
    await this.state.storage.deleteAll();
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const meta = await this.meta();
    server.send(JSON.stringify({ t: 'joined', seq: meta.count, log: await this.backlog(meta.count) }));
    await this.touch();
    this.broadcastPeers(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'join') {
      // (re)join over an existing socket: resend the backlog
      const meta = await this.meta();
      ws.send(JSON.stringify({ t: 'joined', seq: meta.count, log: await this.backlog(meta.count) }));
      await this.touch();
      return;
    }
    if (msg.t === 'append' && typeof msg.data === 'string' && msg.data.length <= MAX_BLOB) {
      // per-socket token bucket (burst 20, refill 2/s); in-memory is fine —
      // hibernation resetting the bucket only ever errs friendly
      this.buckets ??= new Map();
      const now = Date.now();
      const b = this.buckets.get(ws) ?? { tokens: 20, at: now };
      b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 2);
      b.at = now;
      if (b.tokens < 1) {
        this.buckets.set(ws, b);
        ws.send(JSON.stringify({ t: 'error', error: 'slow down' }));
        return;
      }
      b.tokens -= 1;
      this.buckets.set(ws, b);
      const meta = await this.meta();
      const mid = typeof msg.mid === 'string' && msg.mid.length <= 24 ? msg.mid : null;
      // retransmission of a stored append (lost ack): replay the original
      // entry to this socket only — never a duplicate in the log
      if (mid && meta.mids && meta.mids[mid] !== undefined) {
        const seq = meta.mids[mid];
        const data = await this.state.storage.get(`e:${seq}`);
        if (typeof data === 'string') ws.send(JSON.stringify({ t: 'entry', seq, data }));
        return;
      }
      if (meta.count >= MAX_LOG || meta.bytes + msg.data.length > MAX_ROOM_BYTES) {
        ws.send(JSON.stringify({ t: 'error', error: 'room log full' }));
        return;
      }
      const seq = meta.count;
      const mids = meta.mids ?? {};
      const midOrder = meta.midOrder ?? [];
      if (mid) {
        mids[mid] = seq;
        midOrder.push(mid);
        if (midOrder.length > 400) delete mids[midOrder.shift()];
      }
      await this.state.storage.put({
        [`e:${seq}`]: msg.data,
        meta: { count: seq + 1, bytes: meta.bytes + msg.data.length, mids, midOrder },
      });
      await this.touch();
      const out = JSON.stringify({ t: 'entry', seq, data: msg.data });
      for (const s of this.state.getWebSockets()) {
        try { s.send(out); } catch { /* gone */ }
      }
    }
  }

  async webSocketClose() {
    this.broadcastPeers();
  }

  broadcastPeers(except) {
    const sockets = this.state.getWebSockets();
    const out = JSON.stringify({ t: 'peer', n: sockets.length });
    for (const s of sockets) {
      if (s === except) continue;
      try { s.send(out); } catch { /* gone */ }
    }
  }
}
