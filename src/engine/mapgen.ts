/**
 * Procedural province maps.
 *
 * A continent is shaped by value noise + radial falloff on a coarse cell grid;
 * provinces grow from farthest-point seeds via multi-source Dijkstra over
 * noise-jittered costs (organic, hand-drawn-looking borders, guaranteed
 * contiguous). Everything downstream (adjacency, rivers, sea lanes, terrain,
 * sites, names) derives from that grid. Deterministic for a given Rng.
 */
import { Rng } from './rng';
import type { MapSize, Province, SiteType, Terrain } from './types';
import { makeProvinceNamer, provinceFlavor } from './content/names';

export interface MapSizeCfg {
  w: number;
  h: number;
  provinces: number;
  label: string;
}

export const MAP_SIZES: Record<MapSize, MapSizeCfg> = {
  small: { w: 42, h: 32, provinces: 12, label: 'Small — 12 provinces' },
  medium: { w: 54, h: 40, provinces: 20, label: 'Medium — 20 provinces' },
  large: { w: 66, h: 48, provinces: 30, label: 'Large — 30 provinces' },
};

export interface GeneratedMap {
  w: number;
  h: number;
  /** Province index per cell; -1 = sea. */
  cells: number[];
  provinces: Province[];
}

// ------------------------------------------------------------------- noise

function makeNoise(rng: Rng, w: number, h: number, scale: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const lat: number[] = [];
  for (let i = 0; i < gw * gh; i++) lat.push(rng.next());
  return (x: number, y: number) => {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.min(Math.floor(gx), gw - 2);
    const y0 = Math.min(Math.floor(gy), gh - 2);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = lat[y0 * gw + x0];
    const b = lat[y0 * gw + x0 + 1];
    const c = lat[(y0 + 1) * gw + x0];
    const d = lat[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// -------------------------------------------------------------- small heap

class MinHeap {
  keys: number[] = [];
  vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length > 0) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

// -------------------------------------------------------------- generation

export function generateMap(rng: Rng, size: MapSize): GeneratedMap {
  const cfg = MAP_SIZES[size];
  for (let attempt = 0; attempt < 8; attempt++) {
    const map = tryGenerate(rng.fork(`map-attempt-${attempt}-${rng.next()}`), cfg);
    if (map) return map;
  }
  // Deterministic fallback can't realistically be reached (tryGenerate only
  // rejects statistically unlucky continents), but never crash on a seed:
  const map = tryGenerate(rng.fork('map-last-resort'), { ...cfg, provinces: Math.max(6, cfg.provinces - 2) });
  if (!map) throw new Error('map generation failed catastrophically');
  return map;
}

function tryGenerate(rng: Rng, cfg: MapSizeCfg): GeneratedMap | null {
  const { w, h } = cfg;
  const total = w * h;
  const n1 = makeNoise(rng, w, h, 14);
  const n2 = makeNoise(rng, w, h, 6);
  const nCost = makeNoise(rng, w, h, 3.2);
  const nMoist = makeNoise(rng, w, h, 11);

  // -- continent shape
  const elev = new Array<number>(total);
  const cx0 = w / 2;
  const cy0 = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx0) / (w * 0.52);
      const dy = (y - cy0) / (h * 0.52);
      const radial = Math.sqrt(dx * dx + dy * dy);
      elev[y * w + x] = 0.62 * n1(x, y) + 0.38 * n2(x, y) - radial * radial * 0.85;
    }
  }
  const targetLand = Math.min(Math.floor(total * 0.55), cfg.provinces * 68);
  const sorted = [...elev].sort((a, b) => b - a);
  const threshold = sorted[targetLand];
  const land = elev.map((e) => e > threshold);

  // -- keep only the largest connected landmass
  const comp = new Array<number>(total).fill(-1);
  let compCount = 0;
  const compSizes: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!land[i] || comp[i] !== -1) continue;
    const queue = [i];
    comp[i] = compCount;
    let size = 0;
    while (queue.length) {
      const c = queue.pop()!;
      size++;
      const x = c % w;
      const y = (c / w) | 0;
      const nb = [c - 1, c + 1, c - w, c + w];
      const ok = [x > 0, x < w - 1, y > 0, y < h - 1];
      for (let k = 0; k < 4; k++) {
        if (ok[k] && land[nb[k]] && comp[nb[k]] === -1) {
          comp[nb[k]] = compCount;
          queue.push(nb[k]);
        }
      }
    }
    compSizes.push(size);
    compCount++;
  }
  if (compCount === 0) return null;
  let bigComp = 0;
  for (let i = 1; i < compCount; i++) if (compSizes[i] > compSizes[bigComp]) bigComp = i;
  const landCells: number[] = [];
  for (let i = 0; i < total; i++) {
    if (land[i] && comp[i] !== bigComp) land[i] = false;
    if (land[i]) landCells.push(i);
  }
  if (landCells.length < cfg.provinces * 34) return null;

  // -- farthest-point province seeds
  const seeds: number[] = [rng.pick(landCells)];
  const distToSeeds = new Array<number>(total).fill(Infinity);
  const updateDist = (seed: number) => {
    const sx = seed % w;
    const sy = (seed / w) | 0;
    for (const c of landCells) {
      const dx = (c % w) - sx;
      const dy = ((c / w) | 0) - sy;
      const d = dx * dx + dy * dy;
      if (d < distToSeeds[c]) distToSeeds[c] = d;
    }
  };
  updateDist(seeds[0]);
  while (seeds.length < cfg.provinces) {
    let best = -1;
    let bestD = -1;
    for (const c of landCells) {
      if (distToSeeds[c] > bestD) {
        bestD = distToSeeds[c];
        best = c;
      }
    }
    seeds.push(best);
    updateDist(best);
  }

  // -- multi-source Dijkstra growth with noise-jittered costs
  const cellProv = new Array<number>(total).fill(-1);
  const cost = new Array<number>(total).fill(Infinity);
  const bias = seeds.map(() => rng.range(0.85, 1.18));
  const heap = new MinHeap();
  seeds.forEach((s, pi) => {
    cost[s] = 0;
    cellProv[s] = pi;
    heap.push(0, s);
  });
  while (heap.size > 0) {
    const c = heap.pop();
    const x = c % w;
    const y = (c / w) | 0;
    const pi = cellProv[c];
    const base = cost[c];
    const nb = [c - 1, c + 1, c - w, c + w];
    const ok = [x > 0, x < w - 1, y > 0, y < h - 1];
    for (let k = 0; k < 4; k++) {
      if (!ok[k] || !land[nb[k]]) continue;
      const step = (0.55 + nCost(nb[k] % w, (nb[k] / w) | 0) * 1.5) * bias[pi];
      const nc = base + step;
      if (nc < cost[nb[k]]) {
        cost[nb[k]] = nc;
        cellProv[nb[k]] = pi;
        heap.push(nc, nb[k]);
      }
    }
  }

  // -- province cell lists, reject tiny provinces
  const provCells: number[][] = Array.from({ length: cfg.provinces }, () => []);
  for (const c of landCells) {
    if (cellProv[c] >= 0) provCells[cellProv[c]].push(c);
  }
  if (provCells.some((cells) => cells.length < 16)) return null;

  // -- adjacency (needs >= 2 shared border edges to count as passable)
  const borderCount = new Map<number, number>();
  const pairKey = (a: number, b: number) => (a < b ? a * 1000 + b : b * 1000 + a);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (cellProv[c] < 0) continue;
      for (const n of [x < w - 1 ? c + 1 : -1, y < h - 1 ? c + w : -1]) {
        if (n < 0 || cellProv[n] < 0 || cellProv[n] === cellProv[c]) continue;
        const k = pairKey(cellProv[c], cellProv[n]);
        borderCount.set(k, (borderCount.get(k) ?? 0) + 1);
      }
    }
  }
  const neighbors: number[][] = Array.from({ length: cfg.provinces }, () => []);
  for (const [k, count] of borderCount) {
    if (count < 2) continue;
    const a = Math.floor(k / 1000);
    const b = k % 1000;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  neighbors.forEach((ns) => ns.sort((a, b) => a - b));

  // landlocked graph must be connected (sea lanes come later, marches first)
  {
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const p = stack.pop()!;
      for (const n of neighbors[p]) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (seen.size !== cfg.provinces) return null;
  }

  // -- centroids, coastal flags, mean elevation/moisture
  const meta = provCells.map((cells, pi) => {
    let sx = 0;
    let sy = 0;
    let coastal = false;
    let e = 0;
    let m = 0;
    for (const c of cells) {
      const x = c % w;
      const y = (c / w) | 0;
      sx += x;
      sy += y;
      e += elev[c];
      m += nMoist(x, y);
      if (!coastal) {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) coastal = true;
        else if (cellProv[c - 1] < 0 || cellProv[c + 1] < 0 || cellProv[c - w] < 0 || cellProv[c + w] < 0) coastal = true;
      }
    }
    const n = cells.length;
    return { pi, cx: sx / n, cy: sy / n, coastal, elev: e / n, moist: m / n, size: n };
  });

  // -- terrain by quantile rank with flavor guarantees
  const byElev = [...meta].sort((a, b) => b.elev - a.elev);
  const terrain: Terrain[] = new Array(cfg.provinces).fill('meadow');
  const nMountain = Math.max(1, Math.round(cfg.provinces * 0.17));
  const nHills = Math.max(1, Math.round(cfg.provinces * 0.2));
  byElev.slice(0, nMountain).forEach((p) => (terrain[p.pi] = 'mountain'));
  byElev.slice(nMountain, nMountain + nHills).forEach((p) => (terrain[p.pi] = 'hills'));
  const flat = byElev.slice(nMountain + nHills);
  const byMoist = [...flat].sort((a, b) => b.moist - a.moist);
  const nForest = Math.max(1, Math.round(cfg.provinces * 0.2));
  const nMoor = Math.max(1, Math.round(cfg.provinces * 0.15));
  byMoist.slice(0, nForest).forEach((p) => (terrain[p.pi] = 'forest'));
  byMoist.slice(byMoist.length - nMoor).forEach((p) => (terrain[p.pi] = 'moor'));

  // -- special sites (embersites fuel magic; ruins/barrows anchor quests)
  const site: (SiteType | null)[] = new Array(cfg.provinces).fill(null);
  const siteBudget = Math.max(6, Math.round(cfg.provinces * 0.4));
  const wantEmber = Math.max(2, Math.round(cfg.provinces / 7));
  const siteAffinity: Record<SiteType, (t: Terrain, coastal: boolean) => number> = {
    embersite: (t) => (t === 'mountain' ? 3 : t === 'hills' ? 2 : 1),
    ruin: () => 1.5,
    shrine: (t) => (t === 'hills' || t === 'meadow' ? 2 : 1),
    barrow: (t) => (t === 'moor' ? 3 : t === 'hills' ? 1.5 : 0.5),
    forge: (t) => (t === 'mountain' ? 3 : 0.4),
    circle: (t) => (t === 'moor' || t === 'hills' ? 2 : 0.6),
  };
  const shuffled = rng.shuffle(meta.map((m2) => m2.pi));
  let placed = 0;
  // guaranteed minimums first (the Grand Saga needs ruin, embersite, barrow, forge)
  const mustHave: SiteType[] = ['embersite', 'embersite', 'ruin', 'barrow', 'shrine', 'forge'];
  while (mustHave.length < wantEmber + 3) mustHave.push('embersite');
  for (const st of mustHave) {
    const cand = shuffled.filter((pi) => site[pi] === null);
    if (cand.length === 0) break;
    const pick = rng.pickWeighted(cand, (pi) => siteAffinity[st](terrain[pi], meta[pi].coastal));
    site[pick] = st;
    placed++;
  }
  const allSites: SiteType[] = ['embersite', 'ruin', 'shrine', 'barrow', 'forge', 'circle'];
  while (placed < siteBudget) {
    const cand = shuffled.filter((pi) => site[pi] === null);
    if (cand.length === 0) break;
    const st = rng.pick(allSites.filter((s) => s !== 'embersite' || site.filter((x) => x === 'embersite').length < wantEmber + 1));
    const pick = rng.pickWeighted(cand, (pi) => siteAffinity[st](terrain[pi], meta[pi].coastal));
    site[pick] = st;
    placed++;
  }

  // -- rivers: high ground to coast along province borders
  const riverPairs = new Set<number>();
  const riverCount = 1 + Math.floor(cfg.provinces / 9);
  const highlands = meta.filter((m2) => terrain[m2.pi] === 'mountain' || terrain[m2.pi] === 'hills');
  for (let r = 0; r < riverCount && highlands.length > 0; r++) {
    let cur = rng.pick(highlands).pi;
    const visited = new Set<number>([cur]);
    for (let step = 0; step < 10; step++) {
      if (meta[cur].coastal) break;
      const lower = neighbors[cur].filter((n) => !visited.has(n) && meta[n].elev <= meta[cur].elev + 0.02);
      if (lower.length === 0) break;
      const next = lower.reduce((a, b) => (meta[a].elev < meta[b].elev ? a : b));
      riverPairs.add(pairKey(cur, next));
      visited.add(next);
      cur = next;
    }
  }

  // -- sea lanes between coastal provinces that don't share a land border
  const seaLinks: number[][] = Array.from({ length: cfg.provinces }, () => []);
  const coastal = meta.filter((m2) => m2.coastal);
  for (const a of coastal) {
    const candidates = coastal
      .filter((b) => b.pi !== a.pi && !neighbors[a.pi].includes(b.pi))
      .map((b) => ({ pi: b.pi, d: (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2 }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const c of candidates) {
      if (c.d < (w * 0.45) ** 2 && !seaLinks[a.pi].includes(c.pi)) {
        seaLinks[a.pi].push(c.pi);
        seaLinks[c.pi].push(a.pi);
      }
    }
  }
  seaLinks.forEach((ls) => ls.sort((a, b) => a - b));

  // -- names, flavor, folk creeds
  const namer = makeProvinceNamer(rng);
  const provinces: Province[] = meta.map((m2) => {
    const t = terrain[m2.pi];
    const folkWeights: Record<Terrain, [number, number, number]> = {
      meadow: [3, 1.5, 0.8],
      forest: [1, 3, 0.8],
      hills: [1.6, 2.2, 1],
      mountain: [1, 2.6, 1.2],
      moor: [0.7, 1.4, 2.6],
    };
    const [wf, wa, wu] = folkWeights[t];
    const folk = rng.pickWeighted(['flame', 'ash', 'umbra'] as const, (_c, i) => [wf, wa, wu][i]);
    return {
      id: m2.pi,
      name: namer(t),
      flavor: provinceFlavor(rng, t, site[m2.pi]),
      terrain: t,
      coastal: m2.coastal,
      site: site[m2.pi],
      folk,
      cx: m2.cx,
      cy: m2.cy,
      cells: m2.size,
      neighbors: neighbors[m2.pi],
      riverBorders: neighbors[m2.pi].filter((n) => riverPairs.has(pairKey(m2.pi, n))),
      seaLinks: seaLinks[m2.pi],
      owner: -1,
      order: 55,
      prosperity: 1,
      buildings: [],
      buildQueue: null,
      recruitQueue: null,
      seatOf: null,
      capturedTurn: 0,
      mods: [],
    };
  });

  return { w, h, cells: cellProv, provinces };
}

/**
 * Pick well-separated seat (capital) provinces for `count` players.
 * Prefers workable homelands (not mountain/moor) and maximizes spread.
 */
export function pickSeats(rng: Rng, provinces: Province[], count: number): number[] {
  const eligible = provinces.filter((p) => p.terrain !== 'mountain' && p.terrain !== 'moor');
  const pool = eligible.length >= count ? eligible : provinces;
  const dist = (a: Province, b: Province) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  // start from the two most distant eligible provinces
  let bestPair: [Province, Province] = [pool[0], pool[pool.length - 1]];
  let bestD = -1;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const d = dist(pool[i], pool[j]);
      if (d > bestD) {
        bestD = d;
        bestPair = [pool[i], pool[j]];
      }
    }
  }
  const seats: Province[] = count === 1 ? [rng.pick(pool)] : [...bestPair];
  const bordersASeat = (p: Province) => seats.some((s) => s.neighbors.includes(p.id));
  while (seats.length < count) {
    // strongly prefer provinces that don't border an existing seat
    let candidates = pool.filter((p) => !seats.includes(p) && !bordersASeat(p));
    if (candidates.length === 0) candidates = provinces.filter((p) => !seats.includes(p) && !bordersASeat(p));
    if (candidates.length === 0) candidates = provinces.filter((p) => !seats.includes(p));
    if (candidates.length === 0) throw new Error('not enough provinces for seats');
    let best = candidates[0];
    let bestMinD = -1;
    for (const p of candidates) {
      const minD = Math.min(...seats.map((s) => dist(p, s)));
      if (minD > bestMinD) {
        bestMinD = minD;
        best = p;
      }
    }
    seats.push(best);
  }
  return seats.slice(0, count).map((p) => p.id);
}
