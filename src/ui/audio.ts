/**
 * Procedural audio: a candlelit drone with slow harp arpeggios, and a small
 * SFX vocabulary: all synthesized in WebAudio, no assets. The full mixer
 * (master/music/sfx) hangs off three gain nodes.
 *
 * Everything is defensive: audio must never break the game, and nothing
 * plays before the first user gesture (browser policy).
 */

/**
 * Bundled score: Scott Buckley, 'Penumbra' & 'Song Of The Forge',
 * CC-BY 4.0 (www.scottbuckley.com.au). Credits shown in Settings & README.
 * Delivered as ~128kbps-class AAC (.m4a) to keep the download light.
 * Drop your own audio files in public/music/ + playlist.json to override.
 */
const DEFAULT_PLAYLIST = ['music/penumbra.m4a', 'music/song-of-the-forge.m4a'];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicTimer: number | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneNodes: AudioNode[] = [];
  private started = false;
  private vols = { master: 0.8, music: 0.6, sfx: 0.8 };
  private inGame = false;
  private trackEl: HTMLAudioElement | null = null;
  private trackSource: MediaElementAudioSourceNode | null = null;
  private playlist: string[] = [...DEFAULT_PLAYLIST];
  private trackIdx = 0;
  private useTracks = true;
  /** Generated-SFX ladder: audio/manifest.json maps cue -> file. Missing
   * manifest or missing cue falls back to the synth voice below, forever. */
  private sfxManifest: Record<string, string> | null | 'pending' = null;
  private sfxBuffers = new Map<string, AudioBuffer | 'loading' | 'failed'>();

  private loadSfxManifest(): void {
    if (this.sfxManifest !== null) return;
    this.sfxManifest = 'pending';
    fetch('audio/manifest.json')
      .then(async (res) => {
        this.sfxManifest = res.ok ? ((await res.json()) as Record<string, string>) : {};
      })
      .catch(() => { this.sfxManifest = {}; });
  }

  /** Narration: generated speech only, no synth stand-in. Waits for the
   * manifest and the decode, then speaks, so the ceremony can breathe first. */
  voice(cue: string): void {
    if (!this.ensure()) return;
    if (this.sfxManifest === null) this.loadSfxManifest();
    const attempt = (triesLeft: number): void => {
      if (this.sfxManifest === null || this.sfxManifest === 'pending') {
        if (triesLeft > 0) window.setTimeout(() => attempt(triesLeft - 1), 250);
        return;
      }
      const file = this.sfxManifest[`voice-${cue}`];
      if (!file || !this.ctx) return;
      const speak = (decoded: AudioBuffer): void => {
        if (!this.started) return;
        const src = this.ctx!.createBufferSource();
        src.buffer = decoded;
        src.connect(this.sfx!);
        src.start();
      };
      const cached = this.sfxBuffers.get(`voice-${cue}`);
      if (cached instanceof AudioBuffer) { speak(cached); return; }
      if (cached === 'failed') return;
      fetch(`audio/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))))
        .then((buf) => this.ctx!.decodeAudioData(buf))
        .then((decoded) => {
          this.sfxBuffers.set(`voice-${cue}`, decoded);
          speak(decoded);
        })
        .catch(() => { this.sfxBuffers.set(`voice-${cue}`, 'failed'); /* text carries it */ });
    };
    attempt(8);
  }

  /** True if a generated file covered this cue (played or now loading). */
  private tryFile(cue: string): boolean {
    if (!this.ctx || !this.started) return false;
    if (this.sfxManifest === null || this.sfxManifest === 'pending') return false;
    const file = this.sfxManifest[cue];
    if (!file) return false;
    const cached = this.sfxBuffers.get(cue);
    if (cached instanceof AudioBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = cached;
      src.connect(this.sfx!);
      src.start();
      return true;
    }
    if (cached === 'failed') return false;
    if (cached === undefined) {
      this.sfxBuffers.set(cue, 'loading');
      fetch(`audio/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))))
        .then((buf) => this.ctx!.decodeAudioData(buf))
        .then((decoded) => this.sfxBuffers.set(cue, decoded))
        .catch(() => this.sfxBuffers.set(cue, 'failed'));
    }
    return false; // synth covers this one; the file takes over once decoded
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.applyVolumes();
      return true;
    } catch {
      return false;
    }
  }

  /** Call on any user gesture; resumes/starts everything lazily. */
  unlock(): void {
    if (!this.ensure()) return;
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
    if (!this.started) {
      this.started = true;
      if (this.inGame) this.startMusic();
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vols = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master!.gain.value = this.vols.master;
    this.music!.gain.value = this.vols.music * 0.5;
    this.sfx!.gain.value = this.vols.sfx;
  }

  enterGame(): void {
    this.inGame = true;
    this.loadSfxManifest();
    if (this.started) this.startMusic();
  }

  /** Attribution lines for the Settings credits block. */
  credits(): string[] {
    return [
      "Music: 'Penumbra' by Scott Buckley, released under CC-BY 4.0. www.scottbuckley.com.au",
      "Music: 'Song Of The Forge' by Scott Buckley, released under CC-BY 4.0. www.scottbuckley.com.au",
    ];
  }

  /** The score's file list, for the offline warm-cache sweep. */
  trackUrls(): string[] {
    return [...this.playlist];
  }

  leaveGame(): void {
    this.inGame = false;
    this.stopMusic();
  }

  // ------------------------------------------------------------- music

  private startMusic(): void {
    if (!this.ensure()) return;
    if (this.useTracks) {
      void this.startTrackMusic();
    } else {
      this.startGenerativeMusic();
    }
  }

  /** Stream the bundled (or user-provided) score through the music bus. */
  private async startTrackMusic(): Promise<void> {
    if (this.trackEl) {
      void this.trackEl.play().catch(() => undefined);
      return;
    }
    try {
      // users may override the score: public/music/playlist.json = ["music/a.mp3", ...]
      try {
        const res = await fetch('music/playlist.json');
        if (res.ok) {
          const list = (await res.json()) as string[];
          if (Array.isArray(list) && list.length > 0) this.playlist = list;
        }
      } catch {
        // no override: bundled score
      }
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      this.trackEl = el;
      this.trackSource = this.ctx!.createMediaElementSource(el);
      this.trackSource.connect(this.music!);
      const playNext = (): void => {
        if (!this.inGame || !this.trackEl) return;
        el.src = this.playlist[this.trackIdx % this.playlist.length];
        this.trackIdx++;
        el.play().catch(() => {
          // tracks unavailable (offline build without files): fall back for good
          this.useTracks = false;
          this.teardownTracks();
          this.startGenerativeMusic();
        });
      };
      el.addEventListener('ended', () => window.setTimeout(playNext, 2400));
      el.addEventListener('error', () => {
        this.useTracks = false;
        this.teardownTracks();
        this.startGenerativeMusic();
      });
      playNext();
    } catch {
      this.useTracks = false;
      this.startGenerativeMusic();
    }
  }

  private teardownTracks(): void {
    if (this.trackEl) {
      this.trackEl.pause();
      this.trackEl.src = '';
      this.trackEl = null;
    }
    this.trackSource?.disconnect();
    this.trackSource = null;
  }

  private startGenerativeMusic(): void {
    if (!this.ensure() || this.musicTimer !== null) return;
    const ctx = this.ctx!;
    // hearth drone: two detuned low oscillators through a soft lowpass
    const drone = ctx.createGain();
    drone.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.connect(drone);
    drone.connect(this.music!);
    this.droneNodes = [drone, filter];
    for (const freq of [55, 55.7, 110.3]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      this.droneOscs.push(osc);
    }
    // slow modal harp: schedule sparse plucks
    const scale = [220, 246.9, 261.6, 293.7, 329.6, 392, 440]; // A dorian-ish
    const pluck = () => {
      if (!this.ctx || this.musicTimer === null) return;
      const now = ctx.currentTime;
      const notes = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        const freq = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.25 ? 0.5 : 1);
        const t = now + i * (0.3 + Math.random() * 0.4);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
        const overtone = ctx.createOscillator();
        overtone.type = 'sine';
        overtone.frequency.value = freq * 2;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(0.03, t + 0.01);
        og.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.connect(g);
        overtone.connect(og);
        g.connect(this.music!);
        og.connect(this.music!);
        osc.start(t);
        osc.stop(t + 2.6);
        overtone.start(t);
        overtone.stop(t + 1.4);
      }
      this.musicTimer = window.setTimeout(pluck, 4000 + Math.random() * 6000);
    };
    this.musicTimer = window.setTimeout(pluck, 800);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    // the hearth drone never stops on its own: put it out with the rest
    for (const osc of this.droneOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    this.droneOscs = [];
    for (const node of this.droneNodes) node.disconnect();
    this.droneNodes = [];
    if (this.trackEl) this.trackEl.pause();
  }

  // --------------------------------------------------------------- sfx

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.sfx!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, freq = 800, when = 0): void {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx!);
    src.start(t);
  }

  click(): void {
    if (this.tryFile('click')) return;
    this.blip(660, 0.06, 'triangle', 0.12);
  }

  coin(): void {
    if (this.tryFile('coin')) return;
    this.blip(880, 0.12, 'sine', 0.14);
    this.blip(1320, 0.18, 'sine', 0.1, 0.05);
  }

  march(): void {
    if (this.tryFile('march')) return;
    this.noise(0.12, 0.18, 300);
    this.noise(0.1, 0.14, 250, 0.14);
  }

  clash(): void {
    if (this.tryFile('clash')) return;
    this.noise(0.25, 0.3, 2400);
    this.blip(180, 0.3, 'sawtooth', 0.12);
    this.noise(0.2, 0.2, 1800, 0.12);
  }

  /** Casts speak in their family's voice: blessings chime upward, curses
   * lean on a low minor drone, wards ring like struck metal, summons breathe
   * cold, scrying stays thin and high. File cues (spell-bless etc.) win when
   * the manifest carries them; the synth fallback shapes each family. */
  spell(family?: 'bless' | 'curse' | 'ward' | 'summon' | 'scry'): void {
    if (family && this.tryFile(`spell-${family}`)) return;
    if (this.tryFile('spell')) return;
    switch (family) {
      case 'curse':
        this.blip(220, 0.7, 'sawtooth', 0.05);
        this.blip(208, 0.8, 'sawtooth', 0.045, 0.05);
        this.blip(110, 0.9, 'sine', 0.06, 0.1);
        break;
      case 'ward':
        this.blip(660, 0.9, 'triangle', 0.09);
        this.blip(990, 1.1, 'sine', 0.05, 0.05);
        break;
      case 'summon':
        this.blip(150, 1.0, 'sine', 0.07);
        this.blip(300, 0.9, 'triangle', 0.04, 0.2);
        this.blip(225, 1.1, 'sine', 0.05, 0.4);
        break;
      case 'scry':
        this.blip(1320, 0.6, 'sine', 0.04);
        this.blip(1760, 0.7, 'sine', 0.03, 0.12);
        break;
      default: // bless, and the classic rising figure
        this.blip(520, 0.5, 'sine', 0.1);
        this.blip(780, 0.5, 'sine', 0.08, 0.08);
        this.blip(1040, 0.6, 'sine', 0.06, 0.16);
        break;
    }
  }

  bell(): void {
    if (this.tryFile('bell')) return;
    this.blip(440, 1.2, 'sine', 0.16);
    this.blip(660, 1.0, 'sine', 0.05, 0.02);
  }

  quillScratch(): void {
    if (this.tryFile('quill')) return;
    this.noise(0.18, 0.06, 3200);
  }

  /** End-of-season horn: a low swell with a fifth. */
  horn(): void {
    if (!this.ctx || !this.started) return;
    if (this.tryFile('horn')) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [freq, gain] of [[146.8, 0.14], [220.2, 0.08]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t);
      filter.frequency.linearRampToValueAtTime(900, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.sfx!);
      osc.start(t);
      osc.stop(t + 1.2);
    }
  }

  /** Mason's hammer for laying works. */
  hammer(): void {
    if (this.tryFile('hammer')) return;
    this.blip(90, 0.16, 'sine', 0.22);
    this.noise(0.08, 0.16, 1400, 0.01);
    this.blip(72, 0.2, 'sine', 0.12, 0.16);
    this.noise(0.07, 0.1, 1200, 0.17);
  }

  /** Muster drum for raising companies. */
  drum(): void {
    if (this.tryFile('drum')) return;
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    for (const when of [0, 0.16, 0.32]) {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(when === 0.32 ? 0.3 : 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(this.sfx!);
      osc.start(t);
      osc.stop(t + 0.2);
      this.noise(0.05, 0.08, 2600, when + 0.005);
    }
  }

  fanfare(): void {
    if (this.tryFile('fanfare')) return;
    this.blip(392, 0.25, 'triangle', 0.16);
    this.blip(523, 0.25, 'triangle', 0.16, 0.22);
    this.blip(659, 0.5, 'triangle', 0.18, 0.44);
    this.blip(784, 0.9, 'triangle', 0.16, 0.66);
  }

  dirge(): void {
    if (this.tryFile('dirge')) return;
    this.blip(220, 0.8, 'triangle', 0.15);
    this.blip(207, 0.9, 'triangle', 0.13, 0.5);
    this.blip(174, 1.6, 'triangle', 0.15, 1.0);
  }
}

export const audio = new AudioEngine();

// unlock on first gesture, wherever it lands
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
window.addEventListener('keydown', () => audio.unlock(), { once: false });
