/**
 * Online war: the client half of the blind relay protocol.
 *
 * Everything that leaves this device is AES-GCM encrypted with a room key
 * that lives only in the invite link's URL fragment (fragments are never
 * sent to any server). The relay sees ciphertext and ordinals — nothing
 * else. Reconnection is free: the relay replays the encrypted backlog and
 * the deterministic engine rebuilds the exact game.
 *
 * Integrity model (documented honestly): the room id is bound into each
 * blob as AES-GCM additional data, so ciphertext cannot be replayed across
 * rooms; WITHIN a room the relay is trusted for ordering — this is a
 * trust-your-friends table, not an adversarial ladder.
 *
 * Message kinds inside the encrypted envelope:
 *   hello   {cid, seat?, name}                        — presence + seat claims
 *   start   {settings, clock, seatCids}               — host begins the war
 *   act     {seat, action}                            — one game action
 *   chat    {name, text}                              — table talk
 */
import type { Action, GameSettings } from '../engine/types';

export interface ClockConfig {
  /** Seconds added to the bank each of your turns; 0 = no clock. */
  perTurn: number;
  /** Starting reserve, seconds. */
  bank: number;
  label: string;
}

export const CLOCK_PRESETS: ClockConfig[] = [
  { perTurn: 0, bank: 0, label: 'No clock — take your seasons' },
  { perTurn: 240, bank: 480, label: 'Relaxed — 4 min a season, 8 min reserve' },
  { perTurn: 90, bank: 360, label: 'Standard — 90s a season, 6 min reserve' },
  { perTurn: 45, bank: 300, label: 'Blitz — 45s a season, 5 min reserve' },
];

export type NetPayload =
  | { kind: 'hello'; cid: string; name: string; seat: number | null }
  | { kind: 'start'; settings: GameSettings; clock: ClockConfig; seatCids: string[] }
  | { kind: 'act'; seat: number; action: Action }
  | { kind: 'chat'; name: string; text: string };

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
  /** Decrypted entries INDEXED BY SEQ (dense from the relay; gaps only while
   * a blob is still decrypting — consumers must treat undefined as "wait"). */
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
      ws.send(JSON.stringify({ t: 'join', room: this.roomId }));
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
    let msg: { t: string; seq?: number; data?: string; log?: string[]; n?: number; error?: string };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'error') {
      this.onError?.(msg.error ?? 'relay refused');
      return;
    }
    if (msg.t === 'joined' && Array.isArray(msg.log)) {
      for (let i = 0; i < msg.log.length; i++) {
        if (this.entries[i]) continue; // already decrypted (live entry beat us)
        const payload = await decrypt(this.key!, this.roomId, msg.log[i]);
        if (payload) this.entries[i] = { seq: i, payload };
      }
      this.joined = true;
      this.onBacklogReady?.();
      const pending = this.outbox.splice(0);
      for (const payload of pending) void this.send(payload);
      return;
    }
    if (msg.t === 'entry' && typeof msg.data === 'string' && typeof msg.seq === 'number') {
      if (this.entries[msg.seq]) return;
      const payload = await decrypt(this.key!, this.roomId, msg.data);
      if (!payload) return;
      const entry = { seq: msg.seq, payload };
      this.entries[msg.seq] = entry;
      this.onEntry?.(entry);
      return;
    }
    if (msg.t === 'peer' && typeof msg.n === 'number') this.onPeers?.(msg.n);
  }

  /** Queue-and-forget: if the relay is down, the payload waits and flushes
   * after the next successful join. Order among local sends is preserved. */
  async send(payload: NetPayload): Promise<void> {
    if (!this.key) { this.outbox.push(payload); return; }
    if (!this.ws || this.ws.readyState !== 1 || !this.joined) {
      this.outbox.push(payload);
      return;
    }
    this.ws.send(JSON.stringify({ t: 'append', data: await encrypt(this.key, this.roomId, payload) }));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
