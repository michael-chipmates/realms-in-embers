/**
 * The war room. Map in the middle of the table, chronicle at the right hand,
 * the realm's numbers across the top, and one wax-red button to end the
 * season. Everything the engine knows is inspectable from here.
 */
import { aiTakeTurn } from '../../engine/ai';
import { applyAction, moveTargets, previewBattle } from '../../engine/engine';
import { FERVOR_COST } from '../../engine/combat';
import type { OnlineSession } from './lobby';
import { emberlightIncome, incomeReport } from '../../engine/economy';
import { LORD_BY_ID } from '../../engine/content/lords';
import { armiesIn, armiesOf, heroesOf, seenBy } from '../../engine/helpers';
import type { Action, Army, Effect, GameState, SpellId } from '../../engine/types';
import type { MoveTarget } from '../../engine/actions';
import { SPELLS, type SpellFxFamily } from '../../engine/content/spells';
import type { App } from '../app';
import { audio } from '../audio';
import { h, mount, clear } from '../dom';
import { fmt, lordDisplay, playerColors, playerPatterns, seasonName, signed } from '../format';
import { iconSvg } from '../icons';
import { MapRenderer } from '../mapRenderer';
import { sigilShield } from '../heraldry';
import { saveToSlot } from '../saves';
import { breakdown, tip, hideTip } from '../tooltip';
import { renderSelectionPanel } from '../panels/selection';
import { renderChronicleFeed } from '../panels/chronicleFeed';
import { openCourtOverlay, openDiplomacyOverlay, openLedgerOverlay, openMagicOverlay, openQuestsOverlay, openMenuOverlay } from '../panels/overlays';
import { openCodexOverlay } from '../panels/codex';
import { anyModalOpen, closeAllModals, openModal } from '../modal';
import { openBattleReport } from './battleReport';
import { maybeOpenEventModal } from './eventModal';
import { showHandoff } from './handoff';
import { showGameEnd } from './gameEnd';
import { presentCeremonies, resetCeremonies } from './ceremony';
import { maybeShowOnboarding } from './onboarding';

export interface Selection {
  provinceId: number | null;
  armyId: number | null;
}

export class GameScreen {
  readonly app: App;
  state: GameState;
  renderer!: MapRenderer;
  sel: Selection = { provinceId: null, armyId: null };
  hovered: number | null = null;
  targets: MoveTarget[] = [];
  private el!: HTMLElement;
  private topbar!: HTMLElement;
  private sidePanel!: HTMLElement;
  private chronicleEl!: HTMLElement;
  private alertsEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private disposed = false;
  private aiRunning = false;
  private keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  private mapDirty = true;
  pendingSpell: SpellId | null = null;
  /** The lord's signature is armed and waits for a province on the map. */
  pendingSignature = false;
  /** Mobile: the selection bottom-sheet collapsed to a slim bar. */
  sheetCollapsed = false;
  /** Online war session; null for local/hotseat play. */
  readonly online: OnlineSession | null;
  private clockEl: HTMLElement | null = null;
  private clockTimer: number | null = null;
  /** Seconds left in each human seat's bank (client-side, honor-system). */
  private clockBanks: Record<number, number> = {};
  /** The zero-bank endTurn fired for this turn (don't spam the relay). */
  private clockExpiredSent = false;
  /** Replaying a relay backlog: present its effects quietly (no modal storms). */
  private catchingUp = false;
  private resizeHandler = (): void => {
    if (this.disposed) return;
    this.renderer.resize();
    this.redrawMap();
  };

  constructor(app: App, state: GameState, online: OnlineSession | null = null) {
    this.app = app;
    this.state = state;
    this.online = online;
    if (online) this.bindOnline();
  }

  // -------------------------------------------------------------- online

  private bindOnline(): void {
    const session = this.online!;
    for (const p of this.state.players) {
      if (p.kind === 'human') this.clockBanks[p.id] = session.clock.bank + session.clock.perTurn;
    }
    session.client.onEntry = (entry) => {
      if (this.disposed) return;
      this.consumeNet();
    };
    session.client.onBacklogReady = () => {
      if (this.disposed) return;
      // reconnect: rebuild from the start entry forward
      this.consumeNet();
    };
    session.client.onStatus = (s) => {
      if (this.disposed) return;
      if (s !== 'open') this.showAiBanner('The relay is lost — reconnecting…');
      else if (this.pendingSpell !== null) this.armSpellTargeting(this.pendingSpell);
      else if (!this.aiRunning) this.hideAiBanner();
    };
    session.client.onError = (msg) => {
      if (this.disposed) return;
      this.toast(msg, 'danger');
    };
    // any actions that raced ahead while the lobby handed off
    window.setTimeout(() => { if (!this.disposed) this.consumeNet(); }, 0);
    this.startClock();
  }

  /** Apply every already-decrypted relay action, strictly in seq order.
   * PAUSES (without consuming) while the local AI wheel is between the
   * relayed endTurn and the next human seat — every client walks the same
   * AI turns at its own pace, and acts must wait for it. Gaps in the
   * entry array (blobs still decrypting) also pause; the pump will call
   * us again. */
  consumeNet(): void {
    if (this.disposed) return;
    const session = this.online!;
    for (;;) {
      const entry = session.client.entries[session.cursor];
      if (!entry) break; // not arrived / not decrypted yet
      const payload = entry.payload;
      if (payload.kind !== 'act') { session.cursor++; continue; }
      if (this.state.phase === 'ended') { session.cursor++; continue; }
      if (this.aiRunning || this.current().kind === 'ai') break; // wait for the wheel
      if (payload.seat !== this.state.current) { session.cursor++; continue; } // stale/dishonest
      // replaying history (a join or rejoin mid-war): keep the room quiet —
      // no battle-report stacks, no ceremony parade for old news
      this.catchingUp = session.client.entries.length - 1 - session.cursor > 2;
      session.cursor++;
      const result = applyAction(this.state, payload.action);
      if (result.ok) {
        this.presentEffects(result.effects);
        if (payload.action.t === 'endTurn') this.onTurnAdvanced();
      }
    }
    this.catchingUp = false;
    this.refresh();
    if (this.state.phase === 'ended') {
      this.showEndOnce();
      return;
    }
    // the log left us on an AI seat: let the wheel turn (it re-enters
    // consumeNet when it finishes)
    if (this.current().kind === 'ai' && !this.aiRunning) {
      void this.runAiTurns();
      return;
    }
    // the log left us on OUR season: the realm may be waiting on an answer
    if (session.mySeat >= 0 && this.state.current === session.mySeat && !this.aiRunning) {
      maybeOpenEventModal(this);
    }
  }

  private endShown = false;

  showEndOnce(): void {
    if (this.endShown) return;
    this.endShown = true;
    this.refresh();
    showGameEnd(this);
  }

  private onTurnAdvanced(): void {
    const session = this.online!;
    this.clockExpiredSent = false;
    const cur = this.state.players[this.state.current];
    if (cur.kind === 'human') {
      this.clockBanks[cur.id] = (this.clockBanks[cur.id] ?? session.clock.bank) + session.clock.perTurn;
    }
  }

  private startClock(): void {
    const session = this.online!;
    if (session.clock.perTurn <= 0) return;
    this.clockTimer = window.setInterval(() => {
      if (this.disposed || this.state.phase !== 'playing') return;
      const cur = this.state.players[this.state.current];
      if (cur.kind !== 'human') return;
      this.clockBanks[cur.id] = Math.max(0, (this.clockBanks[cur.id] ?? 0) - 1);
      this.renderClock();
      // only ever enforce on OURSELVES — the blind relay trusts the table.
      // Send once and wait for the echo; no spamming while it travels.
      if (cur.id === session.mySeat && this.clockBanks[cur.id] <= 0 && !this.clockExpiredSent) {
        this.clockExpiredSent = true;
        this.dispatch({ t: 'endTurn' });
      }
    }, 1000);
  }

  private renderClock(): void {
    if (!this.online || this.online.clock.perTurn <= 0 || !this.clockEl) return;
    const cur = this.state.players[this.state.current];
    if (cur.kind !== 'human') { this.clockEl.textContent = ''; return; }
    const s = Math.max(0, Math.round(this.clockBanks[cur.id] ?? 0));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.clockEl.textContent = `⌛ ${mm}:${ss}`;
    this.clockEl.classList.toggle('clock-low', s < 30 && cur.id === this.online.mySeat);
  }

  // -------------------------------------------------------------- mount

  mount(root: HTMLElement): void {
    this.canvas = h('canvas', { class: 'war-map', 'aria-label': 'The map of the Embermark', role: 'application' });
    this.renderer = new MapRenderer(this.canvas);
    this.topbar = h('header', { class: 'topbar' });
    this.sidePanel = h('aside', { class: 'side-panel', 'aria-label': 'Selection details' });
    this.chronicleEl = h('aside', { class: 'chronicle-panel', 'aria-label': 'The war chronicle' });
    this.alertsEl = h('div', { class: 'alerts-row' });
    this.toastsEl = h('div', { class: 'toasts', 'aria-live': 'polite' });

    this.el = h('div', { class: 'room game-screen' },
      this.topbar,
      h('main', { class: 'war-table' },
        this.canvas,
        h('div', { class: 'table-frame', 'aria-hidden': 'true' },
          h('span', { class: 'frame-corner frame-tl' }),
          h('span', { class: 'frame-corner frame-tr' }),
          h('span', { class: 'frame-corner frame-bl' }),
          h('span', { class: 'frame-corner frame-br' }),
        ),
        this.sidePanel,
        this.chronicleEl,
        this.alertsEl,
        this.toastsEl,
        h('div', { class: 'map-zoom', 'aria-label': 'Map zoom' },
          h('button', { class: 'btn btn-quiet map-zoom-btn', 'aria-label': 'Zoom in', onclick: () => this.zoomCenter(1.25) }, '+'),
          h('button', { class: 'btn btn-quiet map-zoom-btn', 'aria-label': 'Zoom out', onclick: () => this.zoomCenter(0.8) }, '−'),
          h('button', { class: 'btn btn-quiet map-zoom-btn', 'aria-label': 'Fit the whole realm', onclick: () => { this.renderer.fit(); this.redrawMap(); } }, '⊡'),
        ),
      ),
    );
    mount(root, this.el);
    // dev hook for driving tests; harmless in production
    (window as unknown as { __game?: GameScreen }).__game = this;

    this.setupMapView();
    this.bindMapEvents();
    document.addEventListener('keydown', this.keyHandler);
    this.refresh();

    // if we loaded into an AI's turn (or a finished game), keep the wheel turning
    if (this.state.phase === 'ended') {
      this.showEndOnce();
    } else if (this.current().kind === 'ai' && !this.online) {
      void this.runAiTurns(); // online: consumeNet drives the wheel once entries land
    } else if (!this.online) {
      maybeShowOnboarding(this);
      maybeOpenEventModal(this);
    } else {
      maybeShowOnboarding(this);
    }
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('resize', this.resizeHandler);
    closeAllModals();
    hideTip();
    resetCeremonies();
    if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
    this.online?.client.close();
    audio.leaveGame();
    const w = window as unknown as { __game?: GameScreen };
    if (w.__game === this) delete w.__game;
  }

  current() {
    return this.state.players[this.state.current];
  }

  humanCount(): number {
    return this.state.players.filter((p) => p.kind === 'human').length;
  }

  /** The player whose eyes we render through (fog, private chronicle). */
  viewerId(): number {
    // online, you are always yourself — even during a rival's turn.
    // Spectators watch through the first living human's eyes.
    if (this.online) {
      if (this.online.mySeat >= 0) return this.online.mySeat;
      const humans = this.state.players.filter((p) => p.kind === 'human' && p.alive);
      return humans[0]?.id ?? 0;
    }
    const cur = this.current();
    if (cur.kind === 'human') return cur.id;
    const humans = this.state.players.filter((p) => p.kind === 'human' && p.alive);
    return humans[0]?.id ?? this.state.current;
  }

  // ---------------------------------------------------------- map setup

  private setupMapView(): void {
    this.renderer.setView({
      mapW: this.state.mapW,
      mapH: this.state.mapH,
      cells: this.state.cells,
      provinces: this.state.provinces,
      playerColors: playerColors(this.state),
      playerPatterns: playerPatterns(this.state),
    });
    requestAnimationFrame(() => {
      this.renderer.resize();
      this.renderer.fit();
      this.redrawMap();
    });
    window.addEventListener('resize', this.resizeHandler);
  }

  redrawMap(): void {
    this.mapDirty = true;
    requestAnimationFrame(() => {
      if (!this.mapDirty || this.disposed) return;
      this.mapDirty = false;
      this.renderNow();
    });
  }

  private renderNow(): void {
    const visible = this.state.settings.fogOfWar ? seenBy(this.state, this.viewerId()) : null;
    const unseen = visible
      ? new Set(this.state.provinces.map((p) => p.id).filter((id) => !visible.has(id)))
      : undefined;
    const selArmy = this.sel.armyId !== null ? this.state.armies[this.sel.armyId] : null;
    this.renderer.render({
      selected: this.sel.provinceId,
      hovered: this.hovered,
      targets: new Set(this.targets.map((t) => t.to)),
      targetsHostile: new Set(this.targets.filter((t) => t.hostile).map((t) => t.to)),
      seaLanes: selArmy
        ? this.targets.filter((t) => t.viaSea).map((t) => ({ from: selArmy.province, to: t.to }))
        : [],
      viewer: this.viewerId(),
      colorblind: this.app.settings.colorblind,
      unseen,
      armies: this.armyMarkers(),
      fx: this.ripples.length > 0 || this.spellFx.length > 0
        ? { ripples: this.ripples, spells: this.spellFx }
        : undefined,
    });
  }

  /** Capture ripple: a short, self-cleaning animation layer over the map. */
  private ripples: { province: number; t: number; color: string }[] = [];
  private rippleLoop = false;

  /** Spell Theater cast fx: same self-cleaning pattern as the ripples.
   * One cast per province at a time — a re-cast replaces, never stacks. */
  private spellFx: { province: number; t: number; family: SpellFxFamily }[] = [];
  private spellFxLoop = false;

  addSpellFx(province: number, family: SpellFxFamily): void {
    if (this.app.settings.reducedMotion) return;
    this.spellFx = this.spellFx.filter((f) => f.province !== province);
    this.spellFx.push({ province, t: 0, family });
    if (this.spellFxLoop) return;
    this.spellFxLoop = true;
    let last = performance.now();
    const step = (now: number): void => {
      if (this.disposed) { this.spellFxLoop = false; return; }
      const dt = (now - last) / 900; // ~0.9s per cast
      last = now;
      for (const f of this.spellFx) f.t += dt;
      this.spellFx = this.spellFx.filter((f) => f.t < 1);
      this.renderNow();
      if (this.spellFx.length > 0) requestAnimationFrame(step);
      else this.spellFxLoop = false;
    };
    requestAnimationFrame(step);
  }

  /** Center the table on a province (rival casts, chronicle jumps). */
  panTo(province: number): void {
    const p = this.state.provinces[province];
    if (!p) return;
    const [sx, sy] = this.renderer.worldToScreen(p.cx, p.cy);
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.offX += rect.width / 2 - sx;
    this.renderer.offY += rect.height / 2 - sy;
    this.redrawMap();
  }

  addCaptureRipple(province: number, owner: number): void {
    if (this.app.settings.reducedMotion) return;
    const color = owner >= 0 ? lordDisplay(this.state, owner).color : 'rgba(200, 190, 160, 0.9)';
    this.ripples.push({ province, t: 0, color });
    if (this.rippleLoop) return;
    this.rippleLoop = true;
    let last = performance.now();
    const step = (now: number): void => {
      if (this.disposed) { this.rippleLoop = false; return; }
      const dt = (now - last) / 700; // ~0.7s per ripple
      last = now;
      for (const r of this.ripples) r.t += dt;
      this.ripples = this.ripples.filter((r) => r.t < 1.35);
      this.renderNow();
      if (this.ripples.length > 0) requestAnimationFrame(step);
      else this.rippleLoop = false;
    };
    requestAnimationFrame(step);
  }

  private armyMarkers() {
    const out: { province: number; owner: number; strength: number; hasHero: boolean; kind?: string }[] = [];
    const byProvince = new Map<number, Army[]>();
    for (const army of Object.values(this.state.armies)) {
      const list = byProvince.get(army.province) ?? [];
      list.push(army);
      byProvince.set(army.province, list);
    }
    for (const [province, armies] of byProvince) {
      for (const army of armies.slice(0, 3)) {
        out.push({
          province,
          owner: army.owner,
          strength: army.units.length,
          hasHero: army.heroIds.length > 0,
          kind: army.kind,
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------- interactions

  private bindMapEvents(): void {
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (moved) {
          this.renderer.offX += dx;
          this.renderer.offY += dy;
          this.redrawMap();
        }
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        const rect = this.canvas.getBoundingClientRect();
        const pid = this.renderer.provinceAt(e.clientX - rect.left, e.clientY - rect.top);
        this.canvas.style.cursor = pid !== null ? 'pointer' : 'grab';
        if (pid !== this.hovered) {
          this.hovered = pid;
          this.redrawMap();
        }
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      if (!moved) {
        const rect = this.canvas.getBoundingClientRect();
        const pid = this.renderer.provinceAt(e.clientX - rect.left, e.clientY - rect.top);
        this.onProvinceClick(pid);
      }
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      this.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });
    // pinch zoom
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchDist > 0) {
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.zoomAt(cx, cy, d / pinchDist);
        }
        pinchDist = d;
      }
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {
      pinchDist = 0;
    });
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const [wx, wy] = this.renderer.screenToWorld(px, py);
    this.renderer.scale = Math.max(6, Math.min(64, this.renderer.scale * factor));
    this.renderer.offX = px - wx * this.renderer.scale;
    this.renderer.offY = py - wy * this.renderer.scale;
    this.redrawMap();
  }

  private zoomCenter(factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  private onProvinceClick(pid: number | null): void {
    if (this.state.phase === 'ended' || this.aiRunning) {
      if (pid !== null) this.select(pid, null);
      return;
    }
    // a working is armed: this click is its target
    if (this.pendingSpell !== null && pid === null) {
      this.clearSpellTargeting(); // tapping open water lets the light fade (touch has no Esc)
      return;
    }
    if (this.pendingSpell !== null && pid !== null) {
      const spell = this.pendingSpell;
      this.clearSpellTargeting();
      if (this.dispatch({ t: 'castSpell', spell, province: pid })) {
        audio.spell();
      }
      return;
    }
    // the signature is armed: this click names its province
    if (this.pendingSignature && pid === null) {
      this.clearSignatureTargeting();
      return;
    }
    if (this.pendingSignature && pid !== null) {
      this.clearSignatureTargeting();
      this.dispatch({ t: 'signature', province: pid });
      return;
    }
    if (pid === null) {
      this.select(null, null);
      return;
    }
    // clicking a highlighted target with an army selected = march order
    const target = this.targets.find((t) => t.to === pid);
    if (target && this.sel.armyId !== null) {
      this.orderMove(this.sel.armyId, target);
      return;
    }
    this.select(pid, null);
  }

  select(provinceId: number | null, armyId: number | null): void {
    this.sel = { provinceId, armyId };
    this.targets = [];
    if (armyId !== null) {
      const army = this.state.armies[armyId];
      if (army && army.owner === this.state.current && this.current().kind === 'human') {
        this.targets = moveTargets(this.state, army);
      }
    }
    audio.click();
    this.ensureSelectionVisible();
    this.renderPanels();
    this.redrawMap();
  }

  isMobile(): boolean {
    return window.innerWidth < 900;
  }

  /** Phones: the bottom sheet must never hide the province being acted on. */
  private ensureSelectionVisible(): void {
    if (!this.isMobile() || this.sel.provinceId === null) return;
    const p = this.state.provinces[this.sel.provinceId];
    const [sx, sy] = this.renderer.worldToScreen(p.cx + 0.5, p.cy + 0.5);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.height === 0) return;
    const sheetH = this.sheetCollapsed ? 64 : Math.min(rect.height * 0.42, 380);
    const visibleH = rect.height - sheetH;
    let dx = 0;
    let dy = 0;
    if (sy > visibleH - 48 || sy < 96) dy = visibleH * 0.45 - sy;
    if (sx < 48 || sx > rect.width - 48) dx = rect.width * 0.5 - sx;
    if (dx !== 0 || dy !== 0) {
      this.renderer.offX += dx;
      this.renderer.offY += dy;
    }
  }

  /** Collapse/expand the mobile selection sheet. */
  toggleSheet(): void {
    this.sheetCollapsed = !this.sheetCollapsed;
    this.ensureSelectionVisible();
    this.renderPanels();
    this.redrawMap();
  }

  renderPanelsPublic(): void {
    this.renderPanels();
  }

  selectArmy(armyId: number): void {
    const army = this.state.armies[armyId];
    if (!army) return;
    this.select(army.province, armyId);
  }

  // ------------------------------------------------------------ orders

  private orderMove(armyId: number, target: MoveTarget): void {
    const army = this.state.armies[armyId];
    if (!army) return;
    if (target.hostile) {
      this.confirmAttack(army, target);
    } else {
      this.dispatch({ t: 'moveArmy', armyId, to: target.to, viaSea: target.viaSea });
      audio.march();
      this.select(target.to, this.state.armies[armyId] ? armyId : null);
    }
  }

  private confirmAttack(army: Army, target: MoveTarget): void {
    const province = this.state.provinces[target.to];
    const defenders = armiesIn(this.state, target.to).filter((a) => a.owner !== army.owner);
    const defOwner = defenders[0]?.owner ?? province.owner;

    // banners that could join a combined assault on this field
    const eligibleSupport = armiesOf(this.state, army.owner)
      .filter((a) => a.id !== army.id && !a.moved && a.units.length > 0)
      .filter((a) => moveTargets(this.state, a).some((mt) => mt.to === target.to && mt.hostile));
    const chosen = new Set<number>();
    let fervor = false;
    const canFervor = army.owner >= 0 && this.state.players[army.owner].emberlight >= FERVOR_COST;

    const modBlock = (title: string, mods: { label: string; mult: number }[], strength: number) =>
      h('div', { class: 'odds-side' },
        h('div', { class: 'odds-side-title' }, title),
        h('div', { class: 'odds-strength' }, `${strength} effective strength`),
        h('div', { class: 'odds-mods' },
          ...mods.map((m) => h('div', { class: 'odds-mod' },
            h('span', {}, m.label),
            h('span', { class: m.mult >= 1 ? 'pos' : 'neg' }, `${m.mult >= 1 ? '+' : ''}${Math.round((m.mult - 1) * 100)}%`),
          )),
          mods.length === 0 ? h('div', { class: 'odds-mod muted' }, 'No modifiers') : null,
        ),
      );

    const content = h('div', { class: 'odds-body' });
    const render = (): void => {
      const preview = previewBattle(this.state, army.id, target.to, target.viaSea, 240, [...chosen], fervor);
      if (!preview) return;
      const pct = Math.round(preview.winChance * 100);
      mount(content,
        h('div', { class: 'odds-meter-row' },
          h('div', { class: 'odds-label' }, `${pct}% to carry the field`),
          h('div', { class: 'odds-meter', role: 'img', 'aria-label': `Victory chance ${pct} percent` },
            h('div', { class: 'odds-fill', style: { width: `${pct}%` } }),
          ),
          h('div', { class: 'small muted' },
            `Expected losses — yours: ${Math.round(preview.aExpectedLoss * 100)}%, theirs: ${Math.round(preview.dExpectedLoss * 100)}%`),
        ),
        eligibleSupport.length > 0
          ? h('div', { class: 'odds-support' },
              h('div', { class: 'odds-side-title' }, 'Sound the horns — banners in reach'),
              ...eligibleSupport.map((s) => {
                const label = `${s.units.length} ${s.units.length === 1 ? 'company' : 'companies'} in ${this.state.provinces[s.province].name}`;
                const cb = h('input', {
                  type: 'checkbox', id: `support-${s.id}`,
                  onchange: (e: Event) => {
                    if ((e.target as HTMLInputElement).checked) chosen.add(s.id);
                    else chosen.delete(s.id);
                    render();
                  },
                }) as HTMLInputElement;
                cb.checked = chosen.has(s.id);
                return h('label', { class: 'odds-support-row', for: `support-${s.id}` }, cb, h('span', {}, label));
              }),
              h('p', { class: 'small muted', style: { margin: '0.2rem 0 0' } },
                'Supporting banners fight beside you and commit their season, win or lose.'),
            )
          : null,
        canFervor
          ? h('div', { class: 'odds-support' },
              (() => {
                const cb = h('input', {
                  type: 'checkbox', id: 'fervor-box',
                  onchange: (e: Event) => { fervor = (e.target as HTMLInputElement).checked; render(); },
                }) as HTMLInputElement;
                cb.checked = fervor;
                return h('label', { class: 'odds-support-row', for: 'fervor-box' }, cb,
                  h('span', {}, `Burn ${FERVOR_COST} Emberlight for fervor — your host fights +12% stronger, this battle only.`));
              })(),
            )
          : null,
        h('div', { class: 'odds-sides' },
          modBlock(chosen.size > 0 ? `Your combined host (${chosen.size + 1} banners)` : 'Your host', preview.aMods, preview.aStrength),
          modBlock(defOwner >= 0 ? `${lordDisplay(this.state, defOwner).name}'s defense` : 'The defenders', preview.dMods, preview.dStrength),
        ),
        preview.notes.length > 0
          ? h('div', { class: 'odds-notes' }, ...preview.notes.map((n) => h('div', { class: 'small' }, `※ ${n}`)))
          : null,
        h('div', { class: 'odds-actions' },
          h('button', {
            class: 'btn btn-seal',
            onclick: () => {
              modal.close();
              this.dispatch({
                t: 'moveArmy', armyId: army.id, to: target.to, viaSea: target.viaSea,
                ...(chosen.size > 0 ? { support: [...chosen] } : {}),
                ...(fervor ? { fervor: true } : {}),
              });
              audio.clash();
              this.select(target.to, null);
            },
          }, h('span', { html: iconSvg('swords', 16) }), chosen.size > 0 ? 'Give battle — together' : 'Give battle'),
          h('button', { class: 'btn', onclick: () => modal.close() }, 'Hold'),
        ),
      );
    };
    render();
    const modal = openModal(`The battle for ${province.name}`, content, { wide: true });
  }

  // ----------------------------------------------------------- dispatch

  dispatch(action: Action): boolean {
    // online: your actions travel to the relay and apply when they echo
    // back — one total order for every table, reconnection for free.
    // NOTHING applies locally out of turn: not hotkeys, not armed spells,
    // not spectators. The relay log is the only pen.
    if (this.online) {
      if (this.online.mySeat < 0) {
        this.toast('You are watching this war, not writing it.', 'info');
        return false;
      }
      if (this.state.phase !== 'playing' || this.state.current !== this.online.mySeat) {
        this.toast('Not your season.', 'info');
        return false;
      }
      void this.online.client.send({ kind: 'act', seat: this.online.mySeat, action });
      return true;
    }
    const result = applyAction(this.state, action);
    if (!result.ok) {
      this.toast(result.error ?? 'That cannot be done.', 'danger');
      return false;
    }
    this.presentEffects(result.effects);
    this.refresh();
    return true;
  }

  // ------------------------------------------------------------- turns

  async endTurn(): Promise<void> {
    if (this.aiRunning || this.state.phase === 'ended') return;
    if (!this.dispatch({ t: 'endTurn' })) return;
    audio.horn();
    // online, the echoed endTurn drives the AI wheel via consumeNet
    if (!this.online) await this.runAiTurns();
  }

  private async runAiTurns(): Promise<void> {
    this.aiRunning = true;
    this.refresh();
    while (!this.disposed && this.state.phase === 'playing' && this.current().kind === 'ai') {
      const lord = LORD_BY_ID[this.current().lordId];
      this.showAiBanner(`${lord.name} ${lord.epithet} considers the map…`, lord.id);
      await this.pause(this.app.settings.reducedMotion ? 40 : 260);
      const effects = aiTakeTurn(this.state);
      this.presentEffects(effects);
      this.refresh();
      await this.pause(this.app.settings.reducedMotion ? 30 : 180);
    }
    this.hideAiBanner();
    this.aiRunning = false;
    if (this.disposed) return; // the player left mid-wheel

    if (this.state.phase === 'ended') {
      this.showEndOnce();
      return;
    }
    // autosave at the start of every human turn — local chronicles only;
    // an online war lives in the relay log, not the local shelf
    if (!this.online) saveToSlot(this.state, 'auto');
    if (!this.online && this.humanCount() > 1) {
      await showHandoff(this); // hotseat only: online tables each see their own board
    }
    this.refresh();
    if (!this.online || this.state.current === this.online.mySeat) maybeOpenEventModal(this);
    if (this.online) {
      // the human seated after an AI block never crosses a relayed endTurn:
      // top up their clock here, then drain anything that queued meanwhile
      this.onTurnAdvanced();
      this.consumeNet();
    }
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private aiBanner: HTMLElement | null = null;

  private showAiBanner(text: string, lordId?: string): void {
    if (!this.aiBanner) {
      this.aiBanner = h('div', { class: 'ai-banner' });
      this.el.appendChild(this.aiBanner);
    }
    clear(this.aiBanner);
    if (lordId) this.aiBanner.appendChild(sigilShield(lordId, 22));
    this.aiBanner.appendChild(h('span', {}, text));
    this.aiBanner.style.display = 'flex';
  }

  private hideAiBanner(): void {
    if (this.aiBanner) this.aiBanner.style.display = 'none';
  }

  // ------------------------------------------------------------ effects

  presentEffects(effects: Effect[]): void {
    const viewer = this.viewerId();
    for (const effect of effects) {
      switch (effect.e) {
        case 'battle': {
          const humanInvolved =
            this.state.players[effect.report.attacker.player]?.kind === 'human' ||
            this.state.players[effect.report.defender.player]?.kind === 'human';
          if (humanInvolved && !this.catchingUp) {
            openBattleReport(this, effect.report);
          } else {
            const atk = lordDisplay(this.state, effect.report.attacker.player);
            const def = lordDisplay(this.state, effect.report.defender.player);
            const report = effect.report;
            this.toast(
              `Battle at ${report.provinceName}: ${atk.name} against ${def.name} — ${report.winner === 'attacker' ? atk.name : def.name} holds the field.`,
              'war',
              () => openBattleReport(this, report),
            );
          }
          break;
        }
        case 'heroDied': {
          if (effect.owner === viewer && !this.catchingUp) audio.dirge();
          break;
        }
        case 'captured': {
          if ((effect.by === viewer || effect.from === viewer) && !this.catchingUp) audio.march();
          this.addCaptureRipple(effect.province, effect.by);
          this.redrawMap();
          break;
        }
        case 'riteComplete': {
          if (effect.by === viewer && !this.catchingUp) audio.spell(SPELLS[effect.spell].fxFamily);
          break;
        }
        case 'signature': {
          if (this.catchingUp) break;
          const caster = this.state.players[effect.by];
          const lord = LORD_BY_ID[caster.lordId];
          const family = lord.signature.fxFamily;
          if (effect.by === viewer) audio.spell(family);
          // the theater: realm-wide signatures wash over the caster's land,
          // targeted ones land on their mark — visible ground only
          const visible = (p: number): boolean =>
            !this.state.settings.fogOfWar || seenBy(this.state, viewer).has(p);
          const stages: number[] = effect.province !== null
            ? [effect.province]
            : this.state.provinces.filter((p) => p.owner === effect.by).map((p) => p.id).slice(0, 8);
          stages.filter(visible).forEach((p, i) => {
            window.setTimeout(() => { if (!this.disposed) this.addSpellFx(p, family); }, i * 70);
          });
          if (effect.by !== viewer) {
            const where = effect.province !== null ? ` — ${this.state.provinces[effect.province].name}` : '';
            const target = effect.province;
            this.toast(`${lord.name}: ${lord.signature.name}${where}!`, 'war',
              target !== null ? () => this.panTo(target) : undefined);
          }
          break;
        }
        case 'spellCast': {
          if (this.catchingUp) break;
          const def = SPELLS[effect.spell];
          if (effect.by === viewer) audio.spell(def.fxFamily);
          // the cast moment on the map — only on ground the viewer can see,
          // and never anything the chronicle hasn't already told them
          if (effect.province !== null) {
            const visible = !this.state.settings.fogOfWar || seenBy(this.state, viewer).has(effect.province);
            if (visible) {
              this.addSpellFx(effect.province, def.fxFamily);
              if (effect.by !== viewer && def.kind === 'realm') {
                const caster = lordDisplay(this.state, effect.by);
                const where = this.state.provinces[effect.province];
                const target = effect.province;
                this.toast(`${caster.name} weaves ${def.name} over ${where.name}.`, 'info', () => this.panTo(target));
              }
            }
          }
          break;
        }
        case 'eliminated': {
          if (!this.catchingUp) audio.bell();
          break;
        }
        case 'roundEnd': {
          if (!this.online) saveToSlot(this.state, 'auto');
          break;
        }
        default:
          break;
      }
    }
    if (!this.catchingUp) presentCeremonies(this, effects);
    this.renderChronicle();
  }

  toast(text: string, kind: 'info' | 'war' | 'danger' | 'gold' = 'info', onClick?: () => void): void {
    const el = onClick
      ? h('button', { class: `toast toast-${kind} toast-click`, onclick: () => { el.remove(); onClick(); } }, text, h('span', { class: 'small muted', style: { display: 'block' } }, 'tap for the full report'))
      : h('div', { class: `toast toast-${kind}` }, text);
    this.toastsEl.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('toast-out');
      window.setTimeout(() => el.remove(), 400);
    }, onClick ? 6500 : 4200);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild?.remove();
  }

  // ------------------------------------------------------- spell aiming

  armSpellTargeting(spell: SpellId): void {
    this.pendingSpell = spell;
    const def = SPELLS[spell];
    this.showAiBanner(`Choose a province for ${def.name} — Esc, or a tap on open water, lets the light fade.`);
  }

  private clearSpellTargeting(): void {
    this.pendingSpell = null;
    this.hideAiBanner();
  }

  // -------------------------------------------------- the lord's signature

  /** The seal modal: the ability card, and the way to use it. */
  openSignatureModal(): void {
    const state = this.state;
    const viewer = state.players[this.viewerId()];
    const lord = LORD_BY_ID[viewer.lordId];
    const sig = lord.signature;
    const cd = viewer.signatureCooldownLeft ?? 0;
    const canAct = this.current().kind === 'human' && state.current === this.viewerId()
      && state.phase === 'playing' && (this.online === null || state.current === this.online.mySeat);
    const ready = canAct && cd === 0;

    const body = h('div', { class: 'signature-body' },
      h('div', { class: 'signature-head' },
        sigilShield(viewer.lordId, 40),
        h('div', {},
          h('div', { class: 'side-card-title' }, sig.name),
          h('div', { class: 'small muted' }, `${lord.name}'s signature · returns ${sig.cooldown} seasons after use`),
        ),
      ),
      h('p', { class: 'codex-p' }, sig.desc),
      h('p', { class: 'small italic muted' }, sig.flavor),
      cd > 0 ? h('p', { class: 'small' }, `It gathers strength for ${cd} more ${cd === 1 ? 'season' : 'seasons'}.`) : null,
    );

    const modal = openModal('The Signature', body, {});
    if (!ready) return;

    if (sig.target === 'none') {
      body.appendChild(h('button', {
        class: 'btn btn-seal', style: { marginTop: '0.6rem' },
        onclick: () => {
          modal.close();
          this.dispatch({ t: 'signature' });
        },
      }, `${sig.name} — now`));
    } else if (sig.target === 'rival') {
      body.appendChild(h('p', { class: 'small muted', style: { marginTop: '0.5rem' } }, 'Against whom?'));
      for (const rival of state.players.filter((p) => p.alive && p.id !== viewer.id)) {
        const rl = LORD_BY_ID[rival.lordId];
        body.appendChild(h('button', {
          class: 'btn', style: { marginTop: '0.3rem', width: '100%', justifyContent: 'flex-start' },
          onclick: () => {
            modal.close();
            this.dispatch({ t: 'signature', targetPlayer: rival.id });
          },
        }, sigilShield(rival.lordId, 22), ` ${rl.name}, ${rl.epithet}`));
      }
    } else {
      body.appendChild(h('button', {
        class: 'btn btn-seal', style: { marginTop: '0.6rem' },
        onclick: () => {
          modal.close();
          this.pendingSignature = true;
          this.showAiBanner(`Choose a rival province bordering your realm for ${sig.name} — Esc lets it rest.`);
        },
      }, `${sig.name} — choose the province`));
    }
  }

  private clearSignatureTargeting(): void {
    this.pendingSignature = false;
    this.hideAiBanner();
  }

  // ------------------------------------------------------------ renders

  refresh(): void {
    if (this.disposed) return;
    this.renderTopbar();
    this.renderPanels();
    this.renderChronicle();
    this.renderAlerts();
    this.redrawMap();
  }

  private renderTopbar(): void {
    const state = this.state;
    const viewer = state.players[this.viewerId()];
    const lord = LORD_BY_ID[viewer.lordId];
    const report = incomeReport(state, viewer.id);

    const goldEl = h('div', { class: 'stat' }, h('span', { html: iconSvg('gold', 16) }), h('b', {}, fmt(viewer.gold)), h('span', { class: `small ${report.net >= 0 ? 'pos' : 'neg'}` }, `${signed(report.net)}`));
    tip(goldEl, () => breakdown('Gold, each season', report.lines, `Net ${signed(report.net)} per season`));

    const emberEl = h('div', { class: 'stat' }, h('span', { html: iconSvg('ember', 16), style: { color: 'var(--ember-bright)' } }), h('b', {}, fmt(viewer.emberlight)), h('span', { class: 'small pos' }, `+${report.emberlight}`));
    tip(emberEl, () => {
      const inc = emberlightIncome(state, viewer.id);
      return breakdown('Emberlight, each season', inc.lines, `+${inc.total} per season`);
    });

    const seasonEl = h('div', { class: 'stat' }, h('span', { html: iconSvg('hourglass', 16) }), h('b', {}, `Season ${state.turn}`), h('span', { class: 'small muted' }, seasonName(state.turn)));
    tip(seasonEl, () => `The Chronicle closes after season ${state.victory.maxTurns} — the realm is then judged as it stands.`);

    const heroesReady = heroesOf(state, viewer.id).filter((hh) => hh.status === 'ready' && hh.levelChoices.length > 0).length;

    mount(this.topbar,
      h('button', { class: 'btn btn-quiet', 'aria-label': 'Menu', html: iconSvg('gear', 18), onclick: () => openMenuOverlay(this) }),
      h('div', { class: 'topbar-lord', style: { borderColor: lord.color } },
        sigilShield(viewer.lordId, 28),
        h('div', {},
          h('div', { class: 'topbar-lord-name' }, lord.name),
          h('div', { class: 'small muted' }, lord.epithet),
        ),
      ),
      h('div', { class: 'topbar-stats' }, goldEl, emberEl, seasonEl),
      h('div', { class: 'topbar-actions' },
        this.iconAction('hero', 'Court & heroes', () => openCourtOverlay(this), heroesReady > 0 ? String(heroesReady) : undefined),
        this.iconAction('ember', 'Magic & rites', () => openMagicOverlay(this)),
        this.iconAction('quest', 'Quests & the Saga', () => openQuestsOverlay(this)),
        this.iconAction('handshake', 'The other lords', () => openDiplomacyOverlay(this)),
        this.iconAction('book', 'Ledger & victory', () => openLedgerOverlay(this)),
        this.iconAction('codex', 'The Codex — every rule of the realm', () => openCodexOverlay(this)),
        (() => {
          const cd = viewer.signatureCooldownLeft ?? 0;
          const btn = h('button', {
            class: `btn btn-quiet topbar-icon signature-btn ${cd === 0 ? 'signature-ready' : ''}`,
            'aria-label': `${lord.signature.name} — your signature`,
            onclick: () => this.openSignatureModal(),
          }, sigilShield(viewer.lordId, 20));
          if (cd > 0) btn.appendChild(h('span', { class: 'badge badge-quiet' }, String(cd)));
          tip(btn, () => h('div', { class: 'tip-plain' },
            h('b', {}, `${lord.signature.name} — your signature`),
            h('p', { class: 'small' }, lord.signature.desc),
            h('p', { class: 'small muted' }, cd === 0 ? 'Ready.' : `Returns in ${cd} ${cd === 1 ? 'season' : 'seasons'}.`),
          ));
          return btn;
        })(),
      ),
      this.online && this.online.clock.perTurn > 0
        ? (this.clockEl = h('div', { class: 'stat turn-clock', 'aria-label': 'Season clock' }))
        : null,
      h('button', {
        class: 'btn btn-seal end-turn',
        disabled: this.aiRunning || this.state.phase === 'ended' || this.current().kind !== 'human'
          || (this.online !== null && this.state.current !== this.online.mySeat),
        onclick: () => void this.endTurn(),
      }, this.aiRunning
        ? 'The rivals move…'
        : this.online && this.state.current !== this.online.mySeat && this.state.phase === 'playing'
          ? `${LORD_BY_ID[this.current().lordId].name.split(' ')[0]} moves…`
          : 'End the Season'),
    );
    this.renderClock();
  }

  private iconAction(icon: string, label: string, onClick: () => void, badge?: string): HTMLElement {
    const btn = h('button', { class: 'btn btn-quiet topbar-icon', 'aria-label': label, onclick: onClick, html: iconSvg(icon, 20) });
    if (badge) btn.appendChild(h('span', { class: 'badge' }, badge));
    tip(btn, label);
    return btn;
  }

  private renderPanels(): void {
    renderSelectionPanel(this, this.sidePanel);
  }

  private renderChronicle(): void {
    renderChronicleFeed(this, this.chronicleEl);
  }

  private renderAlerts(): void {
    const state = this.state;
    const viewer = state.players[this.viewerId()];
    if (this.current().kind !== 'human' || state.phase === 'ended') {
      clear(this.alertsEl);
      return;
    }
    const alerts: { icon: string; text: string; onClick: () => void }[] = [];
    for (const proposal of state.proposals.filter((p) => p.to === viewer.id)) {
      alerts.push({
        icon: 'handshake',
        text: `${lordDisplay(state, proposal.from).name} sends an envoy`,
        onClick: () => openDiplomacyOverlay(this, proposal.from),
      });
    }
    for (const ev of state.pendingEvents.filter((e) => e.player === viewer.id)) {
      void ev;
      alerts.push({ icon: 'danger', text: 'A matter awaits your judgment', onClick: () => maybeOpenEventModal(this) });
    }
    for (const hero of heroesOf(state, viewer.id)) {
      if (hero.levelChoices.length > 0) {
        alerts.push({ icon: 'hero', text: `${hero.name} awaits your counsel`, onClick: () => openCourtOverlay(this, hero.id) });
      }
    }
    const idleArmies = Object.values(state.armies).filter((a) => a.owner === viewer.id && !a.moved && moveTargets(state, a).length > 0);
    if (idleArmies.length > 0) {
      alerts.push({
        icon: 'flag',
        text: `${idleArmies.length} ${idleArmies.length === 1 ? 'army awaits' : 'armies await'} marching orders`,
        onClick: () => this.selectArmy(idleArmies[0].id),
      });
    }
    mount(this.alertsEl,
      ...alerts.slice(0, 4).map((a) =>
        h('button', { class: 'alert-chip', onclick: a.onClick },
          h('span', { html: iconSvg(a.icon, 14) }), a.text),
      ),
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (this.disposed || this.state.phase === 'ended') return;
    if (anyModalOpen()) return;
    // full-screen moments own the keyboard too: the hotseat blackout must
    // not leak "end turn" or open another player's court behind the curtain
    if (document.querySelector('.handoff-screen, .ceremony-overlay')) return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    switch (e.key.toLowerCase()) {
      case 'e':
        void this.endTurn();
        break;
      case 'h':
        openCourtOverlay(this);
        break;
      case 'm':
        openMagicOverlay(this);
        break;
      case 'q':
        openQuestsOverlay(this);
        break;
      case 'd':
        openDiplomacyOverlay(this);
        break;
      case 'l':
        openLedgerOverlay(this);
        break;
      case 'c':
      case '?':
        openCodexOverlay(this);
        break;
      case 'escape':
        if (this.pendingSpell !== null) {
          this.clearSpellTargeting();
        } else if (this.pendingSignature) {
          this.clearSignatureTargeting();
        } else {
          this.select(null, null);
        }
        break;
      case 'arrowleft':
      case 'arrowright':
      case 'arrowup':
      case 'arrowdown': {
        e.preventDefault();
        this.cycleProvince(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
        break;
      }
      case 'enter':
      case ' ': {
        if (this.sel.provinceId !== null && this.sel.armyId === null) {
          const own = armiesIn(this.state, this.sel.provinceId).filter((a) => a.owner === this.viewerId());
          if (own.length > 0) this.selectArmy(own[0].id);
        }
        break;
      }
      default:
        break;
    }
  }

  private cycleProvince(dir: number): void {
    const ids = this.state.provinces.map((p) => p.id);
    const cur = this.sel.provinceId ?? ids[0];
    const idx = ids.indexOf(cur);
    const next = ids[(idx + dir + ids.length) % ids.length];
    this.select(next, null);
    // keep it in view
    const p = this.state.provinces[next];
    const [sx, sy] = this.renderer.worldToScreen(p.cx, p.cy);
    const rect = this.canvas.getBoundingClientRect();
    if (sx < 40 || sx > rect.width - 40 || sy < 40 || sy > rect.height - 40) {
      this.renderer.offX += rect.width / 2 - sx;
      this.renderer.offY += rect.height / 2 - sy;
      this.redrawMap();
    }
  }
}
