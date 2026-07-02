/**
 * Procedural audio: a candlelit drone with slow harp arpeggios, and a small
 * SFX vocabulary — all synthesized in WebAudio, no assets. The full mixer
 * (master/music/sfx) hangs off three gain nodes.
 *
 * Everything is defensive: audio must never break the game, and nothing
 * plays before the first user gesture (browser policy).
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicTimer: number | null = null;
  private started = false;
  private vols = { master: 0.8, music: 0.6, sfx: 0.8 };
  private inGame = false;

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
    if (this.started) this.startMusic();
  }

  leaveGame(): void {
    this.inGame = false;
    this.stopMusic();
  }

  // ------------------------------------------------------------- music

  private startMusic(): void {
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
    for (const freq of [55, 55.7, 110.3]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
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
    this.blip(660, 0.06, 'triangle', 0.12);
  }

  coin(): void {
    this.blip(880, 0.12, 'sine', 0.14);
    this.blip(1320, 0.18, 'sine', 0.1, 0.05);
  }

  march(): void {
    this.noise(0.12, 0.18, 300);
    this.noise(0.1, 0.14, 250, 0.14);
  }

  clash(): void {
    this.noise(0.25, 0.3, 2400);
    this.blip(180, 0.3, 'sawtooth', 0.12);
    this.noise(0.2, 0.2, 1800, 0.12);
  }

  spell(): void {
    this.blip(520, 0.5, 'sine', 0.1);
    this.blip(780, 0.5, 'sine', 0.08, 0.08);
    this.blip(1040, 0.6, 'sine', 0.06, 0.16);
  }

  bell(): void {
    this.blip(440, 1.2, 'sine', 0.16);
    this.blip(660, 1.0, 'sine', 0.05, 0.02);
  }

  quillScratch(): void {
    this.noise(0.18, 0.06, 3200);
  }

  fanfare(): void {
    this.blip(392, 0.25, 'triangle', 0.16);
    this.blip(523, 0.25, 'triangle', 0.16, 0.22);
    this.blip(659, 0.5, 'triangle', 0.18, 0.44);
    this.blip(784, 0.9, 'triangle', 0.16, 0.66);
  }

  dirge(): void {
    this.blip(220, 0.8, 'triangle', 0.15);
    this.blip(207, 0.9, 'triangle', 0.13, 0.5);
    this.blip(174, 1.6, 'triangle', 0.15, 1.0);
  }
}

export const audio = new AudioEngine();

// unlock on first gesture, wherever it lands
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
window.addEventListener('keydown', () => audio.unlock(), { once: false });
