/**
 * Save slots in localStorage: 3 rolling autosaves + 5 manual slots +
 * export/import as files. Save format comes from the engine (versioned).
 */
import { deserializeGame, serializeGame } from '../engine/engine';
import { LORD_BY_ID } from '../engine/content/lords';
import type { GameState } from '../engine/types';

const PREFIX = 'realms-in-embers:';

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

export function saveToSlot(state: GameState, slot: number | 'auto'): void {
  try {
    if (slot === 'auto') {
      // rotate: auto2 -> auto3, auto1 -> auto2, new -> auto1
      for (let i = 2; i >= 1; i--) {
        const cur = localStorage.getItem(`${PREFIX}auto${i}`);
        const curMeta = localStorage.getItem(`${PREFIX}auto${i}:meta`);
        if (cur) localStorage.setItem(`${PREFIX}auto${i + 1}`, cur);
        if (curMeta) localStorage.setItem(`${PREFIX}auto${i + 1}:meta`, curMeta);
      }
      write('auto1', state, true);
    } else {
      write(`slot${slot}`, state, false);
    }
  } catch {
    // storage full or unavailable: the game must never crash over a save
  }
}

function write(key: string, state: GameState, auto: boolean): void {
  localStorage.setItem(`${PREFIX}${key}`, serializeGame(state));
  localStorage.setItem(
    `${PREFIX}${key}:meta`,
    JSON.stringify({ ...slotMeta(state), savedAt: Date.now(), auto }),
  );
}

export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  const keys = ['auto1', 'auto2', 'auto3', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
  for (const key of keys) {
    const meta = localStorage.getItem(`${PREFIX}${key}:meta`);
    if (!meta) continue;
    try {
      const parsed = JSON.parse(meta);
      out.push({
        key,
        label: key.startsWith('auto') ? `Autosave ${key.slice(4)}` : `Slot ${key.slice(4)}`,
        auto: key.startsWith('auto'),
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
  const raw = localStorage.getItem(`${PREFIX}${key}`);
  if (!raw) return null;
  try {
    return deserializeGame(raw);
  } catch {
    return null;
  }
}

export function deleteSlot(key: string): void {
  localStorage.removeItem(`${PREFIX}${key}`);
  localStorage.removeItem(`${PREFIX}${key}:meta`);
}

export function hasAnySave(): boolean {
  return listSlots().length > 0;
}

export function newestSave(): SlotInfo | null {
  const slots = listSlots();
  if (slots.length === 0) return null;
  return slots.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
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

export function importSave(file: File): Promise<GameState> {
  return file.text().then((text) => deserializeGame(text));
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
    const raw = localStorage.getItem(SETTINGS_KEY);
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
