/**
 * The vellum map: canvas renderer for the war table.
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
import type { Province, ProvinceMod } from '../engine/types';
import { SPELLS, type SpellFxFamily } from '../engine/content/spells';
import { LORD_BY_ID } from '../engine/content/lords';

export interface MapView {
  mapW: number;
  mapH: number;
  cells: number[];
  provinces: Province[];
  /** Player id -> heraldic color; index by province.owner. */
  playerColors?: Record<number, string>;
  playerPatterns?: Record<number, string>;
  /** Written in the sheet's corner in the chronicler's hand (seed name). */
  sheetLabel?: string;
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
  /** Cheap fingerprint of the game state (e.g. action-log length). When
   * given, the political layer is cached until it changes; when absent,
   * every render paints the political layer fresh. */
  cacheKey?: string;
  /** Army markers to draw (owner -1 = leaderless; mine = the viewer's). */
  armies?: { province: number; owner: number; strength: number; hasHero: boolean; kind?: string; mine?: boolean }[];
  /** Transient animation layer (t runs 0→1). UI-only: never reads rng,
   * never writes state, and everything here is fog-gated on draw. */
  fx?: {
    ripples?: { province: number; t: number; color: string }[];
    /** Spell Theater: the cast moment, inked onto the vellum by family. */
    spells?: { province: number; t: number; family: SpellFxFamily }[];
  };
}

interface Loop {
  points: [number, number][];
}

// The vellum sheet (redesign, 2026-07): the canvas is one document. Water
// is blank vellum with sparse wave strokes, land is a slightly warmer tone,
// ownership is a wash close in luminance by design; ownership is never
// color-only (tokens, rings and banners carry it too).
const INK = '#4a3a22';
const INK_SOFT = 'rgba(92, 74, 44, 0.75)';
const VELLUM_CENTER = '#e2d3ac';
const VELLUM_MID = '#d9c9a1';
const VELLUM_EDGE = '#c3ad7f';
const LAND_BASE = '#dccb9f';
const WASH_PLAYER = '#b6bc8e';
const WASH_HOSTILE = ['#cf9d7f', '#c0a3a9', '#c9ab92', '#c9a08a', '#b8a89a'];
const WASH_NEUTRAL = ['#dac99f', '#d0be92', '#c7b287', '#e0d2ab'];
const ROAD = '#6b5738';
const TOKEN_NEUTRAL = '#57534a';
const TOKEN_PLAYER = '#4a5a35';
const TOKEN_HOSTILE = ['#8a2f26', '#6d4a58', '#5c5347', '#7a4a30', '#4f4a5c'];
const RIVER_INK = 'rgba(58, 76, 92, 0.8)';
const FELL_STACK = '"IM Fell English", "Iowan Old Style", Palatino, Georgia, serif';

/** Spell Theater palettes: warm gold for blessings, iron-gall murk for
 * curses, pale steel for wards, cold barrow-green for summons, thin pale
 * rings for scrying. Beneficial vs harmful is ALSO told by seal shape
 * (round vs torn), never by color alone. */
const FX_FAMILY: Record<SpellFxFamily, { core: string; edge: string }> = {
  bless: { core: '#ffd98a', edge: '#c9832e' },
  curse: { core: '#8f9a4a', edge: '#3d3448' },
  ward: { core: '#cfe0e2', edge: '#7a97a0' },
  summon: { core: '#9fdcc8', edge: '#3f6f63' },
  scry: { core: '#e8eef2', edge: '#95a7b4' },
};

/** Does a lingering effect help the province it sits on? Torn seals for
 * anything that hurts; round seals for the rest. */
function modHelps(mod: ProvinceMod): boolean {
  return (mod.order ?? 0) >= 0 && (mod.income ?? 0) >= 0 && (mod.defense ?? 0) >= 0;
}

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
    this.baseLayerKey = '';
    this.politicalLayerKey = '';
    this.loops.clear();
    for (const p of view.provinces) {
      this.loops.set(p.id, traceProvince(view, p.id));
    }
    this.riverPaths = traceRivers(view);
    this.roads = traceRoads(view);
    this.waves = traceWaves(view);
    this.parchment = makeParchment(view.mapW * 8, view.mapH * 8, hash32(view.provinces.map((p) => p.name).join('|')));
  }

  /** Courier roads (decor): each province linked to its nearest neighbor. */
  private roads: [number, number][] = [];
  /** Sparse cartographer's wave strokes, world-anchored, outside the coast. */
  private waves: [number, number][] = [];

  /** Fit the whole map into the canvas with a margin. `insetRight` keeps
   * the land clear of a dock on the right edge (the chronicle book on
   * desktop), so no province starts its life under the page. */
  fit(insetRight = 0): void {
    if (!this.view) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const margin = 24;
    const usable = Math.max(120, width - insetRight);
    this.scale = Math.min((usable - margin * 2) / this.view.mapW, (height - margin * 2) / this.view.mapH);
    this.offX = (usable - this.view.mapW * this.scale) / 2;
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

  // ------------------------------------------------ the layer cache (P1)
  // Three lifetimes, three layers. L0 (base): sea, vellum, terrain. Moves
  // only with the camera or the fog. L1 (political): tints, glyphs, rivers,
  // borders, sites, armies. Moves when the STATE moves (callers pass a
  // cheap cacheKey; the action log length is perfect). L2 (dynamic): hover,
  // selection, targets, labels, fx. Drawn every frame over two drawImages,
  // so a hover repaint costs composition, not cartography.
  private baseLayer: HTMLCanvasElement | null = null;
  private baseLayerKey = '';
  private politicalLayer: HTMLCanvasElement | null = null;
  private politicalLayerKey = '';
  private uncachedRenders = 0;

  private layerCtx(store: 'baseLayer' | 'politicalLayer'): CanvasRenderingContext2D {
    let layer = this[store];
    if (!layer) {
      layer = document.createElement('canvas');
      this[store] = layer;
    }
    if (layer.width !== this.canvas.width || layer.height !== this.canvas.height) {
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
    }
    const lctx = layer.getContext('2d')!;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = rect.width > 0 ? this.canvas.width / rect.width : 1;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, rect.width, rect.height);
    return lctx;
  }

  render(opts: RenderOptions = {}): void {
    const view = this.view;
    if (!view) return;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const hgt = rect.height;

    const camKey = `${this.scale.toFixed(3)}:${this.offX.toFixed(1)}:${this.offY.toFixed(1)}:${this.canvas.width}x${this.canvas.height}:${opts.unseen?.size ?? -1}`;
    if (!this.baseLayer || this.baseLayerKey !== camKey) {
      this.drawBaseLayer(this.layerCtx('baseLayer'), opts, w, hgt);
      this.baseLayerKey = camKey;
    }
    const polKey = opts.cacheKey === undefined
      ? `live:${++this.uncachedRenders}` // no key given: never cache
      : `${camKey}|${opts.cacheKey}:${opts.colorblind ? 1 : 0}:${opts.viewer ?? -9}`;
    if (!this.politicalLayer || this.politicalLayerKey !== polKey) {
      this.drawPoliticalLayer(this.layerCtx('politicalLayer'), opts, w, hgt);
      this.politicalLayerKey = polKey;
    }

    ctx.clearRect(0, 0, w, hgt);
    ctx.drawImage(this.baseLayer!, 0, 0, w, hgt);
    ctx.drawImage(this.politicalLayer!, 0, 0, w, hgt);
    this.drawDynamic(ctx, opts, w, hgt);
  }

  /** L0: everything that only moves with the camera or the fog. The whole
   * canvas is one vellum sheet: no sea fill, no viewport blue. */
  private drawBaseLayer(ctx: CanvasRenderingContext2D, opts: RenderOptions, w: number, hgt: number): void {
    void opts;
    // --- the sheet itself: mottled vellum, aged toward the corners
    const sheet = ctx.createRadialGradient(w * 0.42, hgt * 0.38, 0, w * 0.42, hgt * 0.38, Math.max(w, hgt) * 0.75);
    sheet.addColorStop(0, VELLUM_CENTER);
    sheet.addColorStop(0.55, VELLUM_MID);
    sheet.addColorStop(1, VELLUM_EDGE);
    ctx.fillStyle = sheet;
    ctx.fillRect(0, 0, w, hgt);
    if (this.parchment) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.parchment, 0, 0, w, hgt);
      ctx.globalAlpha = 1;
    }

    // sparse wave strokes, world-anchored, only on open water
    ctx.save();
    ctx.strokeStyle = 'rgba(155, 138, 99, 0.8)';
    ctx.lineWidth = Math.max(1.2, this.scale * 0.08);
    ctx.lineCap = 'round';
    for (const [wx, wy] of this.waves) {
      const [sx, sy] = this.worldToScreen(wx, wy);
      if (sx < -40 || sy < -40 || sx > w + 40 || sy > hgt + 40) continue;
      const u = this.scale * 0.55;
      ctx.beginPath();
      ctx.moveTo(sx - u, sy);
      ctx.quadraticCurveTo(sx - u * 0.5, sy - u * 0.5, sx, sy);
      ctx.quadraticCurveTo(sx + u * 0.5, sy + u * 0.5, sx + u, sy);
      ctx.stroke();
    }
    ctx.restore();

    // --- the landmass: a shade warmer than the open sheet, coast shading
    ctx.save();
    this.pathLand(ctx);
    ctx.strokeStyle = 'rgba(74, 58, 34, 0.18)';
    ctx.lineWidth = this.scale * 0.55;
    ctx.stroke();
    ctx.fillStyle = LAND_BASE;
    ctx.fill();
    ctx.restore();

    if (this.parchment) {
      ctx.save();
      this.pathLand(ctx);
      ctx.clip();
      ctx.globalAlpha = 0.4;
      ctx.drawImage(this.parchment, 0, 0, w, hgt);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /** The wash a province takes on the sheet: sage for the viewer's realm,
   * rust tones for rivals (rotated by seat), pale neutrals for the
   * unclaimed (rotated by province so neighbours differ). */
  private provinceWash(p: Province, viewer: number | undefined): string {
    if (p.owner < 0) return WASH_NEUTRAL[p.id % WASH_NEUTRAL.length];
    if (viewer !== undefined && p.owner === viewer) return WASH_PLAYER;
    return WASH_HOSTILE[p.owner % WASH_HOSTILE.length];
  }

  /** L1: everything that moves when the STATE moves. */
  private drawPoliticalLayer(ctx: CanvasRenderingContext2D, opts: RenderOptions, w: number, hgt: number): void {
    const view = this.view!;
    for (const p of view.provinces) {
      const loops = this.loops.get(p.id);
      if (!loops) continue;
      if (opts.unseen?.has(p.id)) continue; // fog: blank vellum, nothing more
      ctx.save();
      this.pathLoops(ctx, loops);
      ctx.clip();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.provinceWash(p, opts.viewer);
      ctx.fillRect(0, 0, w, hgt);
      ctx.globalAlpha = 1;
      if (p.owner >= 0 && opts.colorblind && view.playerPatterns) {
        // pattern in ink, so heraldry stays the differentiator on paper
        drawPattern(ctx, view.playerPatterns[p.owner], 'rgba(74, 58, 34, 0.8)', w, hgt, this.scale);
      }
      // the vellum mottle shows through the wash
      if (this.parchment) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(this.parchment, 0, 0, w, hgt);
        ctx.globalAlpha = 1;
      }
      this.drawTerrainGlyphs(ctx, p);
      ctx.restore();
    }

    // --- rivers: iron-gall ink under the borders
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of this.riverPaths) {
      ctx.strokeStyle = RIVER_INK;
      ctx.lineWidth = Math.max(1.8, this.scale * 0.16);
      this.strokePath(ctx, path);
    }
    ctx.restore();

    // --- courier roads: dashed, round caps, drawn over the washes
    ctx.save();
    ctx.strokeStyle = ROAD;
    ctx.lineWidth = Math.max(1.6, this.scale * 0.14);
    ctx.lineCap = 'round';
    ctx.setLineDash([1, Math.max(6, this.scale * 0.55)]);
    ctx.globalAlpha = 0.85;
    for (const [a, b] of this.roads) {
      if (opts.unseen?.has(a) || opts.unseen?.has(b)) continue;
      const pa = view.provinces[a];
      const pb = view.provinces[b];
      const [ax, ay] = this.worldToScreen(pa.cx + 0.5, pa.cy + 0.5);
      const [bx, by] = this.worldToScreen(pb.cx + 0.5, pb.cy + 0.5);
      const mx = (ax + bx) / 2 + (by - ay) * 0.15;
      const my = (ay + by) / 2 - (bx - ax) * 0.15;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
    }
    ctx.restore();

    // --- province borders: one crisp hand-inked line
    for (const p of view.provinces) {
      const loops = this.loops.get(p.id);
      if (!loops) continue;
      ctx.save();
      this.pathLoops(ctx, loops);
      ctx.strokeStyle = opts.unseen?.has(p.id) ? 'rgba(92, 74, 44, 0.35)' : INK_SOFT;
      ctx.lineWidth = Math.max(1.4, this.scale * 0.13);
      ctx.stroke();
      ctx.restore();
    }

    // --- coastline ink: the heaviest line on the sheet
    ctx.save();
    this.pathLand(ctx);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2.2, this.scale * 0.28);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // --- site glyphs, seats, badges, seals
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
      // enchantment seals: lasting effects stay visible on the land itself
      if (p.mods.length > 0) {
        const shown = p.mods.slice(0, 2);
        shown.forEach((mod, i) => {
          this.drawEnchantSeal(ctx,
            sx - this.scale * (0.85 + i * 0.75) + (p.site ? 0 : this.scale * 0.45),
            sy + this.scale * 0.78, mod);
        });
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
  }

  /** L2 (hover, selection, targets, labels, fx): every frame, over two
   * cached drawImages. */
  private drawDynamic(ctx: CanvasRenderingContext2D, opts: RenderOptions, w: number, hgt: number): void {
    const view = this.view!;
    // target / hover glows (low alpha; composited over the cached layers)
    for (const p of view.provinces) {
      const isTarget = opts.targets?.has(p.id) ?? false;
      const isHover = opts.hovered === p.id;
      if (!isTarget && !isHover) continue;
      const loops = this.loops.get(p.id);
      if (!loops) continue;
      ctx.save();
      this.pathLoops(ctx, loops);
      ctx.clip();
      if (isTarget) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(0, 0, w, hgt);
      }
      if (isHover) {
        // hover darkens the ground a touch, like a finger on the sheet
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#4a3a22';
        ctx.fillRect(0, 0, w, hgt);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (isHover) {
        ctx.save();
        this.pathLoops(ctx, loops);
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(2.2, this.scale * 0.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- selection: a wax-red ring pressed around the province
    if (opts.selected !== null && opts.selected !== undefined) {
      const loops = this.loops.get(opts.selected);
      if (loops) {
        ctx.save();
        this.pathLoops(ctx, loops);
        ctx.strokeStyle = '#8a2f26';
        ctx.lineWidth = Math.max(2.5, this.scale * 0.2);
        ctx.shadowColor = 'rgba(138, 47, 38, 0.7)';
        ctx.shadowBlur = 9;
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- sea-lane hints for the selected harbor army: dashed ink
    if (opts.seaLanes && opts.seaLanes.length > 0) {
      ctx.save();
      ctx.setLineDash([Math.max(4, this.scale * 0.4), Math.max(4, this.scale * 0.35)]);
      ctx.strokeStyle = 'rgba(74, 58, 34, 0.6)';
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

    this.drawLabels(ctx, opts);

    // --- transient fx layer (capture ripples: a banner planted in the ground)
    if (opts.fx?.ripples) {
      for (const ripple of opts.fx.ripples) {
        const p = view.provinces[ripple.province];
        if (!p || opts.unseen?.has(ripple.province)) continue;
        const [cx, cy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
        const t = Math.min(1, Math.max(0, ripple.t));
        const ease = 1 - (1 - t) * (1 - t);
        for (const ring of [0, 0.35]) {
          const rt = Math.min(1, Math.max(0, ease - ring));
          if (rt <= 0) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, this.scale * (0.8 + rt * 3.6), 0, Math.PI * 2);
          ctx.strokeStyle = ripple.color;
          ctx.globalAlpha = (1 - rt) * 0.55;
          ctx.lineWidth = Math.max(1.5, this.scale * 0.16 * (1 - rt));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (opts.fx?.spells) {
      for (const cast of opts.fx.spells) {
        const p = view.provinces[cast.province];
        if (!p || opts.unseen?.has(cast.province)) continue;
        const [cx, cy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
        this.drawSpellCast(ctx, cx, cy, cast.family, Math.min(1, Math.max(0, cast.t)), cast.province);
      }
    }

    this.drawSheetDressing(ctx, w, hgt);
  }

  /** The sheet's own furniture, in screen space over everything: aged-edge
   * falloff, a double inset border, the compass rose, and the seed name in
   * the chronicler's hand. Pure decor; it never covers a control. */
  private drawSheetDressing(ctx: CanvasRenderingContext2D, w: number, hgt: number): void {
    // corners age first
    const edge = ctx.createRadialGradient(w * 0.45, hgt * 0.4, Math.min(w, hgt) * 0.35, w * 0.45, hgt * 0.4, Math.max(w, hgt) * 0.72);
    edge.addColorStop(0, 'rgba(90, 65, 25, 0)');
    edge.addColorStop(1, 'rgba(90, 65, 25, 0.26)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, hgt);
    // double inset border
    ctx.strokeStyle = 'rgba(138, 112, 32, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(11.5, 11.5, w - 23, hgt - 23);
    ctx.strokeStyle = 'rgba(138, 112, 32, 0.25)';
    ctx.strokeRect(16.5, 16.5, w - 33, hgt - 33);
    // compass rose, top-left, under the inset border
    this.drawCompass(ctx, 64, 66, Math.min(34, Math.max(24, w * 0.024)));
    // the sheet's name, in the chronicler's hand
    const label = this.view?.sheetLabel;
    if (label && w > 520) {
      ctx.save();
      ctx.font = `italic 15px ${FELL_STACK}`;
      ctx.fillStyle = 'rgba(92, 76, 52, 0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 104, 30);
      ctx.restore();
    }
  }

  /** A simple ink compass rose: north in wax, the rest in soft ink. */
  private drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#5c4a2c';
    ctx.fillStyle = '#5c4a2c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    const point = (ang: number, len: number, fill: string): void => {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const px = -dy;
      const py = dx;
      ctx.beginPath();
      ctx.moveTo(x + dx * len, y + dy * len);
      ctx.lineTo(x + dx * len * 0.32 + px * r * 0.14, y + dy * len * 0.32 + py * r * 0.14);
      ctx.lineTo(x + dx * len * 0.45, y + dy * len * 0.45);
      ctx.lineTo(x + dx * len * 0.32 - px * r * 0.14, y + dy * len * 0.32 - py * r * 0.14);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    point(-Math.PI / 2, r, '#8a2f26'); // north, in wax
    point(Math.PI / 2, r, '#5c4a2c');
    point(0, r, '#5c4a2c');
    point(Math.PI, r, '#5c4a2c');
    ctx.font = `13px ${FELL_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#453520';
    ctx.fillText('N', x, y - r - 3);
    ctx.restore();
  }

  /** The cast moment, by family: gold bloom, ink blot, inscribed ward
   * circle, rising wisps, or scrying rings. Deterministic: phase offsets
   * come from the province id, never from Math.random. */
  private drawSpellCast(ctx: CanvasRenderingContext2D, cx: number, cy: number, family: SpellFxFamily, t: number, seedId: number): void {
    const s = this.scale;
    const ease = 1 - (1 - t) * (1 - t);
    const { core, edge } = FX_FAMILY[family];
    ctx.save();
    ctx.lineCap = 'round';
    if (family === 'bless') {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * (0.6 + ease * 2.2));
      grd.addColorStop(0, core);
      grd.addColorStop(1, 'rgba(255, 217, 138, 0)');
      ctx.globalAlpha = (1 - ease) * 0.55;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.6 + ease * 2.2), 0, Math.PI * 2);
      ctx.fill();
      // motes rise like sparks off a stirred fire
      for (let i = 0; i < 6; i++) {
        const ang = ((seedId * 37 + i * 61) % 360) * (Math.PI / 180);
        const mx = cx + Math.cos(ang) * s * (0.4 + (i % 3) * 0.3);
        const my = cy - ease * s * (1.2 + (i % 4) * 0.5);
        ctx.globalAlpha = (1 - ease) * 0.8;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(1, s * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (family === 'curse') {
      // iron-gall ink bleeding into the ground
      for (let i = 0; i < 5; i++) {
        const ang = ((seedId * 53 + i * 72) % 360) * (Math.PI / 180);
        const d = s * (0.3 + ease * (0.7 + (i % 3) * 0.35));
        ctx.globalAlpha = (1 - ease) * 0.4;
        ctx.fillStyle = i % 2 === 0 ? edge : core;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.7, s * (0.25 + ease * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (family === 'ward') {
      // a circle inscribed by hand, with a compass wobble
      const r = s * 1.35;
      const sweep = ease * Math.PI * 2;
      ctx.globalAlpha = t < 0.8 ? 0.85 : 0.85 * (1 - (t - 0.8) / 0.2);
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.5, s * 0.1);
      ctx.beginPath();
      const steps = Math.max(16, Math.floor(sweep * 20));
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (sweep * i) / steps;
        const wob = 1 + Math.sin(a * 3 + seedId) * 0.04;
        const x = cx + Math.cos(a) * r * wob;
        const y = cy + Math.sin(a) * r * wob;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (family === 'summon') {
      // cold wisps rise from the ground
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      for (let i = 0; i < 3; i++) {
        const x0 = cx + (i - 1) * s * 0.55;
        const rise = ease * s * (1.4 + i * 0.3);
        ctx.globalAlpha = (1 - ease) * 0.75;
        ctx.beginPath();
        ctx.moveTo(x0, cy + s * 0.4);
        ctx.quadraticCurveTo(x0 + s * 0.35 * (i % 2 === 0 ? 1 : -1), cy + s * 0.4 - rise * 0.5, x0, cy + s * 0.4 - rise);
        ctx.stroke();
      }
    } else {
      // scry: fine concentric rings, staggered
      ctx.strokeStyle = core;
      for (const lag of [0, 0.25, 0.5]) {
        const rt = Math.min(1, Math.max(0, ease - lag) / (1 - lag));
        if (rt <= 0) continue;
        ctx.globalAlpha = (1 - rt) * 0.6;
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.4 + rt * 2.4), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A small wax seal on enchanted ground: round for helpful workings,
   * torn (diamond) for harmful ones: shape first, color second, so the
   * distinction survives colorblindness. Pips count the seasons left. */
  private drawEnchantSeal(ctx: CanvasRenderingContext2D, x: number, y: number, mod: ProvinceMod): void {
    const s = this.scale;
    const r = Math.max(6.5, s * 0.36);
    const family: SpellFxFamily = mod.spellId ? SPELLS[mod.spellId].fxFamily : (modHelps(mod) ? 'bless' : 'curse');
    const { core, edge } = FX_FAMILY[family];
    ctx.save();
    ctx.beginPath();
    if (modHelps(mod)) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else {
      // a torn seal: four ragged points
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 0.85, y - r * 0.1);
      ctx.lineTo(x + r * 0.25, y + r * 0.25);
      ctx.lineTo(x + r * 0.55, y + r * 1.0);
      ctx.lineTo(x - r * 0.45, y + r * 0.55);
      ctx.lineTo(x - r * 0.95, y + r * 0.3);
      ctx.lineTo(x - r * 0.4, y - r * 0.35);
      ctx.closePath();
    }
    ctx.fillStyle = edge;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(30, 22, 12, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // pips: one dot per season left, capped at three
    const pips = Math.min(3, mod.turnsLeft);
    for (let i = 0; i < pips; i++) {
      ctx.beginPath();
      ctx.arc(x - (pips - 1) * r * 0.35 + i * r * 0.7, y + r * 1.45, Math.max(1, r * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }
    ctx.restore();
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

  /** Pewter army tokens: neutral metal for the wild, deep sage ringed in
   * gold for the viewer, dark wax tones rotated by seat for rivals. The
   * viewer id must come with the marker (set in armyMarkers upstream). */
  private drawArmyMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    marker: { owner: number; strength: number; hasHero: boolean; kind?: string; mine?: boolean },
  ): void {
    const r = Math.max(8, this.scale * 0.55);
    const color = marker.owner < 0
      ? (marker.kind === 'rebels' ? '#7a5a20' : marker.kind === 'revenants' ? '#4a4a55' : TOKEN_NEUTRAL)
      : marker.mine
        ? TOKEN_PLAYER
        : TOKEN_HOSTILE[marker.owner % TOKEN_HOSTILE.length];
    ctx.save();
    // the token casts a small shadow on the sheet
    ctx.beginPath();
    ctx.arc(x, y + r * 0.12, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 28, 12, 0.28)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = marker.mine ? '#e6c14a' : '#2e2a24';
    ctx.stroke();
    // a hero rides under a small gold pennon above the token
    if (marker.hasHero) {
      const k = r * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, y - r - k * 1.9);
      ctx.lineTo(x + k, y - r - k);
      ctx.lineTo(x, y - r - k * 0.1);
      ctx.lineTo(x - k, y - r - k);
      ctx.closePath();
      ctx.fillStyle = '#e6c14a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // company count
    ctx.fillStyle = '#f2e8d0';
    ctx.font = `700 ${Math.max(10, r)}px "Iowan Old Style", Palatino, Georgia, serif`;
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
    ctx.strokeStyle = 'rgba(92, 74, 44, 0.55)';
    ctx.fillStyle = 'rgba(92, 74, 44, 0.4)';
    ctx.lineWidth = Math.max(0.8, this.scale * 0.07);
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
          // filled pine, a glyph rather than a texture (redesign §5)
          ctx.moveTo(sx, sy - s * 0.24);
          ctx.lineTo(sx - s * 0.17, sy + s * 0.14);
          ctx.lineTo(sx + s * 0.17, sy + s * 0.14);
          ctx.closePath();
          ctx.fillStyle = 'rgba(122, 122, 78, 0.85)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(74, 74, 44, 0.7)';
          ctx.stroke();
          ctx.strokeStyle = 'rgba(92, 74, 44, 0.55)';
          ctx.fillStyle = 'rgba(92, 74, 44, 0.4)';
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
    if (p.site === null) return; // callers gate on p.site, but the switch must not trust that
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
    // Declutter: zoomed far out, names overlap into noise. Fade them in as
    // the table comes closer; selected/hovered provinces always keep theirs.
    const fade = Math.min(1, Math.max(0, (this.scale - 9) / 5));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of view.provinces) {
      if (opts.unseen?.has(p.id)) continue;
      const focused = opts.selected === p.id || opts.hovered === p.id;
      if (fade <= 0 && !focused) continue;
      const [sx, sy] = this.worldToScreen(p.cx + 0.5, p.cy + 0.5);
      const size = Math.max(10, Math.min(16, this.scale * 0.66));
      ctx.font = `italic ${size}px ${FELL_STACK}`;
      const yy = sy - this.scale * 0.35;
      ctx.globalAlpha = (focused ? 1 : fade) * 0.9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(226, 210, 170, 0.7)';
      ctx.strokeText(p.name, sx, yy);
      ctx.fillStyle = INK;
      ctx.fillText(p.name, sx, yy);
    }
    ctx.globalAlpha = 1;
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

/** Courier roads: every province linked to its nearest neighbor by center
 * distance (deduped), so the network stays sparse and readable. Decor only:
 * marching legality never reads from this. */
function traceRoads(view: MapView): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const p of view.provinces) {
    let best: number | null = null;
    let bestD = Infinity;
    for (const q of p.neighbors) {
      const other = view.provinces[q];
      if (!other) continue;
      const d = (p.cx - other.cx) ** 2 + (p.cy - other.cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (best === null) continue;
    const key = p.id < best ? `${p.id}:${best}` : `${best}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([p.id, best]);
  }
  return out;
}

/** Sparse wave strokes on open water, world-anchored and deterministic:
 * candidates are sampled from the map's own hash and kept only where a
 * whole cell-neighborhood is sea. */
function traceWaves(view: MapView): [number, number][] {
  const { mapW: w, mapH: h, cells } = view;
  const isSea = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    return cells[Math.floor(y) * w + Math.floor(x)] < 0;
  };
  const rng = new Rng([hash32(view.provinces.map((p) => p.name).join('~')) | 1, 0x51ed270b, 0x9e3779b9, 0xdeadbeef]);
  const waves: [number, number][] = [];
  const want = Math.min(30, Math.max(14, Math.floor((w * h) / 60)));
  let guard = 0;
  while (waves.length < want && guard < 600) {
    guard++;
    const x = rng.range(-3, w + 3);
    const y = rng.range(-3, h + 3);
    if (!isSea(x, y) || !isSea(x - 1.6, y) || !isSea(x + 1.6, y) || !isSea(x, y - 1.2) || !isSea(x, y + 1.2)) continue;
    waves.push([x, y]);
  }
  return waves;
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
