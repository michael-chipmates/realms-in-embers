/**
 * The online war lobby: one link, friends click it, lords get picked,
 * the host seals the muster. No accounts: a display name and a seat.
 * Everything past this screen travels encrypted; the relay reads nothing.
 *
 * The seat roster is PINNED inside the encrypted `start` entry, so every
 * client (and every rejoiner, forever) derives the same table from the
 * same bytes: late hellos cannot fork it.
 */
import { LORD_BY_ID } from '../../engine/content/lords';
import { defaultSettings } from '../../engine/state';
import { openLordGallery } from './gallery';
import type { GameSettings, PlayerSetup } from '../../engine/types';
import { h, mount, clear } from '../dom';
import { sigilShield } from '../heraldry';
import {
  AD_FRESH_MS, AD_HEARTBEAT_MS, CLOCK_PRESETS, NetClient, PROTOCOL_VERSION, RULES_VERSION,
  WAYHOUSE_KEY, WAYHOUSE_ROOM, inviteLink, makeRoomKey, openTables, parseInvite, randomRoomId,
  type ClockConfig, type NetEntry,
} from '../net';
import type { App } from '../app';

export const MAX_SEATS = 6;

export interface OnlineSession {
  client: NetClient;
  /** Your seat, or −1: a spectator (watch, never act). */
  mySeat: number;
  myCid: string;
  clock: ClockConfig;
  /** cid per human seat, in seat order, pinned by the start entry. */
  seatCids: (string | null)[];
  /** Next relay seq the game screen will consume. */
  cursor: number;
}

interface LobbyPeer { cid: string; name: string; seat: number | null; lordId: string | null; lastSeq: number; rules: number | null }

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
function tableFrom(entries: NetEntry[]): LobbyPeer[] {
  const peers = new Map<string, LobbyPeer>();
  for (const e of entries) {
    const p = e.payload;
    if (p.kind === 'hello') {
      // a hello without `rules` is a pre-v2 client: mark it, don't guess
      peers.set(p.cid, { cid: p.cid, name: p.name, seat: p.seat, lordId: p.lordId ?? null, lastSeq: e.seq, rules: p.rules ?? null });
    }
  }
  return [...peers.values()];
}

/** Earlier claim wins a contested seat; later claimants are the losers. */
function seatLoser(peers: LobbyPeer[], cid: string): boolean {
  const me = peers.find((p) => p.cid === cid);
  if (!me || me.seat === null) return false;
  return peers.some((p) => p.cid !== cid && p.seat === me.seat && p.lastSeq < me.lastSeq);
}

/** Same rule for banners: the earlier relay seq keeps a contested lord. */
function lordLoser(peers: LobbyPeer[], cid: string): boolean {
  const me = peers.find((p) => p.cid === cid);
  if (!me || me.lordId === null || me.seat === null) return false;
  return peers.some((p) => p.cid !== cid && p.seat !== null && p.lordId === me.lordId && p.lastSeq < me.lastSeq);
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
  const wayEl = h('div', { class: 'lobby-table' });
  const nameInput = h('input', {
    class: 'input', type: 'text', maxlength: '24', placeholder: 'Your name at the table', 'aria-label': 'Your name at the table',
    value: myName(),
  }) as HTMLInputElement;

  const link = inviteLink(roomId, key);
  // the key stays OUT of the address bar (screenshots, history sync); the
  // war survives a reload through session storage instead, and Copy invite
  // reconstructs the full link only on purpose
  sessionStorage.setItem('rie-war', `${roomId}.${key}`);
  const screen = h('div', { class: 'room title-screen' },
    h('div', { class: 'title-center lobby-center' },
      h('p', { class: 'title-over muted italic' }, 'A war among friends'),
      h('h1', { class: 'title-display', style: { fontSize: 'clamp(1.5rem, 4vw, 2.4rem)' } }, 'The Muster Table'),
      h('p', { class: 'small muted', style: { maxWidth: '52ch', margin: '0.4rem auto' } },
        'One link seats everyone. The relay carries only ciphertext. The key never leaves this address bar. No accounts, no tracking, ever.'),
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
      wayEl,
      h('button', {
        class: 'btn btn-quiet', style: { marginTop: '1rem' },
        onclick: async () => {
          // vacate the chair on the log first, or it stays claimed forever
          try {
            await client.send({ kind: 'hello', cid, name: nameInput.value.trim() || 'A nameless lord', seat: null });
          } catch { /* leaving anyway */ }
          closeWayhouse(true);
          client.close();
          sessionStorage.removeItem('rie-war');
          history.replaceState(null, '', location.pathname); // belt and braces
          app.toTitle();
        },
      }, 'Leave the table'),
    ),
  );
  mount(root, screen);

  let started = false;
  let clockIdx = 2; // Standard
  let mapSize: GameSettings['mapSize'] = 'medium';
  let seasons = 36;
  let aiFill = 0;
  let fog = true;

  // ---- the Wayhouse: the room where strangers find each other -----------
  // (docs/design/open-tables.md). A second NetClient on the well-known room
  // with the PUBLISHED key: posting a table there is posting it to the
  // public, and the UI says so in plain words before the host agrees.
  const wayhouse = new NetClient(WAYHOUSE_ROOM, WAYHOUSE_KEY);
  let posted = false;
  let lastAdTaken = -1;
  let heartbeat: number | null = null;
  const seatedNow = (): number => tableFrom(client.list()).filter((p) => p.seat !== null).length;
  const postAd = (gone = false): void => {
    if (!posted && !gone) return;
    lastAdTaken = seatedNow();
    void wayhouse.send({
      kind: 'ad', v: 1,
      name: (nameInput.value.trim() || 'A nameless lord') + '’s table',
      size: mapSize, seats: MAX_SEATS, taken: seatedNow(),
      clockLabel: CLOCK_PRESETS[clockIdx].label, fog, courier: false,
      invite: link, at: Date.now(), roomId, gone: gone || undefined, rules: RULES_VERSION,
    });
  };
  const closeWayhouse = (gone: boolean): void => {
    if (gone && posted) postAd(true);
    posted = false;
    if (heartbeat !== null) window.clearInterval(heartbeat);
    heartbeat = null;
    wayhouse.close();
  };
  const sitDownElsewhere = (invite2: string): void => {
    const parsed = parseInvite(invite2.slice(invite2.indexOf('#')));
    if (!parsed) return;
    closeWayhouse(posted);
    client.close();
    sessionStorage.setItem('rie-war', `${parsed.roomId}.${parsed.key}`);
    void openOnlineLobby(app, parsed);
  };
  const renderWayhouse = (): void => {
    if (started) return;
    const tables = openTables(wayhouse.list(), Date.now(), roomId);
    mount(wayEl,
      h('h3', { class: 'settings-head' }, 'The Wayhouse · open tables'),
      ...(tables.length === 0
        ? [h('p', { class: 'small muted italic' },
            'No tables at this hour. Post yours below and keep your lamp lit, or the AI rivals are always willing. Embers burn brightest on Sunday evenings.')]
        : tables.map((ad) => {
            const mins = Math.max(0, Math.round((Date.now() - ad.at) / 60000));
            const foreign = ad.rules !== undefined && ad.rules !== RULES_VERSION;
            return h('div', { class: 'lobby-row' },
              h('b', {}, ad.name),
              h('span', { class: 'small muted' },
                `${ad.size} realm · ${ad.taken} of ${ad.seats} seated · ${ad.clockLabel.split(/ [·\u2014] /)[0]}${ad.fog ? ' · fog' : ''} · ${mins < 1 ? 'just posted' : `${mins} min ago`}`),
              foreign
                ? h('span', { class: 'small muted italic' }, 'a different edition')
                : h('button', { class: 'btn compact', onclick: () => sitDownElsewhere(ad.invite) }, 'Sit down'),
            );
          })),
    );
  };
  wayhouse.onBacklogReady = renderWayhouse;
  wayhouse.onEntry = (e) => { if (e.payload.kind === 'ad') renderWayhouse(); };
  void wayhouse.connect();

  const sendHello = (seat: number | null, lordId?: string | null): void => {
    const name = nameInput.value.trim() || 'A nameless lord';
    localStorage.setItem('rie-name', name);
    // an unnamed lordId keeps the current pick; standing up clears it
    const current = tableFrom(client.list()).find((p) => p.cid === cid)?.lordId ?? null;
    void client.send({ kind: 'hello', cid, name, seat, lordId: seat === null ? null : (lordId !== undefined ? lordId : current), proto: PROTOCOL_VERSION, rules: RULES_VERSION });
  };

  // a renamed lord re-announces (debounced) so the table sees the new name
  let renameTimer: number | null = null;
  nameInput.addEventListener('input', () => {
    if (started) return;
    const seatNow = tableFrom(client.list()).find((p) => p.cid === cid)?.seat ?? null;
    if (seatNow === null) return;
    if (renameTimer !== null) window.clearTimeout(renameTimer);
    renameTimer = window.setTimeout(() => sendHello(seatNow), 600);
  });

  const isHost = (): boolean => {
    const first = client.list().find((e) => e.payload.kind === 'hello');
    return !first || (first.payload as { cid?: string }).cid === cid;
  };

  const tryStart = (): void => {
    const seated = tableFrom(client.list())
      .filter((p) => p.seat !== null)
      .sort((a, b) => a.seat! - b.seat!)
      .slice(0, MAX_SEATS);
    if (seated.length < 1) return;
    if (seated.length + aiFill < 2) {
      status.textContent = 'A war needs a second claimant. Invite someone, or add an AI rival.';
      return;
    }
    // a mixed-edition table would desync on the first act: refuse politely
    const mismatched = seated.filter((p) => p.rules !== RULES_VERSION);
    if (mismatched.length > 0) {
      status.textContent = `${mismatched.map((p) => p.name).join(', ')} ${mismatched.length === 1 ? 'plays' : 'play'} a different edition of the rules. Everyone must reload to the same version before the war can begin.`;
      return;
    }
    const seatCids = seated.map((p) => p.cid);
    const totalSeats = Math.min(MAX_SEATS, seatCids.length + aiFill);
    const players: PlayerSetup[] = [];
    const claimed = new Set<string>();
    for (let i = 0; i < totalSeats; i++) {
      if (i < seatCids.length) {
        // banner picks ride the hellos; a race the live lobby didn't catch
        // resolves here the same way: the earlier seat keeps the lord
        let lordId = seated[i].lordId ?? 'random';
        if (lordId !== 'random' && claimed.has(lordId)) lordId = 'random';
        claimed.add(lordId);
        players.push({ kind: 'human', lordId, difficulty: 'knight' });
      } else {
        players.push({ kind: 'ai', lordId: 'random', difficulty: 'knight' });
      }
    }
    const settings: GameSettings = {
      ...defaultSettings(),
      seed: `war-${roomId}`,
      mapSize,
      maxTurns: seasons,
      fogOfWar: fog,
      players,
    };
    void client.send({ kind: 'start', settings, clock: CLOCK_PRESETS[clockIdx], seatCids, rules: RULES_VERSION });
  };

  const startGame = (startEntry: NetEntry): void => {
    if (started) return;
    const payload = startEntry.payload;
    if (payload.kind !== 'start') return;
    // an incompatible start must block HERE: replaying a foreign edition's
    // war would silently diverge on the first rules difference
    if (payload.rules !== undefined && payload.rules !== RULES_VERSION) {
      status.textContent = `This war runs rules v${payload.rules}; your edition speaks v${RULES_VERSION}. Reload the page to fetch the current edition, then follow the invite again.`;
      return;
    }
    started = true;
    closeWayhouse(true); // the table is no longer open; withdraw the ad
    const mySeat = payload.seatCids.indexOf(cid); // −1 = spectator, honestly
    const session: OnlineSession = {
      client,
      mySeat,
      myCid: cid,
      clock: payload.clock,
      seatCids: [
        ...payload.seatCids,
        ...Array(Math.max(0, payload.settings.players.length - payload.seatCids.length)).fill(null),
      ],
      cursor: startEntry.seq + 1, // rejoiners replay every act AFTER the start
    };
    app.startOnlineGame(payload.settings, session);
  };

  const render = (): void => {
    if (started) return;
    // a posted ad stays truthful: seats filled or freed re-announce themselves
    if (posted && seatedNow() !== lastAdTaken) postAd();
    const peers = tableFrom(client.list());
    const seated = peers.filter((p) => p.seat !== null).sort((a, b) => (a.seat! - b.seat!));
    const unseated = peers.filter((p) => p.seat === null);
    const mySeatNow = peers.find((p) => p.cid === cid)?.seat ?? null;

    // contested chair and we sat down later: stand up and take the next one
    if (seatLoser(peers, cid)) {
      const taken = new Set(peers.filter((p) => !seatLoser(peers, p.cid)).map((p) => p.seat));
      let seat = 0;
      while (taken.has(seat) && seat < MAX_SEATS) seat++;
      sendHello(seat < MAX_SEATS ? seat : null);
      return; // re-render on the echo
    }
    // contested banner and we picked later: the earlier claim keeps it
    if (lordLoser(peers, cid)) {
      const mine = peers.find((p) => p.cid === cid)!;
      status.textContent = `${LORD_BY_ID[mine.lordId!]?.name ?? 'That lord'} was claimed first. Choose another banner.`;
      sendHello(mine.seat, null);
      return; // re-render on the echo
    }

    mount(tableEl,
      h('h3', { class: 'settings-head' }, `At the table (${seated.length} of ${MAX_SEATS})`),
      ...(seated.length === 0 ? [h('p', { class: 'small muted italic' }, 'Nobody seated yet. Take a seat.')] : []),
      ...seated.map((p) => h('div', { class: 'lobby-row' },
        p.lordId !== null ? sigilShield(p.lordId, 22) : h('span', { class: 'small muted', style: { width: '22px', textAlign: 'center' } }, '?'),
        h('b', {}, p.name),
        h('span', { class: 'small muted' },
          `seat ${(p.seat ?? 0) + 1}${p.cid === cid ? ' (you)' : ''} · ${p.lordId !== null ? LORD_BY_ID[p.lordId]?.name ?? 'a lord' : 'fate decides'}`),
      )),
      ...(unseated.length > 0
        ? [h('p', { class: 'small muted' }, `Watching: ${unseated.map((p) => p.name).join(', ')}`)]
        : []),
    );

    const hostControls = isHost() && mySeatNow !== null;
    const tableFull = seated.length >= MAX_SEATS;
    mount(controls,
      mySeatNow === null
        ? h('button', {
            class: 'btn btn-seal', style: { marginTop: '0.6rem' },
            disabled: tableFull,
            onclick: () => {
              const taken = new Set(seated.map((p) => p.seat));
              let seat = 0;
              while (taken.has(seat)) seat++;
              if (seat < MAX_SEATS) sendHello(seat);
            },
          }, tableFull ? 'The table is full: watch, or wait' : 'Take a seat')
        : h('div', { style: { display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.4rem' } },
            h('button', {
              class: 'btn compact',
              onclick: () => {
                const takenLords = peers.filter((p) => p.cid !== cid && p.seat !== null && p.lordId !== null).map((p) => p.lordId!);
                openLordGallery({
                  title: 'Whose banner do you carry into this war?',
                  initial: peers.find((p) => p.cid === cid)?.lordId ?? null,
                  taken: takenLords,
                  onPick: (lordId) => sendHello(mySeatNow, lordId),
                  onFate: () => sendHello(mySeatNow, null),
                  onCancel: () => undefined,
                });
              },
            }, 'Choose your banner'),
            h('button', { class: 'btn compact btn-quiet', onclick: () => sendHello(null) }, 'Stand up'),
          ),
      hostControls
        ? h('div', { class: 'lobby-host' },
            h('h3', { class: 'settings-head' }, 'The terms (host)'),
            labeled('Realm', select(['small', 'medium', 'large'], mapSize, (v) => { mapSize = v as GameSettings['mapSize']; })),
            labeled('Seasons', select(['28', '36', '48', '60'], String(seasons), (v) => { seasons = parseInt(v, 10); })),
            labeled('Season clock', select(CLOCK_PRESETS.map((c) => c.label), CLOCK_PRESETS[clockIdx].label, (v) => {
              clockIdx = Math.max(0, CLOCK_PRESETS.findIndex((c) => c.label === v));
            })),
            labeled('AI rivals', select(['0', '1', '2', '3'], String(aiFill), (v) => { aiFill = parseInt(v, 10); })),
            labeled('Fog of war', select(['on', 'off'], fog ? 'on' : 'off', (v) => { fog = v === 'on'; })),
            h('label', { class: 'lobby-field', style: { cursor: 'pointer' } },
              h('span', { class: 'small muted' }, 'Post in the Wayhouse'),
              h('input', {
                type: 'checkbox', checked: posted ? 'checked' : undefined,
                onchange: (e: Event) => {
                  posted = (e.target as HTMLInputElement).checked;
                  if (posted) {
                    postAd();
                    if (heartbeat === null) heartbeat = window.setInterval(() => postAd(), AD_HEARTBEAT_MS);
                    status.textContent = 'Posted. Anyone may sit down. A posted table is public. Untick to withdraw it.';
                  } else {
                    postAd(true);
                    if (heartbeat !== null) window.clearInterval(heartbeat);
                    heartbeat = null;
                    status.textContent = 'Withdrawn from the Wayhouse.';
                  }
                },
              }),
            ),
            posted && seatedNow() < 2
              ? h('p', { class: 'small muted italic' }, 'While the lamp burns: you can always call in AI rivals and begin. A posted table never strands its host.')
              : null,
            h('button', { class: 'btn btn-seal', style: { marginTop: '0.6rem' }, onclick: tryStart },
              'Begin the war'),
            h('p', { class: 'small muted' }, 'Unclaimed banners are dealt by fate when the war begins.'),
          )
        : (mySeatNow !== null ? h('p', { class: 'small muted italic', style: { marginTop: '0.6rem' } }, 'The host sets the terms and begins the war.') : null),
    );
  };

  client.onStatus = (s) => {
    // players see a state, not infrastructure: the relay's hostname is
    // nobody's business at the table (Michel, 2026-07-12). A self-hosted
    // override still shows its address, deliberately, so a custom relay
    // is verifiable at a glance.
    const custom = localStorage.getItem('rie-relay');
    status.textContent = s === 'open'
      ? (custom ? `Connected · your relay ${custom.replace(/^wss?:\/\//, '')}` : 'Connected to the open table.')
      : s === 'connecting' ? 'Reaching the relay…' : 'Relay lost, retrying…';
  };
  client.onError = (message) => {
    status.textContent = `The relay declined: ${message}`;
  };
  client.onBacklogReady = () => {
    // did this war already start? (rejoin path)
    const startEntry = client.list().find((e) => e.payload.kind === 'start');
    if (startEntry) {
      startGame(startEntry);
      return;
    }
    sendHello(tableFrom(client.list()).find((p) => p.cid === cid)?.seat ?? null);
    render();
  };
  client.onEntry = (e) => {
    if (e.payload.kind === 'start') {
      startGame(e);
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
