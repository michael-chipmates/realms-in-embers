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
const MAX_BLOB = 64 * 1024; // bytes per encrypted entry
const ROOM_TTL_MS = 1000 * 60 * 60 * 24 * 14; // idle rooms evaporate after 14 days

/** room -> { log: string[], sockets: Set<ws>, touched: number } */
const rooms = new Map();

function room(id) {
  let r = rooms.get(id);
  if (!r) {
    if (rooms.size >= MAX_ROOMS) return null;
    r = { log: [], sockets: new Set(), touched: Date.now() };
    rooms.set(id, r);
  }
  r.touched = Date.now();
  return r;
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
      const r = room(msg.room);
      if (!r) { ws.send(JSON.stringify({ t: 'error', error: 'relay full' })); return; }
      if (joined) rooms.get(joined)?.sockets.delete(ws);
      joined = msg.room;
      r.sockets.add(ws);
      ws.send(JSON.stringify({ t: 'joined', room: msg.room, seq: r.log.length, log: r.log }));
      for (const other of r.sockets) {
        if (other !== ws && other.readyState === 1) other.send(JSON.stringify({ t: 'peer', n: r.sockets.size }));
      }
      return;
    }
    if (msg.t === 'append' && joined && typeof msg.data === 'string' && msg.data.length <= MAX_BLOB) {
      const r = rooms.get(joined);
      if (!r || r.log.length >= MAX_LOG) return;
      const seq = r.log.length;
      r.log.push(msg.data);
      r.touched = Date.now();
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
