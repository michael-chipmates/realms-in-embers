/**
 * The blind relay — Cloudflare Workers + Durable Objects flavor.
 * Identical protocol to server/relay.mjs; clients cannot tell them apart.
 * Each room is one Durable Object with its log in transactional storage,
 * so campaigns survive hibernation and deploys.
 *
 * Deploy (from server/): npx wrangler deploy
 * For EU data residency, set the room namespace jurisdiction in wrangler.toml.
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
const MAX_BLOB = 64 * 1024;

export class RelayRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const log = (await this.state.storage.get('log')) ?? [];
    server.send(JSON.stringify({ t: 'joined', seq: log.length, log }));
    this.broadcastPeers(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'join') {
      // late joins over an existing socket: resend the backlog
      const log = (await this.state.storage.get('log')) ?? [];
      ws.send(JSON.stringify({ t: 'joined', seq: log.length, log }));
      return;
    }
    if (msg.t === 'append' && typeof msg.data === 'string' && msg.data.length <= MAX_BLOB) {
      const log = (await this.state.storage.get('log')) ?? [];
      if (log.length >= MAX_LOG) return;
      const seq = log.length;
      log.push(msg.data);
      await this.state.storage.put('log', log);
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
