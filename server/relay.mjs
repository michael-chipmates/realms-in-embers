/**
 * The blind relay — self-hosted flavor.
 *
 * It knows nothing. Clients send opaque (end-to-end encrypted) blobs; the
 * relay assigns each an ordinal, stores it, and broadcasts it to the room.
 * Reconnecting clients receive the full backlog and replay it locally —
 * the deterministic action log IS the netcode. No accounts, no names, no
 * plaintext game data ever touches this process.
 *
 * Run:  node server/relay.mjs [port]         (default 8787)
 * Docker: see server/Dockerfile
 *
 * The same protocol is served by the Cloudflare Worker in server/worker.js —
 * clients cannot tell the difference.
 */
import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = parseInt(process.argv[2] ?? process.env.PORT ?? '8787', 10);
const MAX_ROOMS = 2000;
const MAX_LOG = 40000; // entries per room; a full campaign is well under this
const MAX_BLOB = 16 * 1024; // bytes per encrypted entry (real acts are ~300 B)
const MAX_ROOM_BYTES = 4 * 1024 * 1024; // total ciphertext per room
const ROOM_TTL_MS = 1000 * 60 * 60 * 24 * 14; // idle rooms evaporate after 14 days

/** room -> { log: string[], sockets: Set<ws>, touched: number } */
const rooms = new Map();

function room(id) {
  let r = rooms.get(id);
  if (!r) {
    if (rooms.size >= MAX_ROOMS) return null;
    // mids: recent client message ids -> seq, so a retransmitted append
    // (lost ack, reconnect) lands exactly once. Bounded FIFO.
    r = { log: [], bytes: 0, sockets: new Set(), touched: Date.now(), mids: new Map(), midOrder: [] };
    rooms.set(id, r);
  }
  r.touched = Date.now();
  return r;
}

const MAX_MIDS = 400;
/** Per-socket append throttle: a small token bucket (burst 20, refill 2/s).
 * Friendly tables never notice; a runaway loop or a griefer does. */
function allowAppend(ws) {
  const now = Date.now();
  if (!ws._bucket) ws._bucket = { tokens: 20, at: now };
  const b = ws._bucket;
  b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 2);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) {
    if (now - r.touched > ROOM_TTL_MS && r.sockets.size === 0) rooms.delete(id);
  }
}, 60_000).unref();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ app: 'realms-in-embers-relay', rooms: rooms.size, blind: true }));
});
const wss = new WebSocketServer({ server, maxPayload: MAX_BLOB + 4096 });

wss.on('connection', (ws) => {
  let joined = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.t === 'join' && typeof msg.room === 'string' && msg.room.length <= 64) {
      // room-creation throttle: joining an EXISTING room is always free;
      // minting fresh rooms is a slow, deliberate act (burst 6, ~1/10s)
      if (!rooms.has(msg.room)) {
        const now = Date.now();
        if (!ws._roomBucket) ws._roomBucket = { tokens: 6, at: now };
        const rb = ws._roomBucket;
        rb.tokens = Math.min(6, rb.tokens + ((now - rb.at) / 1000) * 0.1);
        rb.at = now;
        if (rb.tokens < 1) { ws.send(JSON.stringify({ t: 'error', error: 'slow down' })); return; }
        rb.tokens -= 1;
      }
      const r = room(msg.room);
      if (!r) { ws.send(JSON.stringify({ t: 'error', error: 'relay full' })); return; }
      if (joined) rooms.get(joined)?.sockets.delete(ws);
      joined = msg.room;
      r.sockets.add(ws);
      // delta fetch: a reconnecting client asks from its cursor; the reply
      // names the base so the client can index the suffix correctly
      const since = Number.isInteger(msg.since) && msg.since >= 0 ? Math.min(msg.since, r.log.length) : 0;
      ws.send(JSON.stringify({ t: 'joined', room: msg.room, seq: r.log.length, since, log: r.log.slice(since) }));
      for (const other of r.sockets) {
        if (other !== ws && other.readyState === 1) other.send(JSON.stringify({ t: 'peer', n: r.sockets.size }));
      }
      return;
    }
    if (msg.t === 'append' && joined && typeof msg.data === 'string' && msg.data.length <= MAX_BLOB) {
      const r = rooms.get(joined);
      if (!r) return;
      if (!allowAppend(ws)) {
        ws.send(JSON.stringify({ t: 'error', error: 'slow down' }));
        return;
      }
      const mid = typeof msg.mid === 'string' && msg.mid.length <= 24 ? msg.mid : null;
      if (mid && r.mids.has(mid)) {
        // a retransmission of something already stored: replay the original
        // entry to THIS socket only (the client dedupes by seq)
        const seq = r.mids.get(mid);
        ws.send(JSON.stringify({ t: 'entry', seq, data: r.log[seq] }));
        return;
      }
      if (r.log.length >= MAX_LOG || r.bytes + msg.data.length > MAX_ROOM_BYTES) {
        ws.send(JSON.stringify({ t: 'error', error: 'room log full' }));
        return;
      }
      const seq = r.log.length;
      r.log.push(msg.data);
      r.bytes += msg.data.length;
      r.touched = Date.now();
      if (mid) {
        r.mids.set(mid, seq);
        r.midOrder.push(mid);
        if (r.midOrder.length > MAX_MIDS) r.mids.delete(r.midOrder.shift());
      }
      const out = JSON.stringify({ t: 'entry', seq, data: msg.data });
      for (const s of r.sockets) if (s.readyState === 1) s.send(out);
      return;
    }
  });
  ws.on('close', () => {
    if (joined) {
      const r = rooms.get(joined);
      if (r) {
        r.sockets.delete(ws);
        for (const other of r.sockets) {
          if (other.readyState === 1) other.send(JSON.stringify({ t: 'peer', n: r.sockets.size }));
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`realms-in-embers blind relay listening on :${PORT}`);
});
