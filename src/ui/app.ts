/**
 * App shell: owns the current screen, the game state, settings, and the
 * autosave/AI-turn plumbing. Screens render into #app and talk back
 * through this controller.
 */
import { createGame } from '../engine/engine';
import type { GameSettings, GameState } from '../engine/types';
import { clear } from './dom';
import { loadSettings, saveSettings, saveToSlot, type UiSettings } from './saves';
import { renderTitle } from './screens/title';
import { renderSetup } from './screens/setup';
import { GameScreen } from './screens/game';
import type { OnlineSession } from './screens/lobby';
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

  startGame(settings: GameSettings): void {
    const { state, effects } = createGame(settings);
    this.game = state;
    saveToSlot(state, 'auto');
    clear(this.root);
    this.gameScreen = new GameScreen(this, state);
    this.gameScreen.mount(this.root);
    this.gameScreen.presentEffects(effects);
    audio.enterGame();
  }

  /** An online war: same deterministic engine, actions travel encrypted. */
  startOnlineGame(settings: GameSettings, session: OnlineSession): void {
    const { state, effects } = createGame(settings);
    this.game = state;
    clear(this.root);
    this.gameScreen = new GameScreen(this, state, session);
    this.gameScreen.mount(this.root);
    this.gameScreen.presentEffects(effects);
    audio.enterGame();
  }

  continueGame(state: GameState): void {
    this.game = state;
    clear(this.root);
    this.gameScreen = new GameScreen(this, state);
    this.gameScreen.mount(this.root);
    audio.enterGame();
  }
}
