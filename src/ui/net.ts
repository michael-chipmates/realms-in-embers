/**
 * Online war: the client half of the blind relay protocol.
 *
 * Everything that leaves this device is AES-GCM encrypted with a room key
 * that lives only in the invite link's URL fragment (fragments are never
 * sent to any server). The relay sees ciphertext and ordinals, nothing
 * else. Reconnection is free: the relay replays the encrypted backlog and
 * the deterministic engine rebuilds the exact game.
 *
 * Integrity model (documented honestly): the room id is bound into each
 * blob as AES-GCM additional data, so ciphertext cannot be replayed across
 * rooms; WITHIN a room the relay is trusted for ordering: this is a
 * trust-your-friends table, not an adversarial ladder.
 *
 * Message kinds inside the encrypted envelope:
 *   hello   {cid, seat?, name}                        · presence + seat claims
 *   start   {settings, clock, seatCids}               · host begins the war
 *   act     {seat, action}                            · one game action
 *   chat    {name, text}                              · table talk
 */
import type { Action, GameSettings } from '../engine/types';
import { RULES_VERSION } from '../engine/state';

/** Wire-protocol level. v2 (2026-07-12): hellos carry protocol+rules versions
 * so mixed-edition tables refuse cleanly instead of desyncing; appends carry a
 * client message id the relay dedupes, so a lost ack can never duplicate an
 * action. Old (v1) clients ignore the new fields and still interoperate:
 * the lobby marks them as "an older edition" and the host cannot start with
 * them seated. */
export const PROTOCOL_VERSION = 2;
export { RULES_VERSION };

export interface ClockConfig {
  /** Seconds added to the bank each of your turns; 0 = no clock. */
  perTurn: number;
  /** Starting reserve, seconds. */
  bank: number;
  label: string;
}

export const CLOCK_PRESETS: ClockConfig[] = [
  { perTurn: 0, bank: 0, label: 'No clock · take your seasons' },
  { perTurn: 240, bank: 480, label: 'Relaxed · 4 min a season, 8 min reserve' },
  { perTurn: 90, bank: 360, label: 'Standard · 90s a season, 6 min reserve' },
  { perTurn: 45, bank: 300, label: 'Blitz · 45s a season, 5 min reserve' },
];

export type NetPayload =
  /** lordId rides along since the gallery (2026-07-11); old clients ignore
   * unknown JSON fields, so the wire stays compatible in both directions.
   * `mid` (v2) is the client message id: random, meaningless, used only to
   * spot our own echo and to let the relay drop retransmitted duplicates.
   * `proto`/`rules` (v2) ride the hello for the compatibility handshake. */
  | { kind: 'hello'; cid: string; name: string; seat: number | null; lordId?: string | null; proto?: number; rules?: number; mid?: string }
  | { kind: 'start'; settings: GameSettings; clock: ClockConfig; seatCids: string[]; rules?: number; mid?: string }
  /** v0.5: acts carry the sender's cid so every client can check the act
   * against the seat roster the start entry pinned. cid-binding, labeled
   * honestly: it stops seat-spoofing between people who share a room key,
   * not a key-holder determined to cheat their friends (SECURITY.md). Old
   * clients omit cid and stay accepted. */
  | { kind: 'act'; seat: number; action: Action; cid?: string; mid?: string }
  /** NET-033: a state checkpoint. After applying the endTurn act at relay
   * seq `afterSeq`, the sender's serialized state hashed to `hash`. Every
   * client reaches that exact point deterministically, so a mismatch means
   * someone's table has left the shared story: freeze and rebuild. */
  | { kind: 'check'; seat: number; afterSeq: number; turn: number; hash: string; mid?: string }
  | { kind: 'chat'; name: string; text: string; mid?: string }
  /** An open-table ad in the Wayhouse room (encrypted with the PUBLISHED
   * wayhouse key: public by design; see docs/design/open-tables.md). */
  | { kind: 'ad'; v: 1; name: string; size: GameSettings['mapSize']; seats: number; taken: number; clockLabel: string; fog: boolean; courier: boolean; invite: string; at: number; roomId: string; gone?: boolean; rules?: number; mid?: string }
  /** A relay entry that failed to decrypt or validate, recorded so the log
   * has no permanent gap. Every honest client holds the same key and runs
   * the same checks on the same bytes, so every honest client tombstones the
   * SAME entries: skipping is consistent, never a fork. */
  | { kind: 'corrupt' };

/** Runtime validation of decrypted payloads: an authenticated blob can still
 * carry malformed or oversized data from anyone holding the room key. Bounds
 * here; legality stays with the engine (applyAction rejects illegal acts). */
export function validatePayload(p: unknown): NetPayload | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
  const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  switch (o.kind) {
    case 'hello':
      if (!str(o.cid, 64) || !str(o.name, 48)) return null;
      if (o.seat !== null && !int(o.seat, 0, 15)) return null;
      return o as NetPayload;
    case 'start': {
      const s = o.settings as Record<string, unknown> | null;
      if (typeof s !== 'object' || s === null) return null;
      if (!str(s.seed, 128) || !Array.isArray(s.players) || s.players.length < 1 || s.players.length > 8) return null;
      if (!Array.isArray(o.seatCids) || o.seatCids.length > 8 || !(o.seatCids as unknown[]).every((c) => str(c, 64))) return null;
      if (typeof o.clock !== 'object' || o.clock === null) return null;
      return o as NetPayload;
    }
    case 'act':
      if (!int(o.seat, 0, 15)) return null;
      if (typeof o.action !== 'object' || o.action === null || !str((o.action as Record<string, unknown>).t, 40)) return null;
      if (o.cid !== undefined && !str(o.cid, 64)) return null;
      return o as NetPayload;
    case 'check':
      if (!int(o.seat, 0, 15) || !int(o.afterSeq, 0, 1_000_000) || !int(o.turn, 0, 10_000)) return null;
      if (!str(o.hash, 16)) return null;
      return o as NetPayload;
    case 'chat':
      if (!str(o.name, 48) || !str(o.text, 500)) return null;
      return o as NetPayload;
    case 'ad':
      if (!str(o.name, 40) || !str(o.invite, 300) || !str(o.roomId, 64) || !str(o.clockLabel, 60)) return null;
      if (!int(o.seats, 1, 8) || !int(o.taken, 0, 8) || typeof o.at !== 'number') return null;
      return o as NetPayload;
    default:
      return null;
  }
}

export interface NetEntry {
  seq: number;
  payload: NetPayload;
}

/** Production default: the deployed blind relay (Cloudflare worker).
 * Local dev talks to `node server/relay.mjs`; either is overridable via
 * the `rie-relay` localStorage key (and `rie-relay-mode` for addressing). */
const DEFAULT_RELAY = location.protocol === 'https:'
  ? 'wss://realms-in-embers-relay.strasserm.workers.dev'
  : 'ws://localhost:8787';

export function relayUrl(): string {
  return localStorage.getItem('rie-relay') ?? DEFAULT_RELAY;
}

// ------------------------------------------------------------------ crypto

export async function makeRoomKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return b64(new Uint8Array(raw));
}

async function importKey(b64key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(b64key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function aad(roomId: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(`rie:${roomId}`);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

async function encrypt(key: CryptoKey, roomId: string, payload: NetPayload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(roomId) }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64(out);
}

async function decrypt(key: CryptoKey, roomId: string, blob: string): Promise<NetPayload | null> {
  try {
    const buf = unb64(blob);
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad(roomId) }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt)) as NetPayload;
  } catch {
    return null; // wrong key, wrong room, or tampered blob: ignore, honestly
  }
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return b64(bytes);
}

/** Client message id: random, content-free, exists so the relay can drop a
 * retransmitted append and we can spot our own echo in a backlog. */
function newMid(): string {
  return b64(crypto.getRandomValues(new Uint8Array(6)));
}

// ------------------------------------------------------------- the wayhouse
/** The Wayhouse: one well-known room per relay where hosts who WANT
 * strangers post their open tables. Its key is published on purpose:
 * "public" is simply "everyone holds the key", which keeps one code path
 * and keeps the relay as blind as ever. Full design:
 * docs/design/open-tables.md. */
export const WAYHOUSE_ROOM = 'wayhouse-v1';
export const WAYHOUSE_KEY = '2wdsABPfe2y15qUqlwLm4A';
/** Ads older than this are treated as cold and hidden. Hosts re-post a
 * heartbeat while their table stays open. */
export const AD_FRESH_MS = 30 * 60 * 1000;
export const AD_HEARTBEAT_MS = 10 * 60 * 1000;

export type WayhouseAd = Extract<NetPayload, { kind: 'ad' }>;

/** Latest ad per room, freshest first; cold, closed, and full tables drop out. */
export function openTables(entries: NetEntry[], now: number, exceptRoom?: string): WayhouseAd[] {
  const latest = new Map<string, WayhouseAd>();
  for (const e of entries) {
    if (e.payload.kind === 'ad') latest.set(e.payload.roomId, e.payload); // seq order: later wins
  }
  return [...latest.values()]
    .filter((ad) => !ad.gone && ad.roomId !== exceptRoom && now - ad.at < AD_FRESH_MS && ad.taken < ad.seats)
    .sort((a, b) => b.at - a.at)
    .slice(0, 50);
}

/** The whole invite: room id + key ride the fragment, never any wire. */
export function inviteLink(roomId: string, key: string): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#war=${roomId}.${key}`;
}

export function parseInvite(hash: string): { roomId: string; key: string } | null {
  const m = hash.match(/#war=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
  return m ? { roomId: m[1], key: m[2] } : null;
}

// ------------------------------------------------------------------ client

export class NetClient {
  private ws: WebSocket | null = null;
  private key: CryptoKey | null = null;
  private closed = false;
  private backoff = 500;
  private joined = false;
  /** Strictly-serialized message processing: crypto is async, sockets are not. */
  private pump: Promise<void> = Promise.resolve();
  /** Payloads composed while the socket was down; flushed after (re)join. */
  private outbox: NetPayload[] = [];
  /** Sent-but-unechoed payloads by mid. If the socket dies between the relay
   * storing an append and us seeing the echo, the backlog replay tells us
   * (our mid appears). Anything still unaccounted for is retransmitted, and
   * the relay's mid-dedupe makes retransmission a no-op if it DID land. This
   * closes the lost-ack duplicate for good. */
  private pending = new Map<string, NetPayload>();
  /** Decrypted entries INDEXED BY SEQ (dense from the relay; gaps only while
   * a blob is still decrypting: consumers must treat undefined as "wait"). */
  readonly entries: (NetEntry | undefined)[] = [];
  onEntry: ((e: NetEntry) => void) | null = null;
  onBacklogReady: (() => void) | null = null;
  onPeers: ((n: number) => void) | null = null;
  onStatus: ((s: 'connecting' | 'open' | 'closed') => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor(readonly roomId: string, private readonly keyB64: string) {}

  /** All decrypted entries in seq order (skipping still-decrypting gaps). */
  list(): NetEntry[] {
    return this.entries.filter((e): e is NetEntry => e !== undefined);
  }

  async connect(): Promise<void> {
    this.key = await importKey(this.keyB64);
    this.open();
  }

  private open(): void {
    if (this.closed) return;
    this.joined = false;
    this.onStatus?.('connecting');
    const base = relayUrl().replace(/\/$/, '');
    // 'path' mode addresses rooms by URL (Cloudflare worker); 'socket' mode
    // joins over the socket (node relay). Heuristic default, explicit override.
    const mode = localStorage.getItem('rie-relay-mode')
      ?? (base.includes('workers.dev') ? 'path' : 'socket');
    const url = mode === 'path' ? `${base}/room/${this.roomId}` : base;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.backoff = 500;
      this.onStatus?.('open');
      // delta fetch: a reconnect asks only for what it missed: the relay
      // replies with `since`, and old relays ignore the field (full log)
      ws.send(JSON.stringify({ t: 'join', room: this.roomId, since: this.entries.length }));
    });
    ws.addEventListener('message', (ev) => {
      const raw = String(ev.data);
      this.pump = this.pump.then(() => this.onMessage(raw)).catch(() => { /* keep pumping */ });
    });
    ws.addEventListener('close', () => {
      this.onStatus?.('closed');
      if (!this.closed) {
        window.setTimeout(() => this.open(), this.backoff);
        this.backoff = Math.min(8000, this.backoff * 2);
      }
    });
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: { t: string; seq?: number; since?: number; data?: string; log?: string[]; n?: number; error?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'error') {
      this.onError?.(msg.error ?? 'relay refused');
      return;
    }
    if (msg.t === 'joined' && Array.isArray(msg.log)) {
      // `since`-aware relays send a suffix; the first entry is seq `since`
      const base = typeof msg.since === 'number' && msg.since >= 0 ? msg.since : 0;
      for (let i = 0; i < msg.log.length; i++) {
        const seq = base + i;
        if (this.entries[seq]) continue; // already decrypted (live entry beat us)
        const payload = await this.readBlob(msg.log[i], seq);
        this.entries[seq] = { seq, payload };
      }
      this.joined = true;
      // settle the unacked ledger against the backlog: whatever landed is
      // cleared; whatever didn't goes back on the wire (same mid: the relay
      // dedupes, so this is safe even if the entry arrives twice)
      for (const e of this.entries) {
        const mid = e && 'mid' in e.payload ? e.payload.mid : undefined;
        if (mid) this.pending.delete(mid);
      }
      const unacked = [...this.pending.values()];
      this.pending.clear();
      this.onBacklogReady?.();
      const queued = this.outbox.splice(0);
      for (const payload of [...unacked, ...queued]) void this.send(payload);
      return;
    }
    if (msg.t === 'entry' && typeof msg.data === 'string' && typeof msg.seq === 'number') {
      if (this.entries[msg.seq]) return;
      const payload = await this.readBlob(msg.data, msg.seq);
      const entry: NetEntry = { seq: msg.seq, payload };
      this.entries[msg.seq] = entry;
      if ('mid' in payload && payload.mid) this.pending.delete(payload.mid);
      this.onEntry?.(entry);
      return;
    }
    if (msg.t === 'peer' && typeof msg.n === 'number') this.onPeers?.(msg.n);
  }

  /** Strictly-serialized sends: encryption is async, and two encryptions
   * racing could hand the relay a later payload first. One at a time. */
  private sendChain: Promise<void> = Promise.resolve();

  /** Queue-and-forget: if the relay is down, the payload waits and flushes
   * after the next successful join. Order among local sends is preserved. */
  send(payload: NetPayload): Promise<void> {
    const task = this.sendChain.then(() => this.sendNow(payload));
    this.sendChain = task.catch(() => undefined);
    return task;
  }

  /** Decrypt + validate; anything unreadable or out of bounds becomes a
   * tombstone. Same key + same bytes + same checks on every honest client
   * means every honest client tombstones identically: no forks. */
  private async readBlob(blob: string, seq: number): Promise<NetPayload> {
    const raw = await decrypt(this.key!, this.roomId, blob);
    const valid = raw === null ? null : validatePayload(raw);
    if (valid === null) this.onError?.(`Entry ${seq} of the war log could not be read and was skipped.`);
    return valid ?? { kind: 'corrupt' };
  }

  private async sendNow(payload: NetPayload): Promise<void> {
    if (payload.kind !== 'corrupt' && !payload.mid) payload = { ...payload, mid: newMid() };
    if (!this.key) { this.outbox.push(payload); return; }
    if (!this.ws || this.ws.readyState !== 1 || !this.joined) {
      this.outbox.push(payload);
      return;
    }
    const data = await encrypt(this.key, this.roomId, payload);
    // the socket can die during encryption; requeue instead of silently dropping
    if (!this.ws || this.ws.readyState !== 1 || !this.joined) {
      this.outbox.push(payload);
      return;
    }
    const mid = payload.kind !== 'corrupt' ? payload.mid : undefined;
    if (mid) this.pending.set(mid, payload);
    this.ws.send(JSON.stringify({ t: 'append', data, mid }));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
