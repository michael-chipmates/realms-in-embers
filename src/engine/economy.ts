/**
 * Gold, Emberlight, order, prosperity — always itemized.
 * Every function that produces a number can also produce the labeled lines
 * behind it; the UI shows those lines verbatim. If a number can't explain
 * itself here, it doesn't ship.
 */
import { BUILDINGS, CREEDS, COASTAL_INCOME, TERRAIN } from './content/world';
import { UNITS } from './content/units';
import { HERO_CLASSES } from './heroes';
import { armiesIn, armiesOf, clamp, creedOf, heroesOf, lordOf, provincesOf } from './helpers';
import type { GameState, IncomeReport, Player, PlayerId, Province, TaxLevel } from './types';

export const TAX_FX: Record<TaxLevel, { mult: number; order: number; label: string }> = {
  light: { mult: 0.75, order: 2, label: 'Light tithes — three parts in four collected; the villages bless your name.' },
  fair: { mult: 1.0, order: 0, label: 'Fair tithes — the customary due, grumbled at customarily.' },
  harsh: { mult: 1.35, order: -3, label: 'Harsh tithes — coin now, resentment on an installment plan.' },
};

export interface Itemized {
  total: number;
  lines: { label: string; amount: number }[];
}

// ------------------------------------------------------------------- gold

/** Gold from one province, fully itemized (before realm-level handicaps). */
export function provinceIncome(state: GameState, p: Province): Itemized {
  const lines: { label: string; amount: number }[] = [];
  if (p.owner < 0) return { total: 0, lines };
  const owner = state.players[p.owner];
  const lord = lordOf(owner);

  let base = TERRAIN[p.terrain].income;
  lines.push({ label: `${TERRAIN[p.terrain].name} yield`, amount: base });
  if (p.coastal) {
    lines.push({ label: 'Coastal fisheries', amount: COASTAL_INCOME });
    base += COASTAL_INCOME;
  }
  const fx = lord.perk.fx;
  if (fx.incomeTerrainId === p.terrain && fx.incomeTerrainAdd) {
    lines.push({ label: `${lord.perk.label} (${lord.name})`, amount: fx.incomeTerrainAdd });
    base += fx.incomeTerrainAdd;
  }
  for (const b of p.buildings) {
    const def = BUILDINGS[b];
    if (def.incomeAdd) {
      let add = def.incomeAdd;
      if (b === 'harbor' && fx.harborIncomeAdd) add += fx.harborIncomeAdd;
      lines.push({ label: def.name, amount: add });
      base += add;
    }
  }
  for (const mod of p.mods) {
    if (mod.income) {
      lines.push({ label: mod.label, amount: mod.income });
      base += mod.income;
    }
  }

  let mult = 1;
  const multLines: { label: string; factor: number }[] = [];
  for (const b of p.buildings) {
    const def = BUILDINGS[b];
    if (def.incomeMult) {
      mult += def.incomeMult;
      multLines.push({ label: def.name, factor: def.incomeMult });
    }
  }
  if (p.seatOf === p.owner && fx.capitalIncomePct) {
    mult += fx.capitalIncomePct / 100;
    multLines.push({ label: lord.perk.label, factor: fx.capitalIncomePct / 100 });
  }
  const orderFactor = 0.5 + p.order / 200; // 0.5 at order 0, 1.0 at order 100
  const tax = TAX_FX[owner.tax];
  const total = base * mult * p.prosperity * orderFactor * tax.mult;

  for (const ml of multLines) {
    lines.push({ label: `${ml.label} (+${Math.round(ml.factor * 100)}%)`, amount: base * ml.factor });
  }
  lines.push({ label: `Prosperity ×${p.prosperity.toFixed(2)}`, amount: base * mult * (p.prosperity - 1) });
  lines.push({ label: `Order ${Math.round(p.order)} (×${orderFactor.toFixed(2)})`, amount: base * mult * p.prosperity * (orderFactor - 1) });
  lines.push({ label: `${owner.tax === 'light' ? 'Light' : owner.tax === 'fair' ? 'Fair' : 'Harsh'} tithes (×${tax.mult})`, amount: base * mult * p.prosperity * orderFactor * (tax.mult - 1) });

  return { total: Math.round(total), lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount) })) };
}

export function upkeepOf(state: GameState, pid: PlayerId): Itemized {
  const lines: { label: string; amount: number }[] = [];
  const counts = new Map<string, { n: number; cost: number }>();
  for (const army of armiesOf(state, pid)) {
    for (const u of army.units) {
      const def = UNITS[u.type];
      const cur = counts.get(u.type) ?? { n: 0, cost: 0 };
      cur.n += 1;
      cur.cost += def.upkeep;
      counts.set(u.type, cur);
    }
  }
  let total = 0;
  for (const [type, { n, cost }] of counts) {
    lines.push({ label: `${n}× ${UNITS[type as keyof typeof UNITS].namePlural}`, amount: -cost });
    total += cost;
  }
  return { total, lines };
}

export function wagesOf(state: GameState, pid: PlayerId): Itemized {
  const lines: { label: string; amount: number }[] = [];
  let total = 0;
  for (const hero of heroesOf(state, pid)) {
    const wage = HERO_CLASSES[hero.cls].wage + Math.floor(hero.level * 2);
    lines.push({ label: `${hero.name} (level ${hero.level})`, amount: -wage });
    total += wage;
  }
  return { total, lines };
}

export function incomeReport(state: GameState, pid: PlayerId): IncomeReport {
  const player = state.players[pid];
  const lines: { label: string; amount: number }[] = [];
  let gross = 0;
  for (const p of provincesOf(state, pid)) {
    const inc = provinceIncome(state, p);
    gross += inc.total;
    lines.push({ label: p.name, amount: inc.total });
  }
  if (player.handicap.incomeMult !== 1) {
    const delta = Math.round(gross * (player.handicap.incomeMult - 1));
    lines.push({ label: `Handicap (${player.handicap.incomeMult > 1 ? '+' : ''}${Math.round((player.handicap.incomeMult - 1) * 100)}%)`, amount: delta });
    gross += delta;
  }
  const upkeep = upkeepOf(state, pid);
  const wages = wagesOf(state, pid);
  return {
    gold: gross,
    upkeep: upkeep.total,
    wages: wages.total,
    net: gross - upkeep.total - wages.total,
    emberlight: emberlightIncome(state, pid).total,
    lines: [...lines, ...upkeep.lines, ...wages.lines],
  };
}

// -------------------------------------------------------------- emberlight

export function emberlightIncome(state: GameState, pid: PlayerId): Itemized {
  const lines: { label: string; amount: number }[] = [];
  let total = 1;
  lines.push({ label: 'Embers of the hearth (base)', amount: 1 });
  for (const p of provincesOf(state, pid)) {
    const hasSpire = p.buildings.includes('mageTower');
    if (hasSpire) {
      const amt = 2 + (p.site === 'embersite' ? 2 : 0);
      lines.push({ label: `Ember Spire at ${p.name}${p.site === 'embersite' ? ' (ember-site)' : ''}`, amount: amt });
      total += amt;
    } else if (p.site === 'embersite') {
      lines.push({ label: `Ember-site at ${p.name} (untapped)`, amount: 1 });
      total += 1;
    }
  }
  let adepts = 0;
  for (const army of armiesOf(state, pid)) {
    for (const u of army.units) if (UNITS[u.type].traits.includes('caster')) adepts++;
  }
  if (adepts > 0) {
    lines.push({ label: `${adepts}× Ember Adepts`, amount: adepts });
    total += adepts;
  }
  let magi = 0;
  for (const hero of heroesOf(state, pid)) {
    if (hero.cls === 'magus' && hero.status !== 'dead') magi += 2;
  }
  if (magi > 0) {
    lines.push({ label: 'Magus at court', amount: magi });
    total += magi;
  }
  return { total, lines };
}

// ------------------------------------------------------------------ order

/** Per-turn order drift for a province, itemized. */
export function orderDrift(state: GameState, p: Province): Itemized {
  const lines: { label: string; amount: number }[] = [];
  if (p.owner < 0) return { total: 0, lines };
  const owner = state.players[p.owner];
  const lord = lordOf(owner);

  const tax = TAX_FX[owner.tax];
  if (tax.order !== 0) lines.push({ label: `${owner.tax[0].toUpperCase()}${owner.tax.slice(1)} tithes`, amount: tax.order });

  if (p.buildings.includes('temple')) {
    const amt = 2 + (creedOf(owner) === 'flame' ? 1 : 0);
    lines.push({ label: `Hearthshrine${creedOf(owner) === 'flame' ? ' (Flame creed)' : ''}`, amount: amt });
  }
  if (lord.perk.fx.orderAll) {
    lines.push({ label: lord.perk.label, amount: lord.perk.fx.orderAll });
  }

  const garrison = armiesIn(state, p.id).filter((a) => a.owner === p.owner);
  const companies = garrison.reduce((n, a) => n + a.units.length, 0);
  if (companies > 0) {
    const amt = Math.min(3, Math.ceil(companies / 2));
    lines.push({ label: `Garrison (${companies} ${companies === 1 ? 'company' : 'companies'})`, amount: amt });
  }

  const sinceCapture = state.turn - p.capturedTurn;
  if (p.capturedTurn > 0 && sinceCapture < 5) {
    lines.push({ label: `Recently conquered (${5 - sinceCapture} more ${5 - sinceCapture === 1 ? 'season' : 'seasons'})`, amount: -(6 - sinceCapture) });
  }

  if (p.folk !== creedOf(owner)) {
    lines.push({ label: `Folk keep ${CREEDS[p.folk].name} ways`, amount: -1 });
  }

  for (const mod of p.mods) {
    if (mod.order) lines.push({ label: mod.label, amount: mod.order });
  }

  // strain & defiance (pacing pressure, always visible)
  const strain = strainOf(state, p.owner);
  if (strain !== 0) lines.push({ label: `Strain of rule (${provincesOf(state, p.owner).length} provinces)`, amount: strain });
  if (isDefiant(state, p.owner)) lines.push({ label: 'Defiant hearts (underdog)', amount: 2 });

  // order decays gently toward 50 from above (contentment fades)
  if (p.order > 78) lines.push({ label: 'Peace breeds complacency', amount: -1 });

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { total, lines };
}

/** Leader's over-extension penalty: 0, -1 or -2 order per province. */
export function strainOf(state: GameState, pid: PlayerId): number {
  const total = state.provinces.length;
  const owned = provincesOf(state, pid).length;
  const share = owned / total;
  if (share >= 0.5) return -2;
  if (share >= 0.34 && leaderId(state) === pid) return -1;
  return 0;
}

/** Trailing players get visible catch-up (order + recruit discount). */
export function isDefiant(state: GameState, pid: PlayerId): boolean {
  const lead = leaderId(state);
  if (lead === null || lead === pid) return false;
  const leaderProvinces = provincesOf(state, lead).length;
  const mine = provincesOf(state, pid).length;
  return mine * 2 <= leaderProvinces && state.players[pid].alive;
}

export function leaderId(state: GameState): PlayerId | null {
  let best: PlayerId | null = null;
  let bestCount = -1;
  let bestIncome = -1;
  for (const player of state.players) {
    if (!player.alive) continue;
    const count = provincesOf(state, player.id).length;
    const income = count > 0 ? incomeGross(state, player.id) : 0;
    if (count > bestCount || (count === bestCount && income > bestIncome)) {
      best = player.id;
      bestCount = count;
      bestIncome = income;
    }
  }
  return best;
}

function incomeGross(state: GameState, pid: PlayerId): number {
  let sum = 0;
  for (const p of provincesOf(state, pid)) sum += provinceIncome(state, p).total;
  return sum;
}

// -------------------------------------------------------------- prosperity

export function prosperityStep(state: GameState, p: Province): number {
  if (p.owner < 0) return p.prosperity;
  const target = clamp(0.7 + p.order / 200, 0.7, 1.2);
  const owner = state.players[p.owner];
  const rate = creedOf(owner) === 'ash' ? 0.15 : 0.1; // Ash passive: land recovers faster
  return clamp(p.prosperity + (target - p.prosperity) * rate, 0.5, 1.3);
}

// ------------------------------------------------------------ costs (buy)

export function unitCostFor(state: GameState, pid: PlayerId, unitType: keyof typeof UNITS): { cost: number; lines: string[] } {
  const def = UNITS[unitType];
  const player = state.players[pid];
  const lord = lordOf(player);
  let cost = def.cost;
  const lines: string[] = [];
  if (lord.perk.fx.unitDiscountId === unitType && lord.perk.fx.unitDiscountPct) {
    cost = Math.round(cost * (1 - lord.perk.fx.unitDiscountPct / 100));
    lines.push(`${lord.perk.label}: −${lord.perk.fx.unitDiscountPct}%`);
  }
  if (isDefiant(state, pid)) {
    cost = Math.round(cost * 0.85);
    lines.push('Defiant hearts: −15%');
  }
  return { cost, lines };
}

export function buildingCostFor(state: GameState, pid: PlayerId, buildingId: keyof typeof BUILDINGS): { cost: number; lines: string[] } {
  const def = BUILDINGS[buildingId];
  const player = state.players[pid];
  const lord = lordOf(player);
  let cost = def.cost;
  const lines: string[] = [];
  if (lord.perk.fx.buildingDiscountId === buildingId && lord.perk.fx.buildingDiscountPct) {
    cost = Math.round(cost * (1 - lord.perk.fx.buildingDiscountPct / 100));
    lines.push(`${lord.perk.label}: −${lord.perk.fx.buildingDiscountPct}%`);
  }
  if (lord.perk.fx.wallDiscountPct && (buildingId === 'walls1' || buildingId === 'walls2' || buildingId === 'walls3')) {
    cost = Math.round(cost * (1 - lord.perk.fx.wallDiscountPct / 100));
    lines.push(`${lord.perk.label}: −${lord.perk.fx.wallDiscountPct}%`);
  }
  return { cost, lines };
}
