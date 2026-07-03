/**
 * The vellum map — canvas renderer for the war table.
 *
 * Province shapes are traced from the engine's cell grid (marching the border
 * edges into loops), smoothed with Chaikin's corner cutting, and painted as
 * an aged, hand-inked campaign map: parchment grain, terrain washes and
 * glyphs, river ink, heraldic tints for owners, banners at seats.
 *
 * Purely visual: reads state, never writes it. All cosmetic randomness is
 * hashed from stable ids so the map never flickers between frames.
 */
import { hash32, Rng } from '../engine/rng';
import type { Province, Terrain } from '../engine/types';
import { LORD_BY_ID } from '../engine/content/lords';

export interface MapView {
  mapW: number;
  mapH: number;
  cells: number[];
  provinces: Province[];
  /** Player id -> heraldic color; index by province.owner. */
  playerColors?: Record<number, string>;
  playerPatterns?: Record<number, string>;
}

export interface RenderOptions {
  /** Province ids the viewer has never seen (fog): drawn as blank vellum. */
  unseen?: Set<number>;
  /** Currently visible provinces (live info); seen-but-not-visible gray out armies. */
  selected?: number | null;
  hovered?: number | null;
  /** Highlighted as legal move targets. */
  targets?: Set<number>;
  /** Subset of targets that mean a battle. */
  targetsHostile?: Set<number>;
  /** Sea-lane hints while a harbor army is selected. */
  seaLanes?: { from: number; to: number }[];
  /** The player whose realm should read unmistakably as "yours". */
  viewer?: number;
  showGrid?: boolean;
  colorblind?: boolean;
  /** Army markers to draw (owner -1 = leaderless). */
  armies?: { province: number; owner: number; strength: number; hasHero: boolean; kind?: string }[];
}

interface Loop {
  points: [number, number][];
}

const TERRAIN_WASH: Record<Terrain, string> = {
  meadow: 'rgba(214, 186, 100, 0.62)',
  forest: 'rgba(124, 156, 94, 0.68)',
  hills: 'rgba(198, 158, 92, 0.66)',
  mountain: 'rgba(148, 136, 130, 0.72)',
  moor: 'rgba(138, 152, 128, 0.6)',
};

const INK = '#3a2e1c';
const INK_SOFT = 'rgba(58, 46, 28, 0.65)';
const SEA_DEEP = '#5e7178';
const SEA_SHALLOW = '#8fa3a3';

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view: MapView | null = null;
  private loops = new Map<number, Loop[]>();
  private riverPaths: [number, number][][] = [];
  private parchment: HTMLCanvasElement | null = null;
  /** world transform */
  scale = 16;
  offX = 0;
  offY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  setView(view: MapView): void {
    this.view = view;
    this.loops.clear();
    for (const p of view.provinces) {
      this.loops.set(p.id, traceProvince(view, p.id));
    }
    this.riverPaths = traceRivers(view);
    this.parchment = makeParchment(view.mapW * 8, view.mapH * 8, hash32(view.provinces.map((p) => p.name).join('|')));
  }

  /** Fit the whole map into the canvas with a margin. */
  fit(): void {
    if (!this.view) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const margin = 24;
    this.scale = Math.min((width - margin * 2) / this.view.mapW, (height - margin * 2) / this.view.mapH);
    this.offX = (width - this.view.mapW * this.scale) / 2;
    this.offY = (height - this.view.mapH * this.scale) / 2;
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [this.offX + x * this.scale, this.offY + y * this.scale];
  }

  screenToWorld(px: number, py: number): [number, number] {
    return [(px - this.offX) / this.scale, (py - this.offY) / this.scale];
  }

  provinceAt(px: number, py: number): number | null {
    if (!this.view) return null;
    const [wx, wy] = this.screenToWorld(px, py);
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= this.view.mapW || y >= this.view.mapH) return null;
    const p = this.view.cells[y * this.view.mapW + x];
    return p >= 0 ? p : null;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(opts: RenderOptions = {}): void {
    const view = this.view;
    if (!view) return;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const hgt = rect.height;

    // --- the sea (table shows through a deep wash)
    const seaGrad = ctx.createLinearGradient(0, 0, w, hgt);
    seaGrad.addColorStop(0, SEA_SHALLOW);
    seaGrad.addColorStop(1, SEA_DEEP);
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, w, hgt);
    if (this.parchment) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.parchment, 0, 0, w, hgt);
      ctx.globalAlpha = 1;
    }
    // cartographer's wave strokes, anchored to world space
    ctx.save();
    ctx.strokeStyle = 'rgba(233, 240, 235, 0.10)';
    ctx.lineWidth = Math.max(1, this.scale * 0.05);
    const waveStep = this.scale * 2.6;
    const startX = ((this.offX % waveStep) + waveStep) % waveStep - waveStep;
    const startY = ((this.offY % (waveStep * 0.9)) + waveStep * 0.9) % (waveStep * 0.9) - waveStep * 0.9;
    for (let y = startY, row = 0; y < hgt + waveStep; y += waveStep * 0.9, row++) {
      for (let x = startX + (row % 2) * waveStep * 0.5; x < w + waveStep; x += waveStep) {
        ctx.beginPath();
        ctx.arc(x, y, this.scale * 0.45, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
    ctx.restore();

    // coastal shallows: a soft halo hugging the landmass
    ctx.save();
    this.pathLand(ctx);
    ctx.strokeStyle = 'rgba(226, 231, 216, 0.28)';
    ctx.lineWidth = this.scale * 0.9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(226, 231, 216, 0.16)';
    ctx.lineWidth = this.scale * 1.8;
    ctx.stroke();
    ctx.restore();

    // --- landmass shadow then vellum base
    ctx.save();
    this.pathLand(ctx);
    ctx.shadowColor = 'rgba(20, 12, 4, 0.5)';
    ctx.shadowBlur = this.scale * 0.9;
    ctx.shadowOffsetY = this.scale * 0.18;
    ctx.fillStyle = '#d9c9a1';
    ctx.fill();
    ctx.restore();

    if (this.parchment) {
      ctx.save();
      this.pathLand(ctx);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.parchment, 0, 0, w, hgt);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // --- provinces
    for (const p of view.provinces) {
      const loops = this.loops.get(p.id);
      if (!loops) continue;
      const unseen = opts.unseen?.has(p.id) ?? false;
      ctx.save();
      this.pathLoops(ctx, loops);
      ctx.clip();

      if (!unseen) {
        // terrain wash
        ctx.fillStyle = TERRAIN_WASH[p.terrain];
        ctx.fillRect(0, 0, w, hgt);
        // owner tint — the viewer's own realm reads clearly stronger
        if (p.owner >= 0 && view.playerColors) {
          const mine = opts.viewer !== undefined && p.owner === opts.viewer;
          ctx.globalAlpha = mine ? 0.52 : 0.38;
          ctx.fillStyle = view.playerColors[p.owner];
          ctx.fillRect(0, 0, w, hgt);
          ctx.globalAlpha = 1;
          if (opts.colorblind && view.playerPatterns) {
            drawPattern(ctx, view.playerPatterns[p.owner], view.playerColors[p.owner], w, hgt, this.scale);
          }
        } else if (p.owner < 0) {
          // free provinces sit back: a faint parchment-grey veil
          ctx.fillStyle = 'rgba(216, 206, 180, 0.25)';
          ctx.fillRect(0, 0, w, hgt);
        }
        this.drawTerrainGlyphs(ctx, p);
      } else {
        ctx.fillStyle = 'rgba(217, 201, 161, 0.25)';
        ctx.fillRect(0, 0, w, hgt);
      }

      // hover / selection / target glows
      if (opts.targets?.has(p.id)) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#e6c14a';
        ctx.fillRect(0, 0, w, hgt);
        ctx.globalAlpha = 1;
      }
      if (opts.hovered === p.id) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#fff2cc';
        ctx.fillRect(0, 0, w, hgt);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // --- rivers (under borders)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of this.riverPaths) {
      ctx.strokeStyle = 'rgba(52, 88, 108, 0.95)';
      ctx.lineWidth = Math.max(2, this.scale * 0.22);
      this.strokePath(ctx, path);
      ctx.strokeStyle = 'rgba(150, 196, 210, 0.7)';
      ctx.lineWidth = Math.max(1, this.scale * 0.08);
      this.strokePath(ctx, path);
    }
    ctx.restore();

    // --- province borders: soft wide stroke + crisp ink line
    for (const p of view.provinces) {
      const loops = this.loops.get(p.id);
      if (!loops) continue;
      const mine = opts.viewer !== undefined && p.owner === opts.viewer;
      ctx.save();
      this.pathLoops(ctx, loops);
      if (p.owner >= 0 && view.playerColors && !(opts.unseen?.has(p.id) ?? false)) {
        ctx.strokeStyle = view.playerColors[p.owner];
        ctx.lineWidth = Math.max(mine ? 3.5 : 2.5, this.scale * (mine ? 0.32 : 0.22));
        ctx.globalAlpha = mine ? 0.95 : 0.75;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (mine) {
          ctx.strokeStyle = 'rgba(255, 240, 200, 0.5)';
          ctx.lineWidth = Math.max(1.2, this.scale * 0.08);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = INK_SOFT;
      ctx.lineWidth = Math.max(1, this.scale * 0.07);
      ctx.stroke();
      ctx.restore();
    }

    // --- selection outline on top
    if (opts.selected !== null && opts.selected !== undefined) {
      const loops = this.loops.get(opts.selected);
      if (loops) {
        ctx.save();
        this.pathLoops(ctx, loops);
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = Math.max(2.5, this.scale * 0.2);
        ctx.shadowColor = 'rgba(255, 220, 130, 0.8)';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- coastline ink
    ctx.save();
    this.pathLand(ctx);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.4, this.scale * 0.1);
    ctx.stroke();
    ctx.restore();

    // --- site glyphs, seats, labels
    for (const p of view.provinces) {
      if (opts.unseen?.has(p.id)) continue;
      const [sx, sy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
      if (p.site) this.drawSite(ctx, p, sx, sy);
      const wallTier = p.buildings.includes('walls3') ? 3 : p.buildings.includes('walls2') ? 2 : p.buildings.includes('walls1') ? 1 : 0;
      if (wallTier > 0) {
        this.drawWallsBadge(ctx, sx + this.scale * (p.site ? 0.9 : 0), sy + this.scale * 0.78, wallTier);
      }
      if (p.seatOf !== null && p.seatOf >= 0 && view.playerColors) {
        this.drawBanner(ctx, sx, sy - this.scale * 1.15, view.playerColors[p.seatOf]);
      }
    }

    // --- sea-lane hints for the selected harbor army
    if (opts.seaLanes && opts.seaLanes.length > 0) {
      ctx.save();
      ctx.setLineDash([Math.max(4, this.scale * 0.4), Math.max(4, this.scale * 0.35)]);
      ctx.strokeStyle = 'rgba(240, 244, 235, 0.65)';
      ctx.lineWidth = Math.max(1.5, this.scale * 0.1);
      for (const lane of opts.seaLanes) {
        const a = view.provinces[lane.from];
        const b = view.provinces[lane.to];
        const [ax, ay] = this.worldToScreen(a.cx + 0.5, a.cy + 0.5);
        const [bx, by] = this.worldToScreen(b.cx + 0.5, b.cy + 0.5);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2 - Math.hypot(bx - ax, by - ay) * 0.14;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, bx, by);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- march-order glyphs on legal targets
    if (opts.targets && opts.targets.size > 0) {
      for (const pid of opts.targets) {
        if (opts.unseen?.has(pid)) continue;
        const p = view.provinces[pid];
        const [sx, sy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
        const hostile = opts.targetsHostile?.has(pid) ?? false;
        this.drawOrderGlyph(ctx, sx, sy - this.scale * 1.5, hostile);
      }
    }

    // --- army markers
    if (opts.armies) {
      const byProvince = new Map<number, typeof opts.armies>();
      for (const marker of opts.armies) {
        if (opts.unseen?.has(marker.province)) continue;
        const list = byProvince.get(marker.province) ?? [];
        list.push(marker);
        byProvince.set(marker.province, list);
      }
      for (const [pid, markers] of byProvince) {
        const p = view.provinces[pid];
        const [cx, cy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
        markers.forEach((marker, i) => {
          const x = cx + (i - (markers.length - 1) / 2) * this.scale * 1.05;
          const y = cy + this.scale * 1.5;
          this.drawArmyMarker(ctx, x, y, marker);
        });
      }
    }
    this.drawLabels(ctx, opts);
  }

  /** Crossed swords (battle) or a marching chevron (free move) on a wax disc. */
  private drawOrderGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, hostile: boolean): void {
    const r = Math.max(9, this.scale * 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hostile ? 'rgba(138, 47, 38, 0.95)' : 'rgba(52, 74, 46, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 190, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = '#ffeccb';
    ctx.lineWidth = Math.max(1.6, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (hostile) {
      const k = r * 0.48;
      ctx.moveTo(x - k, y - k);
      ctx.lineTo(x + k, y + k);
      ctx.moveTo(x + k, y - k);
      ctx.lineTo(x - k, y + k);
    } else {
      const k = r * 0.42;
      ctx.moveTo(x - k, y + k * 0.5);
      ctx.lineTo(x, y - k * 0.6);
      ctx.lineTo(x + k, y + k * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Small crenellated badge for walled provinces. */
  private drawWallsBadge(ctx: CanvasRenderingContext2D, x: number, y: number, tier: number): void {
    const s = this.scale;
    const w = s * 0.62;
    const hgt = s * 0.4;
    ctx.save();
    ctx.fillStyle = tier >= 3 ? '#6b5a3c' : '#7d6f52';
    ctx.strokeStyle = 'rgba(30, 22, 12, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fill();
    // crenellations
    const teeth = 3;
    const tw = w / (teeth * 2 - 1);
    for (let i = 0; i < teeth; i++) {
      ctx.rect(x - w / 2 + i * tw * 2, y - hgt / 2 - tw, tw, tw);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawArmyMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    marker: { owner: number; strength: number; hasHero: boolean; kind?: string },
  ): void {
    const view = this.view!;
    const r = Math.max(7, this.scale * 0.52);
    const color = marker.owner >= 0
      ? view.playerColors?.[marker.owner] ?? '#888'
      : marker.kind === 'rebels' ? '#7a5a20' : marker.kind === 'revenants' ? '#4a4a55' : '#5b4632';
    ctx.save();
    // shield disc
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = marker.hasHero ? 2.5 : 1.5;
    ctx.strokeStyle = marker.hasHero ? '#e6c14a' : 'rgba(20, 12, 4, 0.75)';
    ctx.stroke();
    // company count
    ctx.fillStyle = '#f4ead2';
    ctx.font = `700 ${Math.max(9, r)}px "Iowan Old Style", Palatino, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2;
    ctx.fillText(String(marker.strength), x, y + 0.5);
    ctx.restore();
  }

  // ------------------------------------------------------------ internals

  private pathLand(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    for (const loops of this.loops.values()) {
      for (const loop of loops) this.subPath(ctx, loop.points);
    }
  }

  private pathLoops(ctx: CanvasRenderingContext2D, loops: Loop[]): void {
    ctx.beginPath();
    for (const loop of loops) this.subPath(ctx, loop.points);
  }

  private subPath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
    if (pts.length < 3) return;
    const [x0, y0] = this.worldToScreen(pts[0][0], pts[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = this.worldToScreen(pts[i][0], pts[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private strokePath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
    if (pts.length < 2) return;
    ctx.beginPath();
    const [x0, y0] = this.worldToScreen(pts[0][0], pts[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = this.worldToScreen(pts[i][0], pts[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawTerrainGlyphs(ctx: CanvasRenderingContext2D, p: Province): void {
    const view = this.view!;
    const rng = new Rng([hash32(`glyph-${p.id}`) | 1, 0x9e3779b9, 0x243f6a88, 0xb7e15162]);
    const cells: number[] = [];
    for (let i = 0; i < view.cells.length; i++) if (view.cells[i] === p.id) cells.push(i);
    const density = p.terrain === 'meadow' ? 0.06 : 0.16;
    ctx.strokeStyle = 'rgba(58, 46, 28, 0.5)';
    ctx.fillStyle = 'rgba(58, 46, 28, 0.35)';
    ctx.lineWidth = Math.max(0.8, this.scale * 0.06);
    ctx.lineCap = 'round';
    for (const c of cells) {
      if (!rng.chance(density)) continue;
      const x = (c % view.mapW) + rng.range(0.25, 0.75);
      const y = Math.floor(c / view.mapW) + rng.range(0.25, 0.75);
      const [sx, sy] = this.worldToScreen(x, y);
      const s = this.scale;
      ctx.beginPath();
      switch (p.terrain) {
        case 'mountain': {
          ctx.moveTo(sx - s * 0.3, sy + s * 0.18);
          ctx.lineTo(sx, sy - s * 0.3);
          ctx.lineTo(sx + s * 0.3, sy + s * 0.18);
          ctx.moveTo(sx - s * 0.05, sy - s * 0.16);
          ctx.lineTo(sx + s * 0.12, sy + s * 0.02);
          ctx.stroke();
          break;
        }
        case 'hills': {
          ctx.arc(sx, sy, s * 0.22, Math.PI, 0);
          ctx.stroke();
          break;
        }
        case 'forest': {
          ctx.moveTo(sx, sy + s * 0.2);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sx, sy - s * 0.12, s * 0.16, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'moor': {
          ctx.moveTo(sx - s * 0.2, sy);
          ctx.lineTo(sx + s * 0.2, sy);
          ctx.moveTo(sx - s * 0.12, sy + s * 0.12);
          ctx.lineTo(sx + s * 0.12, sy + s * 0.12);
          ctx.stroke();
          break;
        }
        case 'meadow': {
          ctx.arc(sx, sy, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
  }

  private drawSite(ctx: CanvasRenderingContext2D, p: Province, sx: number, sy: number): void {
    const s = this.scale;
    const y = sy + s * 0.75;
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    switch (p.site) {
      case 'embersite': {
        // ember diamond with inner glow
        ctx.fillStyle = '#c25a1e';
        ctx.beginPath();
        ctx.moveTo(sx, y - s * 0.32);
        ctx.lineTo(sx + s * 0.24, y);
        ctx.lineTo(sx, y + s * 0.32);
        ctx.lineTo(sx - s * 0.24, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffb35c';
        ctx.beginPath();
        ctx.arc(sx, y, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ruin': {
        ctx.strokeRect(sx - s * 0.22, y - s * 0.18, s * 0.13, s * 0.36);
        ctx.strokeRect(sx + s * 0.08, y - s * 0.28, s * 0.13, s * 0.46);
        break;
      }
      case 'shrine': {
        ctx.beginPath();
        ctx.moveTo(sx, y - s * 0.3);
        ctx.lineTo(sx, y + s * 0.22);
        ctx.moveTo(sx - s * 0.18, y - s * 0.12);
        ctx.lineTo(sx + s * 0.18, y - s * 0.12);
        ctx.stroke();
        break;
      }
      case 'barrow': {
        ctx.beginPath();
        ctx.arc(sx, y + s * 0.1, s * 0.26, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, y + s * 0.1);
        ctx.lineTo(sx, y - s * 0.1);
        ctx.stroke();
        break;
      }
      case 'forge': {
        ctx.fillRect(sx - s * 0.24, y - s * 0.05, s * 0.48, s * 0.12);
        ctx.fillRect(sx - s * 0.1, y + s * 0.07, s * 0.2, s * 0.14);
        break;
      }
      case 'circle': {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.fillRect(sx + Math.cos(a) * s * 0.24 - s * 0.04, y + Math.sin(a) * s * 0.24 - s * 0.07, s * 0.08, s * 0.14);
        }
        break;
      }
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const s = this.scale;
    ctx.save();
    ctx.strokeStyle = '#2a2016';
    ctx.lineWidth = Math.max(1.2, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.95);
    ctx.lineTo(x, y - s * 0.15);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.15);
    ctx.lineTo(x + s * 0.75, y + s * 0.05);
    ctx.lineTo(x, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,4,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawLabels(ctx: CanvasRenderingContext2D, opts: RenderOptions): void {
    const view = this.view!;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of view.provinces) {
      if (opts.unseen?.has(p.id)) continue;
      const [sx, sy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
      const size = Math.max(9, Math.min(15, this.scale * 0.62));
      ctx.font = `600 ${size}px "Iowan Old Style", Palatino, Georgia, serif`;
      const yy = sy - this.scale * 0.35;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(226, 210, 170, 0.75)';
      ctx.strokeText(p.name, sx, yy);
      ctx.fillStyle = INK;
      ctx.fillText(p.name, sx, yy);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------- geometry helpers

/** Trace all border loops of a province from the cell grid. */
function traceProvince(view: MapView, pid: number): Loop[] {
  const { mapW: w, mapH: h, cells } = view;
  const inP = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === pid;
  // directed edges: key = "x,y" start point -> end point, interior on the left
  const edges = new Map<string, [number, number][]>();
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const key = `${x1},${y1}`;
    const list = edges.get(key) ?? [];
    list.push([x2, y2]);
    edges.set(key, list);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inP(x, y)) continue;
      if (!inP(x, y - 1)) addEdge(x + 1, y, x, y); // top, walk right-to-left
      if (!inP(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1); // bottom, left-to-right
      if (!inP(x - 1, y)) addEdge(x, y, x, y + 1); // left, downward
      if (!inP(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y); // right, upward
    }
  }
  const loops: Loop[] = [];
  while (edges.size > 0) {
    const firstKey: string = edges.keys().next().value!;
    const [sx, sy] = firstKey.split(',').map(Number);
    const pts: [number, number][] = [[sx, sy]];
    let cx = sx;
    let cy = sy;
    for (;;) {
      const key = `${cx},${cy}`;
      const nexts = edges.get(key);
      if (!nexts || nexts.length === 0) break;
      const [nx, ny] = nexts.pop()!;
      if (nexts.length === 0) edges.delete(key);
      if (nx === sx && ny === sy) break;
      pts.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    if (pts.length >= 4) {
      loops.push({ points: chaikin(simplify(pts), 2) });
    }
  }
  return loops;
}

/** Drop collinear midpoints (runs along the same axis). */
function simplify(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const collinear = (prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1]);
    if (!collinear) out.push(cur);
  }
  return out.length >= 3 ? out : pts;
}

/** Chaikin corner cutting on a closed loop. */
function chaikin(pts: [number, number][], iterations: number): [number, number][] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const p = cur[i];
      const q = cur[(i + 1) % n];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    cur = next;
  }
  return cur;
}

/** Border polylines for each river pair, smoothed. */
function traceRivers(view: MapView): [number, number][][] {
  const { mapW: w, mapH: h, cells } = view;
  const done = new Set<string>();
  const paths: [number, number][][] = [];
  for (const p of view.provinces) {
    for (const q of p.riverBorders) {
      const key = p.id < q ? `${p.id}:${q}` : `${q}:${p.id}`;
      if (done.has(key)) continue;
      done.add(key);
      // collect undirected lattice segments between cells of p.id and q
      const segs: [[number, number], [number, number]][] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = cells[y * w + x];
          if (x < w - 1) {
            const r = cells[y * w + x + 1];
            if ((c === p.id && r === q) || (c === q && r === p.id)) {
              segs.push([[x + 1, y], [x + 1, y + 1]]);
            }
          }
          if (y < h - 1) {
            const d = cells[(y + 1) * w + x];
            if ((c === p.id && d === q) || (c === q && d === p.id)) {
              segs.push([[x, y + 1], [x + 1, y + 1]]);
            }
          }
        }
      }
      // chain segments into polylines
      const remaining = [...segs];
      while (remaining.length > 0) {
        const [a, b] = remaining.pop()!;
        const path: [number, number][] = [a, b];
        let extended = true;
        while (extended) {
          extended = false;
          for (let i = 0; i < remaining.length; i++) {
            const [c, d] = remaining[i];
            const head = path[0];
            const tail = path[path.length - 1];
            const eq = (u: [number, number], v: [number, number]) => u[0] === v[0] && u[1] === v[1];
            if (eq(tail, c)) {
              path.push(d);
            } else if (eq(tail, d)) {
              path.push(c);
            } else if (eq(head, c)) {
              path.unshift(d);
            } else if (eq(head, d)) {
              path.unshift(c);
            } else {
              continue;
            }
            remaining.splice(i, 1);
            extended = true;
            break;
          }
        }
        if (path.length >= 3) paths.push(chaikinOpen(path, 2));
        else paths.push(path);
      }
    }
  }
  return paths;
}

function chaikinOpen(pts: [number, number][], iterations: number): [number, number][] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const p = cur[i];
      const q = cur[i + 1];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** Pattern overlays for colorblind mode. */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: string | undefined,
  color: string,
  w: number,
  h: number,
  scale: number,
): void {
  if (!pattern || pattern === 'plain') return;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, scale * 0.08);
  const step = Math.max(8, scale * 0.9);
  switch (pattern) {
    case 'stripes':
      for (let x = -h; x < w + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
      }
      break;
    case 'dots':
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, scale * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'checks':
      for (let y = 0; y < h; y += step) {
        for (let x = (y / step) % 2 === 0 ? 0 : step; x < w; x += step * 2) {
          ctx.fillRect(x, y, step, step);
        }
      }
      break;
    case 'waves':
      for (let y = step / 2; y < h; y += step) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const yy = y + Math.sin(x / (scale * 0.7)) * scale * 0.18;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      break;
    case 'crosshatch':
      for (let x = -h; x < w + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + h, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

/** Aged parchment texture: speckle, fibres, blotches. Generated once per map. */
function makeParchment(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rng = new Rng([seed | 1, seed ^ 0xdeadbeef, seed << 7, seed ^ 0x9e3779b9]);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);
  // fibre streaks
  for (let i = 0; i < w * h * 0.004; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const len = rng.range(3, 14);
    const a = rng.range(0, Math.PI);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(120, 96, 60, 0.05)' : 'rgba(255, 244, 214, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // speckle
  for (let i = 0; i < w * h * 0.012; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    ctx.fillStyle = rng.chance(0.6) ? 'rgba(100, 78, 44, 0.06)' : 'rgba(60, 42, 20, 0.05)';
    ctx.fillRect(x, y, 1, 1);
  }
  // blotches
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(8, 40);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(110, 84, 46, 0.045)');
    g.addColorStop(1, 'rgba(110, 84, 46, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
