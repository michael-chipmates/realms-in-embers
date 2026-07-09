/**
 * The online war lobby: one link, friends click it, lords get picked,
 * the host seals the muster. No accounts — a display name and a seat.
 * Everything past this screen travels encrypted; the relay reads nothing.
 */
import { LORDS, LORD_BY_ID } from '../../engine/content/lords';
import { defaultSettings } from '../../engine/state';
import type { GameSettings, PlayerSetup } from '../../engine/types';
import { h, mount, clear } from '../dom';
import { sigilShield } from '../heraldry';
import {
  CLOCK_PRESETS, NetClient, inviteLink, makeRoomKey, randomRoomId, relayUrl,
  type ClockConfig, type NetPayload,
} from '../net';
import type { App } from '../app';

export interface OnlineSession {
  client: NetClient;
  mySeat: number;
  myCid: string;
  clock: ClockConfig;
  /** cid per human seat, in seat order. */
  seatCids: (string | null)[];
  /** How many relay entries were consumed to build the current state. */
  cursor: number;
}

interface LobbyPeer { cid: string; name: string; seat: number | null }

function myCid(): string {
  let cid = localStorage.getItem('rie-cid');
  if (!cid) {
    cid = randomRoomId();
    localStorage.setItem('rie-cid', cid);
  }
  return cid;
}

function myName(): string {
  return localStorage.getItem('rie-name') ?? '';
}

/** Aggregate hellos (last write per cid wins) into the current table. */
function tableFrom(entries: { payload: NetPayload }[]): LobbyPeer[] {
  const peers = new Map<string, LobbyPeer>();
  for (const e of entries) {
    const p = e.payload as NetPayload & { cid?: string };
    if (p.kind === 'hello' && typeof p.cid === 'string') {
      peers.set(p.cid, { cid: p.cid, name: p.name, seat: p.seat });
    }
  }
  return [...peers.values()];
}

export async function openOnlineLobby(app: App, invite?: { roomId: string; key: string }): Promise<void> {
  const roomId = invite?.roomId ?? randomRoomId();
  const key = invite?.key ?? await makeRoomKey();
  const cid = myCid();
  const client = new NetClient(roomId, key);

  const root = app.root;
  clear(root);
  const status = h('p', { class: 'small muted', 'aria-live': 'polite' }, 'Reaching the relay…');
  const tableEl = h('div', { class: 'lobby-table' });
  const controls = h('div', { class: 'lobby-controls' });
  const nameInput = h('input', {
    class: 'input', type: 'text', maxlength: '24', placeholder: 'Your name at the table',
    value: myName(),
  }) as HTMLInputElement;

  const link = inviteLink(roomId, key);
  const screen = h('div', { class: 'room title-screen' },
    h('div', { class: 'title-center lobby-center' },
      h('p', { class: 'title-over muted italic' }, 'An online war'),
      h('h1', { class: 'title-display', style: { fontSize: 'clamp(1.5rem, 4vw, 2.4rem)' } }, 'The Muster Table'),
      h('p', { class: 'small muted', style: { maxWidth: '52ch', margin: '0.4rem auto' } },
        'One link seats everyone. The relay carries only ciphertext — the key never leaves this address bar. No accounts, no tracking, ever.'),
      h('div', { class: 'lobby-invite' },
        h('input', { class: 'input', type: 'text', readonly: 'readonly', value: link, 'aria-label': 'Invite link', onclick: (e: Event) => (e.target as HTMLInputElement).select() }),
        h('button', {
          class: 'btn compact',
          onclick: (e: Event) => {
            void navigator.clipboard?.writeText(link);
            (e.target as HTMLButtonElement).textContent = 'Copied';
          },
        }, 'Copy'),
      ),
      h('div', { style: { margin: '0.7rem auto', width: 'min(340px, 86vw)' } }, nameInput),
      status,
      tableEl,
      controls,
      h('button', { class: 'btn btn-quiet', style: { marginTop: '1rem' }, onclick: () => { client.close(); app.toTitle(); } }, 'Leave the table'),
    ),
  );
  mount(root, screen);

  let started = false;
  let clockIdx = 2; // Standard
  let mapSize: GameSettings['mapSize'] = 'medium';
  let seasons = 36;
  let aiFill = 0;
  let fog = true;

  const sendHello = (seat: number | null): void => {
    const name = nameInput.value.trim() || 'A nameless lord';
    localStorage.setItem('rie-name', name);
    void client.send({ kind: 'hello', name, seat, cid } as NetPayload & { cid: string });
  };

  const isHost = (): boolean => {
    const first = client.entries.find((e) => (e.payload as { kind: string }).kind === 'hello') as { payload: { cid?: string } } | undefined;
    return !first || first.payload.cid === cid;
  };

  const tryStart = (): void => {
    const peers = tableFrom(client.entries).filter((p) => p.seat !== null).sort((a, b) => (a.seat! - b.seat!));
    if (peers.length < 1) return;
    const humanSeats = peers.length;
    const totalSeats = Math.min(6, humanSeats + aiFill);
    const players: PlayerSetup[] = [];
    for (let i = 0; i < totalSeats; i++) {
      players.push(i < humanSeats
        ? { kind: 'human', lordId: 'random', difficulty: 'knight' }
        : { kind: 'ai', lordId: 'random', difficulty: 'knight' });
    }
    const settings: GameSettings = {
      ...defaultSettings(),
      seed: `war-${roomId}`,
      mapSize,
      maxTurns: seasons,
      fogOfWar: fog,
      players,
    };
    void client.send({ kind: 'start', settings, clock: CLOCK_PRESETS[clockIdx] });
  };

  const startGame = (settings: GameSettings, clock: ClockConfig): void => {
    if (started) return;
    started = true;
    const peers = tableFrom(client.entries).filter((p) => p.seat !== null).sort((a, b) => (a.seat! - b.seat!));
    const seatCids = peers.map((p) => p.cid);
    const mySeat = seatCids.indexOf(cid);
    const session: OnlineSession = {
      client,
      mySeat: mySeat >= 0 ? mySeat : 0,
      myCid: cid,
      clock,
      seatCids: [...seatCids, ...Array(Math.max(0, settings.players.length - seatCids.length)).fill(null)],
      cursor: client.entries.length,
    };
    app.startOnlineGame(settings, session);
  };

  const render = (): void => {
    if (started) return;
    const peers = tableFrom(client.entries);
    const seated = peers.filter((p) => p.seat !== null).sort((a, b) => (a.seat! - b.seat!));
    const unseated = peers.filter((p) => p.seat === null);
    const mySeatNow = peers.find((p) => p.cid === cid)?.seat ?? null;

    mount(tableEl,
      h('h3', { class: 'settings-head' }, `At the table (${seated.length})`),
      ...(seated.length === 0 ? [h('p', { class: 'small muted italic' }, 'Nobody seated yet. Take a chair.')] : []),
      ...seated.map((p) => h('div', { class: 'lobby-row' },
        sigilShield(LORDS[(p.seat ?? 0) % LORDS.length].id, 22),
        h('b', {}, p.name),
        h('span', { class: 'small muted' }, `seat ${(p.seat ?? 0) + 1}${p.cid === cid ? ' — you' : ''}`),
      )),
      ...(unseated.length > 0
        ? [h('p', { class: 'small muted' }, `Watching: ${unseated.map((p) => p.name).join(', ')}`)]
        : []),
    );

    const hostControls = isHost() && mySeatNow !== null;
    mount(controls,
      mySeatNow === null
        ? h('button', {
            class: 'btn btn-seal', style: { marginTop: '0.6rem' },
            onclick: () => {
              const taken = new Set(seated.map((p) => p.seat));
              let seat = 0;
              while (taken.has(seat)) seat++;
              sendHello(seat);
            },
          }, 'Take a seat')
        : h('button', { class: 'btn compact', onclick: () => sendHello(null) }, 'Stand up'),
      hostControls
        ? h('div', { class: 'lobby-host' },
            h('h3', { class: 'settings-head' }, 'The terms (host)'),
            labeled('Realm', select(['small', 'medium', 'large'], mapSize, (v) => { mapSize = v as GameSettings['mapSize']; })),
            labeled('Seasons', select(['28', '36', '48', '60'], String(seasons), (v) => { seasons = parseInt(v, 10); })),
            labeled('Turn clock', select(CLOCK_PRESETS.map((c) => c.label), CLOCK_PRESETS[clockIdx].label, (v) => {
              clockIdx = Math.max(0, CLOCK_PRESETS.findIndex((c) => c.label === v));
            })),
            labeled('AI rivals', select(['0', '1', '2', '3'], String(aiFill), (v) => { aiFill = parseInt(v, 10); })),
            labeled('Fog of war', select(['on', 'off'], fog ? 'on' : 'off', (v) => { fog = v === 'on'; })),
            h('button', { class: 'btn btn-seal', style: { marginTop: '0.6rem' }, onclick: tryStart },
              'Begin the war'),
            h('p', { class: 'small muted' }, 'Lords are dealt by fate at the first season — argue about them in person.'),
          )
        : (mySeatNow !== null ? h('p', { class: 'small muted italic', style: { marginTop: '0.6rem' } }, 'The host sets the terms and begins the war.') : null),
    );
  };

  client.onStatus = (s) => {
    status.textContent = s === 'open'
      ? `Connected · relay ${relayUrl().replace(/^wss?:\/\//, '')}`
      : s === 'connecting' ? 'Reaching the relay…' : 'Relay lost — retrying…';
  };
  client.onBacklogReady = () => {
    // did this war already start? (rejoin path)
    const startEntry = client.entries.find((e) => e.payload.kind === 'start');
    if (startEntry && startEntry.payload.kind === 'start') {
      startGame(startEntry.payload.settings, startEntry.payload.clock);
      return;
    }
    sendHello(tableFrom(client.entries).find((p) => p.cid === cid)?.seat ?? null);
    render();
  };
  client.onEntry = (e) => {
    if (e.payload.kind === 'start') {
      startGame(e.payload.settings, e.payload.clock);
      return;
    }
    render();
  };
  client.onPeers = () => render();

  await client.connect();
}

function labeled(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'lobby-field' }, h('span', { class: 'small muted' }, label), control);
}

function select(options: string[], value: string, onChange: (v: string) => void): HTMLElement {
  return h('select', {
    class: 'input compact',
    onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value),
  }, ...options.map((o) => h('option', { value: o, selected: o === value }, o)));
}

// keep LORD_BY_ID referenced for future lord-claim UI without an unused-import error
void LORD_BY_ID;
