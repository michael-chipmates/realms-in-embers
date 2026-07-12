/**
 * App shell: owns the current screen, the game state, settings, and the
 * autosave/AI-turn plumbing. Screens render into #app and talk back
 * through this controller.
 */
import { createGame } from '../engine/engine';
import type { GameSettings, GameState } from '../engine/types';
import { clear } from './dom';
import { bootRecoveryCheck, loadSettings, saveSettings, saveToSlot, type UiSettings } from './saves';
import { renderTitle } from './screens/title';
import { renderSetup } from './screens/setup';
import { GameScreen } from './screens/game';
import type { OnlineSession } from './screens/lobby';
import type { FirstEmberGuide } from './guide';
import { audio } from './audio';

export type ScreenName = 'title' | 'setup' | 'game';

export class App {
  readonly root: HTMLElement;
  settings: UiSettings;
  game: GameState | null = null;
  gameScreen: GameScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.applySettings();
    // If the newest autosave is damaged but the :lastgood copy reads,
    // restore it now so Continue works. The note also shows in Settings.
    const recovery = bootRecoveryCheck();
    if (recovery) console.warn(`[saves] ${recovery}`);
    this.armCrashBoundary();
  }

  /** SAVE-033: when an uncaught error escapes with a local chronicle open,
   * set the game down as "The emergency copy" before anything else is lost.
   * Once per session (a crash loop must not thrash storage) and never for
   * online wars, whose truth lives in the relay log, not local slots. */
  private crashSaved = false;

  private armCrashBoundary(): void {
    const onCrash = (): void => {
      if (this.crashSaved || !this.game || !this.gameScreen || this.gameScreen.online) return;
      this.crashSaved = true;
      const saved = saveToSlot(this.game, 'emergency');
      if (saved.ok) {
        console.warn('[saves] an uncaught error escaped; the chronicle was set down as The emergency copy');
        this.gameScreen.toast(
          'Something broke backstage. Your chronicle was set down safely as “The emergency copy” on the shelf.',
          'danger');
      }
    };
    window.addEventListener('error', onCrash);
    window.addEventListener('unhandledrejection', onCrash);
  }

  applySettings(): void {
    document.documentElement.style.setProperty('--text-scale', String(this.settings.textScale));
    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
    document.body.classList.toggle('colorblind', this.settings.colorblind);
    audio.setVolumes(this.settings.volMaster, this.settings.volMusic, this.settings.volSfx);
    saveSettings(this.settings);
  }

  toTitle(): void {
    this.gameScreen?.dispose();
    this.gameScreen = null;
    clear(this.root);
    renderTitle(this);
  }

  toSetup(presetSeed?: string): void {
    this.gameScreen?.dispose();
    this.gameScreen = null;
    clear(this.root);
    renderSetup(this, presetSeed);
  }

  startGame(settings: GameSettings, opts: { guide?: FirstEmberGuide } = {}): void {
    this.gameScreen?.dispose();
    this.gameScreen = null;
    const { state, effects } = createGame(settings);
    this.game = state;
    const saved = saveToSlot(state, 'auto');
    if (!saved.ok) console.warn(`[saves] ${saved.message}`);
    clear(this.root);
    this.gameScreen = new GameScreen(this, state);
    if (opts.guide) this.gameScreen.guide = opts.guide;
    this.gameScreen.mount(this.root);
    this.gameScreen.presentEffects(effects);
    this.gameScreen.guide?.onUpdate(this.gameScreen);
    audio.enterGame();
  }

  /** An online war: same deterministic engine, actions travel encrypted. */
  startOnlineGame(settings: GameSettings, session: OnlineSession): void {
    this.gameScreen?.dispose();
    this.gameScreen = null;
    const { state, effects } = createGame(settings);
    this.game = state;
    clear(this.root);
    this.gameScreen = new GameScreen(this, state, session);
    this.gameScreen.mount(this.root);
    this.gameScreen.presentEffects(effects);
    audio.enterGame();
  }

  continueGame(state: GameState): void {
    this.gameScreen?.dispose();
    this.gameScreen = null;
    this.game = state;
    clear(this.root);
    this.gameScreen = new GameScreen(this, state);
    this.gameScreen.mount(this.root);
    audio.enterGame();
  }
}
