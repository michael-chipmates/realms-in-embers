/**
 * Save slots in localStorage: 3 rolling autosaves + 5 manual slots +
 * export/import as files. Save format comes from the engine (versioned).
 *
 * Trust rules: every write is transactional (temp key -> verify -> rotate),
 * every write path returns a typed SaveResult, a `:lastgood` copy of the
 * previous valid autosave survives one generation, and imported files are
 * validated before they are allowed anywhere near a running game.
 */
import { deserializeGame, serializeGame } from '../engine/engine';
import { RULES_VERSION } from '../engine/state';
import { LORD_BY_ID } from '../engine/content/lords';
import type { GameState } from '../engine/types';

const PREFIX = 'realms-in-embers:';

/** Previous valid autosave, kept one generation beyond the rotation. */
export const AUTOSAVE_LASTGOOD_KEY = `${PREFIX}auto:lastgood`;

/** Imports larger than this are refused unread. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// ------------------------------------------------------------ typed results

export type SaveResult =
  | { ok: true }
  | { ok: false; code: 'quota' | 'unavailable' | 'verify-failed'; message: string };

export type ImportResult =
  | { ok: true; state: GameState }
  | { ok: false; code: 'too-large' | 'invalid'; message: string };

const MSG_QUOTA =
  'The realm could not be saved. The browser refused the space. Export the chronicle to keep it safe.';
const MSG_UNAVAILABLE =
  'This browser is keeping no saves. Private windows often refuse them. Export the chronicle to a file to keep it safe.';
const MSG_VERIFY =
  'The save came back damaged when checked, so the previous one was kept. Try again, or export the chronicle to a file.';
const MSG_TOO_LARGE =
  'That file is far too large to be a chronicle. Nothing was changed.';
const MSG_INVALID =
  'That file is not a chronicle this game can read. Nothing was changed.';
const MSG_NEWER_AGE =
  'That chronicle was written by a newer age of the game. Nothing was changed.';

// ------------------------------------------------------------- save health

export interface SaveHealth {
  state: 'ok' | 'failed' | 'unavailable';
  /** When the last successful save landed (ms since epoch). */
  lastSaved?: number;
  /** Turn of the last successful save, for "Last saved: season …". */
  lastSavedTurn?: number;
  message?: string;
}

type HealthListener = (health: SaveHealth) => void;
const healthListeners = new Set<HealthListener>();
let health: SaveHealth | null = null;

export function getSaveHealth(): SaveHealth {
  if (!health) {
    const ls = getStorage();
    if (!ls) {
      health = { state: 'unavailable', message: MSG_UNAVAILABLE };
    } else {
      const newest = newestSave();
      health = { state: 'ok', lastSaved: newest?.savedAt, lastSavedTurn: newest?.turn };
    }
  }
  return health;
}

/** Subscribe to save-health changes. Returns an unsubscribe function. */
export function subscribeSaveHealth(fn: HealthListener): () => void {
  healthListeners.add(fn);
  return () => {
    healthListeners.delete(fn);
  };
}

function setHealth(next: SaveHealth): void {
  health = next;
  for (const fn of healthListeners) {
    try {
      fn(next);
    } catch {
      // a broken listener must never break saving
    }
  }
}

function reportResult(res: SaveResult, turn: number): SaveResult {
  const prev = getSaveHealth();
  if (res.ok) {
    setHealth({ state: 'ok', lastSaved: Date.now(), lastSavedTurn: turn });
  } else {
    setHealth({
      state: res.code === 'unavailable' ? 'unavailable' : 'failed',
      lastSaved: prev.lastSaved,
      lastSavedTurn: prev.lastSavedTurn,
      message: res.message,
    });
  }
  return res;
}

// --------------------------------------------------------------- storage io

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    localStorage.getItem(`${PREFIX}probe`);
    return localStorage;
  } catch {
    return null; // private mode or storage disabled entirely
  }
}

function safeGet(ls: Storage, key: string): string | null {
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(ls: Storage, key: string): void {
  try {
    ls.removeItem(key);
  } catch {
    // removing is best effort
  }
}

function classify(e: unknown): 'quota' | 'unavailable' {
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = e instanceof Error ? e.message : String(e);
  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota|space|storage.*full/i.test(msg)
  ) {
    return 'quota';
  }
  return 'unavailable';
}

function failFrom(e: unknown): SaveResult {
  const code = classify(e);
  return { ok: false, code, message: code === 'quota' ? MSG_QUOTA : MSG_UNAVAILABLE };
}

/**
 * Transactional write: temp key -> read back and verify -> rotate onto the
 * real key -> drop the temp. On any failure the previous save is untouched.
 */
function txWrite(ls: Storage, key: string, raw: string, meta: string): SaveResult {
  const tmpKey = `${PREFIX}${key}:tmp`;
  try {
    ls.setItem(tmpKey, raw);
  } catch (e) {
    safeRemove(ls, tmpKey);
    return failFrom(e);
  }
  const back = safeGet(ls, tmpKey);
  if (back !== raw || !verifyRaw(back)) {
    safeRemove(ls, tmpKey);
    return { ok: false, code: 'verify-failed', message: MSG_VERIFY };
  }
  try {
    ls.setItem(`${PREFIX}${key}`, raw);
    ls.setItem(`${PREFIX}${key}:meta`, meta);
  } catch (e) {
    safeRemove(ls, tmpKey);
    return failFrom(e);
  }
  safeRemove(ls, tmpKey);
  return { ok: true };
}

// -------------------------------------------------------------------- slots

export interface SlotInfo {
  key: string;
  label: string;
  turn: number;
  seed: string;
  lords: string;
  savedAt: number;
  auto: boolean;
}

function slotMeta(state: GameState): Omit<SlotInfo, 'key' | 'auto' | 'savedAt' | 'label'> {
  return {
    turn: state.turn,
    seed: state.seed,
    lords: state.players.map((p) => LORD_BY_ID[p.lordId]?.name ?? p.lordId).join(', '),
  };
}

export function saveToSlot(state: GameState, slot: number | 'auto' | 'emergency'): SaveResult {
  const ls = getStorage();
  if (!ls) {
    return reportResult({ ok: false, code: 'unavailable', message: MSG_UNAVAILABLE }, state.turn);
  }
  let raw: string;
  try {
    raw = serializeGame(state);
  } catch {
    return reportResult({ ok: false, code: 'verify-failed', message: MSG_VERIFY }, state.turn);
  }
  const meta = JSON.stringify({ ...slotMeta(state), savedAt: Date.now(), auto: slot === 'auto' });

  if (slot === 'emergency') {
    // SAVE-033: the crash boundary sets the chronicle down here on the way
    // out. One slot, always overwritten: the freshest wreck is the one
    // worth salvaging.
    return reportResult(txWrite(ls, 'emergency', raw, meta), state.turn);
  }
  if (slot !== 'auto') {
    return reportResult(txWrite(ls, `slot${slot}`, raw, meta), state.turn);
  }

  // Keep the previous valid autosave one generation beyond the rotation, so
  // a corrupted write can never take the whole line of retreat with it.
  const prev = safeGet(ls, `${PREFIX}auto1`);
  if (prev && verifyRaw(prev)) {
    try {
      ls.setItem(AUTOSAVE_LASTGOOD_KEY, prev);
      const prevMeta = safeGet(ls, `${PREFIX}auto1:meta`);
      if (prevMeta) ls.setItem(`${AUTOSAVE_LASTGOOD_KEY}:meta`, prevMeta);
    } catch {
      // the older lastgood stays; that is still a valid line of retreat
    }
  }

  // rotate: auto2 -> auto3, auto1 -> auto2 (best-effort history; the
  // transactional write below is the one that must succeed)
  try {
    for (let i = 2; i >= 1; i--) {
      const cur = ls.getItem(`${PREFIX}auto${i}`);
      const curMeta = ls.getItem(`${PREFIX}auto${i}:meta`);
      if (cur) ls.setItem(`${PREFIX}auto${i + 1}`, cur);
      if (curMeta) ls.setItem(`${PREFIX}auto${i + 1}:meta`, curMeta);
    }
  } catch {
    // rotation of old history may fail under pressure; keep going
  }

  let res = txWrite(ls, 'auto1', raw, meta);
  if (!res.ok && res.code === 'quota') {
    // make room by dropping the oldest autosave, then try once more
    safeRemove(ls, `${PREFIX}auto3`);
    safeRemove(ls, `${PREFIX}auto3:meta`);
    res = txWrite(ls, 'auto1', raw, meta);
  }
  return reportResult(res, state.turn);
}

export function listSlots(): SlotInfo[] {
  const ls = getStorage();
  if (!ls) return [];
  const out: SlotInfo[] = [];
  const keys = ['emergency', 'auto1', 'auto2', 'auto3', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
  for (const key of keys) {
    const meta = safeGet(ls, `${PREFIX}${key}:meta`);
    if (!meta) continue;
    try {
      const parsed = JSON.parse(meta);
      out.push({
        key,
        label: key === 'emergency' ? 'The emergency copy' : key.startsWith('auto') ? `Autosave ${key.slice(4)}` : `Slot ${key.slice(4)}`,
        auto: key.startsWith('auto') || key === 'emergency',
        turn: parsed.turn,
        seed: parsed.seed,
        lords: parsed.lords,
        savedAt: parsed.savedAt,
      });
    } catch {
      // unreadable meta: skip
    }
  }
  return out;
}

export function loadSlot(key: string): GameState | null {
  const ls = getStorage();
  if (!ls) return null;
  const raw = safeGet(ls, `${PREFIX}${key}`);
  if (!raw) return null;
  try {
    return deserializeGame(raw);
  } catch {
    return null;
  }
}

export function deleteSlot(key: string): SaveResult {
  const ls = getStorage();
  if (!ls) return { ok: false, code: 'unavailable', message: MSG_UNAVAILABLE };
  try {
    ls.removeItem(`${PREFIX}${key}`);
    ls.removeItem(`${PREFIX}${key}:meta`);
    return { ok: true };
  } catch (e) {
    return failFrom(e);
  }
}

export function hasAnySave(): boolean {
  return listSlots().length > 0;
}

export function newestSave(): SlotInfo | null {
  const slots = listSlots();
  if (slots.length === 0) return null;
  return slots.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
}

/**
 * Boot check: if the newest autosave is damaged but the `:lastgood` copy
 * still reads, restore it onto auto1 so "Continue" works. Returns a note
 * for the player when a recovery happened, else null.
 */
export function bootRecoveryCheck(): string | null {
  const ls = getStorage();
  if (!ls) return null;
  const raw = safeGet(ls, `${PREFIX}auto1`);
  if (!raw || verifyRaw(raw)) return null;
  const good = safeGet(ls, AUTOSAVE_LASTGOOD_KEY);
  if (!good || !verifyRaw(good)) return null;
  try {
    ls.setItem(`${PREFIX}auto1`, good);
    const goodMeta = safeGet(ls, `${AUTOSAVE_LASTGOOD_KEY}:meta`);
    if (goodMeta) ls.setItem(`${PREFIX}auto1:meta`, goodMeta);
  } catch {
    return null; // could not restore; the damaged save stays for inspection
  }
  const note =
    'The newest autosave was damaged, so an older good copy was restored. A season or two may be missing.';
  const cur = getSaveHealth();
  setHealth({ ...cur, message: note });
  return note;
}

// ---------------------------------------------------------- import/validate

/** JSON.parse reviver that rejects prototype-pollution keys at any depth. */
function safeReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error('forbidden key');
  }
  return value;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intIn(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** Parse with the safe reviver and check the shape. Never throws. */
function parseAndCheck(text: string): { ok: boolean; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, safeReviver);
  } catch {
    return { ok: false, message: MSG_INVALID };
  }
  if (!isRecord(parsed)) return { ok: false, message: MSG_INVALID };
  if (parsed.app !== 'realms-in-embers' || parsed.v !== 1) return { ok: false, message: MSG_INVALID };
  const st = parsed.state;
  if (!isRecord(st)) return { ok: false, message: MSG_INVALID };
  if (typeof st.v === 'number' && st.v > RULES_VERSION) return { ok: false, message: MSG_NEWER_AGE };
  if (!intIn(st.v, 1, RULES_VERSION)) return { ok: false, message: MSG_INVALID };
  if (typeof st.seed !== 'string' || st.seed.length > 200) return { ok: false, message: MSG_INVALID };
  if (!intIn(st.turn, 1, 100_000)) return { ok: false, message: MSG_INVALID };
  if (st.phase !== 'playing' && st.phase !== 'ended') return { ok: false, message: MSG_INVALID };
  if (!isRecord(st.settings)) return { ok: false, message: MSG_INVALID };
  if (!intIn(st.mapW, 1, 1024) || !intIn(st.mapH, 1, 1024)) return { ok: false, message: MSG_INVALID };
  if (!Array.isArray(st.cells) || st.cells.length !== (st.mapW as number) * (st.mapH as number)) {
    return { ok: false, message: MSG_INVALID };
  }
  if (!Array.isArray(st.provinces) || st.provinces.length < 1 || st.provinces.length > 10_000) {
    return { ok: false, message: MSG_INVALID };
  }
  if (!Array.isArray(st.players) || st.players.length < 1 || st.players.length > 16) {
    return { ok: false, message: MSG_INVALID };
  }
  if (!Array.isArray(st.rng) || st.rng.length > 64 || !st.rng.every((n) => typeof n === 'number')) {
    return { ok: false, message: MSG_INVALID };
  }
  if (!Array.isArray(st.log) || st.log.length > 500_000) return { ok: false, message: MSG_INVALID };
  if (typeof st.current !== 'number') return { ok: false, message: MSG_INVALID };
  if (!isRecord(st.armies) || !isRecord(st.heroes)) return { ok: false, message: MSG_INVALID };
  return { ok: true, message: '' };
}

/** True when raw text round-trips as a save this build can read. */
function verifyRaw(text: string | null): boolean {
  return typeof text === 'string' && text.length <= MAX_IMPORT_BYTES && parseAndCheck(text).ok;
}

/**
 * Validate imported save text. Never throws, never touches any running
 * game: on success it returns a freshly built state, on failure a typed
 * error with a plain sentence.
 */
export function validateSaveText(text: string): ImportResult {
  if (typeof text !== 'string') return { ok: false, code: 'invalid', message: MSG_INVALID };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, code: 'too-large', message: MSG_TOO_LARGE };
  const check = parseAndCheck(text);
  if (!check.ok) return { ok: false, code: 'invalid', message: check.message };
  try {
    return { ok: true, state: deserializeGame(text) };
  } catch {
    return { ok: false, code: 'invalid', message: MSG_INVALID };
  }
}

export async function importSaveResult(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, code: 'too-large', message: MSG_TOO_LARGE };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, code: 'invalid', message: MSG_INVALID };
  }
  return validateSaveText(text);
}

/** Legacy throwing form (title screen). The message is player-readable. */
export async function importSave(file: File): Promise<GameState> {
  const res = await importSaveResult(file);
  if (!res.ok) throw new Error(res.message);
  return res.state;
}

export function exportSave(state: GameState): void {
  const blob = new Blob([serializeGame(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `realms-in-embers-${state.seed}-season${state.turn}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------- settings

export interface UiSettings {
  colorblind: boolean;
  reducedMotion: boolean;
  textScale: number;
  volMaster: number;
  volMusic: number;
  volSfx: number;
  veteranChronicle: boolean;
}

const SETTINGS_KEY = `${PREFIX}settings`;

export function loadSettings(): UiSettings {
  try {
    const raw = getStorage()?.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultUiSettings(), ...JSON.parse(raw) };
  } catch {
    // fall through
  }
  return defaultUiSettings();
}

export function defaultUiSettings(): UiSettings {
  return {
    colorblind: false,
    // seed from the OS preference; the in-game toggle still overrides
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    textScale: 1,
    volMaster: 0.8,
    volMusic: 0.6,
    volSfx: 0.8,
    veteranChronicle: false,
  };
}

export function saveSettings(settings: UiSettings): void {
  try {
    getStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // settings are tiny and re-derivable; not worth alarming the player
  }
}
