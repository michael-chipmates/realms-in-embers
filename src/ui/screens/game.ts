/**
 * The war room. Map in the middle of the table, chronicle at the right hand,
 * the realm's numbers across the top, and one wax-red button to end the
 * season. Everything the engine knows is inspectable from here.
 */
import { aiTakeTurn } from '../../engine/ai';
import { applyAction, moveTargets, previewBattle } from '../../engine/engine';
import { emberlightIncome, incomeReport } from '../../engine/economy';
import { LORD_BY_ID } from '../../engine/content/lords';
import { armiesIn, heroesOf } from '../../engine/helpers';
import type { Action, Army, Effect, GameState, SpellId } from '../../engine/types';
import type { MoveTarget } from '../../engine/actions';
import { SPELLS } from '../../engine/content/spells';
import type { App } from '../app';
import { audio } from '../audio';
import { h, mount, clear } from '../dom';
import { fmt, lordDisplay, playerColors, playerPatterns, seasonName, signed } from '../format';
import { iconSvg } from '../icons';
import { MapRenderer } from '../mapRenderer';
import { saveToSlot } from '../saves';
import { breakdown, tip, hideTip } from '../tooltip';
import { renderSelectionPanel } from '../panels/selection';
import { renderChronicleFeed } from '../panels/chronicleFeed';
import { openCourtOverlay, openDiplomacyOverlay, openLedgerOverlay, openMagicOverlay, openQuestsOverlay, openMenuOverlay } from '../panels/overlays';
import { anyModalOpen, openModal } from '../modal';
import { openBattleReport } from './battleReport';
import { maybeOpenEventModal } from './eventModal';
import { showHandoff } from './handoff';
import { showGameEnd } from './gameEnd';
import { presentCeremonies } from './ceremony';
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

  constructor(app: App, state: GameState) {
    this.app = app;
    this.state = state;
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
        this.sidePanel,
        this.chronicleEl,
        this.alertsEl,
        this.toastsEl,
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
      showGameEnd(this);
    } else if (this.current().kind === 'ai') {
      void this.runAiTurns();
    } else {
      maybeShowOnboarding(this);
      maybeOpenEventModal(this);
    }
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('keydown', this.keyHandler);
    hideTip();
    audio.leaveGame();
  }

  current() {
    return this.state.players[this.state.current];
  }

  humanCount(): number {
    return this.state.players.filter((p) => p.kind === 'human').length;
  }

  /** The player whose eyes we render through (fog, private chronicle). */
  viewerId(): number {
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
    window.addEventListener('resize', () => {
      if (this.disposed) return;
      this.renderer.resize();
      this.redrawMap();
    });
  }

  redrawMap(): void {
    this.mapDirty = true;
    requestAnimationFrame(() => {
      if (!this.mapDirty || this.disposed) return;
      this.mapDirty = false;
      const viewer = this.state.players[this.viewerId()];
      const unseen = this.state.settings.fogOfWar
        ? new Set(this.state.provinces.map((p) => p.id).filter((id) => !viewer.seen.includes(id)))
        : undefined;
      this.renderer.render({
        selected: this.sel.provinceId,
        hovered: this.hovered,
        targets: new Set(this.targets.map((t) => t.to)),
        colorblind: this.app.settings.colorblind,
        unseen,
        armies: this.armyMarkers(),
      });
    });
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

  private onProvinceClick(pid: number | null): void {
    if (this.state.phase === 'ended' || this.aiRunning) {
      if (pid !== null) this.select(pid, null);
      return;
    }
    // a working is armed: this click is its target
    if (this.pendingSpell !== null && pid !== null) {
      const spell = this.pendingSpell;
      this.clearSpellTargeting();
      if (this.dispatch({ t: 'castSpell', spell, province: pid })) {
        audio.spell();
      }
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
    this.renderPanels();
    this.redrawMap();
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
    const preview = previewBattle(this.state, army.id, target.to, target.viaSea);
    if (!preview) return;
    const province = this.state.provinces[target.to];
    const defenders = armiesIn(this.state, target.to).filter((a) => a.owner !== army.owner);
    const defOwner = defenders[0]?.owner ?? province.owner;

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

    const pct = Math.round(preview.winChance * 100);
    const content = h('div', { class: 'odds-body' },
      h('div', { class: 'odds-meter-row' },
        h('div', { class: 'odds-label' }, `${pct}% to carry the field`),
        h('div', { class: 'odds-meter', role: 'img', 'aria-label': `Victory chance ${pct} percent` },
          h('div', { class: 'odds-fill', style: { width: `${pct}%` } }),
        ),
        h('div', { class: 'small muted' },
          `Expected losses — yours: ${Math.round(preview.aExpectedLoss * 100)}%, theirs: ${Math.round(preview.dExpectedLoss * 100)}%`),
      ),
      h('div', { class: 'odds-sides' },
        modBlock('Your host', preview.aMods, preview.aStrength),
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
            this.dispatch({ t: 'moveArmy', armyId: army.id, to: target.to, viaSea: target.viaSea });
            audio.clash();
            this.select(target.to, null);
          },
        }, h('span', { html: iconSvg('swords', 16) }), 'Give battle'),
        h('button', { class: 'btn', onclick: () => modal.close() }, 'Hold'),
      ),
    );
    const modal = openModal(`The battle for ${province.name}`, content, { wide: true });
  }

  // ----------------------------------------------------------- dispatch

  dispatch(action: Action): boolean {
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
    const before = this.state.current;
    if (!this.dispatch({ t: 'endTurn' })) return;
    void before;
    await this.runAiTurns();
  }

  private async runAiTurns(): Promise<void> {
    this.aiRunning = true;
    this.refresh();
    while (!this.disposed && this.state.phase === 'playing' && this.current().kind === 'ai') {
      const lord = LORD_BY_ID[this.current().lordId];
      this.showAiBanner(`${lord.name} ${lord.epithet} considers the map…`);
      await this.pause(this.app.settings.reducedMotion ? 40 : 260);
      const effects = aiTakeTurn(this.state);
      this.presentEffects(effects);
      this.refresh();
      await this.pause(this.app.settings.reducedMotion ? 30 : 180);
    }
    this.hideAiBanner();
    this.aiRunning = false;

    if (this.state.phase === 'ended') {
      this.refresh();
      showGameEnd(this);
      return;
    }
    // autosave at the start of every human turn
    saveToSlot(this.state, 'auto');
    if (this.humanCount() > 1) {
      await showHandoff(this);
    }
    this.refresh();
    maybeOpenEventModal(this);
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private aiBanner: HTMLElement | null = null;

  private showAiBanner(text: string): void {
    if (!this.aiBanner) {
      this.aiBanner = h('div', { class: 'ai-banner' });
      this.el.appendChild(this.aiBanner);
    }
    this.aiBanner.textContent = text;
    this.aiBanner.style.display = 'block';
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
          if (humanInvolved) {
            openBattleReport(this, effect.report);
          } else {
            const atk = lordDisplay(this.state, effect.report.attacker.player);
            const def = lordDisplay(this.state, effect.report.defender.player);
            this.toast(`Battle at ${effect.report.provinceName}: ${atk.name} against ${def.name} — ${effect.report.winner === 'attacker' ? atk.name : def.name} holds the field.`, 'war');
          }
          break;
        }
        case 'heroDied': {
          if (effect.owner === viewer) audio.dirge();
          break;
        }
        case 'captured': {
          if (effect.by === viewer || effect.from === viewer) audio.march();
          this.redrawMap();
          break;
        }
        case 'riteComplete': {
          if (effect.by === viewer) audio.spell();
          break;
        }
        case 'spellCast': {
          if (effect.by === viewer) audio.spell();
          break;
        }
        case 'eliminated': {
          audio.bell();
          break;
        }
        case 'roundEnd': {
          saveToSlot(this.state, 'auto');
          break;
        }
        default:
          break;
      }
    }
    presentCeremonies(this, effects);
    this.renderChronicle();
  }

  toast(text: string, kind: 'info' | 'war' | 'danger' | 'gold' = 'info'): void {
    const el = h('div', { class: `toast toast-${kind}` }, text);
    this.toastsEl.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('toast-out');
      window.setTimeout(() => el.remove(), 400);
    }, 4200);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild?.remove();
  }

  // ------------------------------------------------------- spell aiming

  armSpellTargeting(spell: SpellId): void {
    this.pendingSpell = spell;
    const def = SPELLS[spell];
    this.showAiBanner(`Choose a province for ${def.name} — Esc to let the light fade.`);
  }

  private clearSpellTargeting(): void {
    this.pendingSpell = null;
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
        h('span', { class: 'lord-swatch', style: { background: lord.color } }),
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
      ),
      h('button', {
        class: 'btn btn-seal end-turn',
        disabled: this.aiRunning || this.state.phase === 'ended' || this.current().kind !== 'human',
        onclick: () => void this.endTurn(),
      }, this.aiRunning ? 'The rivals move…' : 'End the Season'),
    );
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
        text: `${idleArmies.length} ${idleArmies.length === 1 ? 'army has' : 'armies have'} marching orders to give`,
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
      case 'escape':
        if (this.pendingSpell !== null) {
          this.clearSpellTargeting();
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
