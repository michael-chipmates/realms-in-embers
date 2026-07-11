/**
 * MODEL PLAYTEST — Sonnet 5 pulls up a chair.
 *
 *   npx tsx scripts/model-playtest.mjs [--games N] [--max-turns N] [--seat 0]
 *                                      [--model claude-sonnet-5] [--series]
 *                                      [--out dir]
 *
 * One seat is played by a Claude model through the REAL engine: it receives a
 * compact player-legible view each season (never hidden info; fog respected),
 * answers with a JSON list of actions, and every action goes through
 * applyAction like any mortal's. Rejections are fed back the next season.
 * After each game the model files a structured debrief (fun, clarity,
 * dominant lines, confusions, suggestions) — the point of the exercise.
 *
 * Reads .anthropic_token (gitignored). Never at game runtime; tooling only.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/engine.ts';
import { aiTakeTurn } from '../src/engine/ai.ts';
import { previewBattle } from '../src/engine/combat.ts';
import { moveTargets } from '../src/engine/actions.ts';
import { incomeReport, leaderId } from '../src/engine/economy.ts';
import { attitudeOf } from '../src/engine/diplo.ts';
import { sagaGate, questStat } from '../src/engine/quests.ts';
import { heroDerived } from '../src/engine/heroFx.ts';
import { heroesOf, provincesOf, armiesOf, getStance, lordOf, seenBy } from '../src/engine/helpers.ts';
import { dominionShareAt } from '../src/engine/victory.ts';
import { LORD_BY_ID } from '../src/engine/content/lords.ts';
import { EVENT_BY_ID } from '../src/engine/content/events.ts';
import { QUESTS } from '../src/engine/content/quests.ts';
import { SPELLS } from '../src/engine/content/spells.ts';
import { UNITS, RECRUITABLE } from '../src/engine/content/units.ts';
import { BUILDINGS, BUILD_ORDER } from '../src/engine/content/world.ts';
import { unitCostFor, buildingCostFor } from '../src/engine/economy.ts';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const GAMES = parseInt(arg('games', '1'), 10);
const MAX_TURNS = parseInt(arg('max-turns', '60'), 10);
const SEAT = parseInt(arg('seat', '0'), 10);
const MODEL = arg('model', 'claude-sonnet-5');
const OUT = arg('out', 'playtest-out');
const SERIES = process.argv.includes('--series');

const KEY = readFileSync(new URL('../.anthropic_token', import.meta.url), 'utf8').trim();

// ----------------------------------------------------------------- the view

function fmtUnits(units) {
  const by = {};
  for (const u of units) by[u.type] = (by[u.type] ?? 0) + 1;
  return Object.entries(by).map(([t, n]) => `${n}×${UNITS[t].name}${units.find((u) => u.type === t && u.vet > 0) ? '(vet)' : ''}`).join(', ');
}

function view(state, pid, rejections) {
  const me = state.players[pid];
  const lord = LORD_BY_ID[me.lordId];
  const report = incomeReport(state, pid);
  const visible = state.settings.fogOfWar ? seenBy(state, pid) : null;
  const L = [];
  L.push(`SEASON ${state.turn} of ${state.victory.maxTurns}. You are ${lord.name} (${lord.creed}). Legacy: ${lord.perk.desc}`);
  const sigCd = me.signatureCooldownLeft ?? 0;
  L.push(`SIGNATURE — ${lord.signature.name}: ${lord.signature.desc} ${sigCd === 0 ? 'READY NOW' : `returns in ${sigCd} seasons`}${lord.signature.target === 'rival' ? ' (needs "targetPlayer")' : lord.signature.target === 'enemyProvince' ? ' (needs "province" bordering your realm)' : ''}.`);
  L.push(`Treasury ${Math.round(me.gold)} gold (net ${report.net >= 0 ? '+' : ''}${report.net}/season). Emberlight ${me.emberlight}. Tax: ${me.tax}.`);
  const needed = Math.round(dominionShareAt(state) * 100);
  L.push(`VICTORY RACE — dominion needs ${needed}% of ${state.provinces.length} provinces for 3 seasons${state.turn > 38 ? ' (eroding each season!)' : ''}; golden age needs richest+900 gold+order 65 for 4; legend needs saga chapter 5 (you: ${me.sagaChapter}/5).`);

  L.push(`\nYOUR PROVINCES (${provincesOf(state, pid).length}):`);
  for (const p of provincesOf(state, pid)) {
    const q = [p.buildQueue ? `building ${p.buildQueue.id}` : '', p.recruitQueue ? `mustering ${p.recruitQueue.unit}` : ''].filter(Boolean).join(', ');
    L.push(`  #${p.id} ${p.name} (${p.terrain}${p.site ? ', ' + p.site : ''}${p.seatOf === pid ? ', YOUR SEAT' : ''}): order ${Math.round(p.order)}, buildings [${p.buildings.join(',') || 'none'}]${q ? ' — ' + q : ''}`);
  }

  L.push(`\nYOUR ARMIES:`);
  for (const a of armiesOf(state, pid)) {
    L.push(`  army#${a.id} at #${a.province} ${state.provinces[a.province].name}${a.moved ? ' (already marched)' : ''}: ${fmtUnits(a.units)}${a.heroIds.length ? ` + heroes [${a.heroIds.map((h) => state.heroes[h]?.name).join(',')}]` : ''}`);
    if (!a.moved && a.units.length > 0) {
      const targets = moveTargets(state, a).slice(0, 8);
      for (const t of targets) {
        const p = state.provinces[t.to];
        if (t.hostile) {
          const pv = previewBattle(state, a.id, t.to, t.viaSea, 60);
          L.push(`    -> can ATTACK #${t.to} ${p.name}${t.viaSea ? ' (by sea)' : ''}: ${pv ? Math.round(pv.winChance * 100) + '% to win, ~' + Math.round(pv.aExpectedLoss * 100) + '% losses' : 'no preview'}`);
        } else {
          const label = p.owner === -1
            ? ' (free province — entering claims it)'
            : p.owner === pid ? '' : ` (${LORD_BY_ID[state.players[p.owner].lordId].name}'s land — treaty passage only, no capture)`;
          L.push(`    -> can move to #${t.to} ${p.name}${label}${t.viaSea ? ' (by sea)' : ''}`);
        }
      }
    }
  }

  L.push(`\nYOUR HEROES:`);
  for (const hh of heroesOf(state, pid)) {
    const d = heroDerived(state, hh);
    L.push(`  hero#${hh.id} ${hh.name} (${hh.cls} L${hh.level}, ${hh.status}): might ${d.might} lore ${d.lore} guile ${d.guile}${hh.levelChoices.length ? ` — MUST CHOOSE SKILL: ${hh.levelChoices.join(' | ')}` : ''}${hh.armyId !== null ? ` (with army#${hh.armyId})` : ' (at court)'}`);
  }
  if (me.courtOffers.length) {
    L.push(`  PETITIONERS: ${me.courtOffers.map((o, i) => `idx${i}: ${o.name} (${o.cls} L${o.level}, m${o.might}/l${o.lore}/g${o.guile}/ld${o.leadership}, ${o.cost}g)`).join('; ')}`);
  }

  const offers = state.questOffers[pid] ?? [];
  if (offers.length) {
    L.push(`\nQUEST OFFERS: ${offers.map((o) => {
      const def = QUESTS[o.defId];
      return `${o.defId}@#${o.province} (tier${def.tier} ${def.stat} vs ${def.dc}${def.minLevel ? `, L${def.minLevel}+` : ''})`;
    }).join('; ')}`);
  }
  const gate = sagaGate(state, pid);
  if (gate.available) {
    L.push(`SAGA OPEN: ${gate.available.def.id} at province(s) ${gate.available.venues.join(',')} (hero L${gate.available.def.minLevel}+, stat ${gate.available.def.stat} vs ${gate.available.def.dc})`);
  } else if (gate.reason) L.push(`SAGA CLOSED: ${gate.reason}`);

  L.push(`\nSPELLS KNOWN: ${me.spells.map((s) => `${s} (${SPELLS[s].kind}${SPELLS[s].target !== 'none' ? ', needs province' : ''})`).join('; ') || 'none'}`);
  if (me.rite) L.push(`RITE IN PROGRESS: learning ${me.rite.spellId ?? me.rite.spell ?? JSON.stringify(me.rite)} — pledge emberlight to speed it.`);
  if (me.riteOffers.length) L.push(`RITES OFFERED (startRite to begin learning): ${me.riteOffers.join(', ')}`);

  L.push(`\nRIVALS:`);
  for (const o of state.players) {
    if (o.id === pid || !o.alive) continue;
    const att = attitudeOf(state, o.id, pid).total;
    const oSig = LORD_BY_ID[o.lordId].signature;
    L.push(`  player${o.id} ${LORD_BY_ID[o.lordId].name} (${getStance(state, pid, o.id)}): holds ${provincesOf(state, o.id).length} provinces, regards you ${att >= 0 ? '+' : ''}${att}, saga ${o.sagaChapter}/5, signature ${oSig.name} ${(o.signatureCooldownLeft ?? 0) === 0 ? 'ready' : `in ${o.signatureCooldownLeft}`}`);
  }
  const lead = leaderId(state);
  if (lead !== null) L.push(`  Realm leader by land: player${lead}${lead === pid ? ' (YOU — expect a coalition if you pass 40%)' : ''}`);

  for (const proposal of state.proposals.filter((p) => p.to === pid)) {
    L.push(`\nENVOY WAITING proposal#${proposal.id}: ${proposal.note} (respond accept:true/false)`);
  }
  for (const ev of (state.pendingEvents ?? []).filter((e) => e.player === pid)) {
    const def = EVENT_BY_ID[ev.defId];
    if (!def) continue;
    let text = '';
    try { text = def.text({ state, rng: null, pid, province: ev.province, heroId: ev.heroId, effects: [] }); } catch { text = def.title; }
    const chc = def.choices.map((c, i) => `choiceIdx ${i}: "${c.label}" (${c.preview})`).join(' | ');
    L.push(`\nEVENT AWAITING CHOICE event#${ev.id} "${def.title}": ${text}\n  ${chc}`);
  }

  if (rejections.length) {
    L.push(`\nREJECTED LAST SEASON (learn from these): ${rejections.map((r) => `${r.action.t}: ${r.error}`).join('; ')}`);
  }

  const recruitables = RECRUITABLE.slice(0, 8).map((u) => `${u}(${unitCostFor(state, pid, u).cost}g)`).join(', ');
  L.push(`\nACTION COOKBOOK (JSON, one per line of your "actions" array; ids from above):
  {"t":"moveArmy","armyId":N,"to":P}                      — march/attack (add "support":[ids] for combined assault, "fervor":true for +12% at 6 emberlight)
  {"t":"recruit","province":P,"unit":"militia"}            — e.g. ${recruitables}
  {"t":"build","province":P,"building":"farm"}             — ${BUILD_ORDER.slice(0, 8).map((b) => `${b}(${buildingCostFor ? buildingCostFor(state, pid, b).cost : BUILDINGS[b].cost}g)`).join(', ')}…
  {"t":"setTax","level":"light|fair|harsh"}
  {"t":"hireHero","offerIdx":N} · {"t":"chooseSkill","heroId":N,"skill":"id"} · {"t":"attachHero","heroId":N,"armyId":N or null}
  {"t":"startQuest","heroId":N,"questDefId":"id","province":P}
  {"t":"startRite","spellId":"id"} · {"t":"pledgeEmberlight","amount":N} · {"t":"castSpell","spell":"id","province":P?}
  {"t":"diplomacy","kind":"declareWar|offerPeace|offerPact|offerAlliance|gift|demand|joinWar","target":playerN,"gold":N?,"against":playerN?}
  {"t":"respond","proposalId":N,"accept":true}
  {"t":"signature","targetPlayer":playerN?,"province":P?}  — your lord's signature order (see SIGNATURE line above; only when READY)
  {"t":"eventChoice","eventId":N,"choiceIdx":N}
Do NOT include endTurn — it is automatic after your actions.`);
  return L.join('\n');
}

// ----------------------------------------------------------------- the API

async function claude(system, messages, maxTokens) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
    });
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.content.find((b) => b.type === 'text')?.text ?? '';
  }
  throw new Error('anthropic: exhausted retries');
}

function extractJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
  try {
    const parsed = JSON.parse(m[1].trim());
    return parsed;
  } catch {
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr) { try { return { actions: JSON.parse(arr[0]) }; } catch { /* fall through */ } }
    return null;
  }
}

const SYSTEM = `You are playtesting "Realms in Embers", a turn-based fantasy strategy game, by PLAYING IT WELL — pursue victory ruthlessly, exploit anything exploitable, and note what confuses or delights you.
Each season you receive the full legible state and reply with JSON only:
{"plan":"one sentence of intent","actions":[...up to 10 actions...],"note":"anything confusing/broken/fun this season (or empty)"}
Numbers must reference ids from the state view. Be decisive; empty actions is legal but lazy.`;

const DEBRIEF_PROMPT = `The game has ended. File your playtest debrief as JSON only:
{"fun":1-10,"clarity":1-10,"outcome_felt_earned":true/false,
 "dominant_strategy":"what line of play dominated, if any",
 "signatures_read_clearly":true/false,
 "signatures_created_decisions":"did your signature (and reading rivals' signatures) change real choices? one sentence",
 "victory_race_visible":true/false,
 "confusions":["..."],"delights":["..."],
 "suggestions":["3-5 concrete design changes"],
 "would_play_again":true/false}`;

// ----------------------------------------------------------------- one game

async function playGame(gameIdx, seriesNotes) {
  const seed = `playtest-${MODEL.replaceAll('.', '-')}-${gameIdx}`;
  const settings = {
    seed, mapSize: 'medium', maxTurns: Math.min(60, MAX_TURNS), fogOfWar: false, veteranChronicle: false,
    victoryPaths: ['conquest', 'dominion', 'goldenAge', 'legend'],
    players: [0, 1, 2, 3].map((i) => ({ kind: 'ai', lordId: 'random', difficulty: 'knight' })),
  };
  const { state } = createGame(settings);
  // seat SEAT is "human": the engine treats kind==='human' as externally driven
  state.players[SEAT].kind = 'human';
  state.settings.players[SEAT].kind = 'human';

  const transcript = [];
  let rejections = [];
  let totalActions = 0, rejectedActions = 0;
  const messages = [];
  if (seriesNotes) messages.push({ role: 'user', content: `Your notes from previous games:\n${seriesNotes}` }, { role: 'assistant', content: 'Noted. Ready for the state.' });

  let guard = 0;
  while (state.phase !== 'ended' && state.turn <= MAX_TURNS && guard++ < 400) {
    if (state.players[state.current].kind === 'ai') {
      aiTakeTurn(state);
      continue;
    }
    const v = view(state, SEAT, rejections);
    rejections = [];
    // keep the rolling window small: view + last exchange only
    const winMessages = [...messages.slice(-4), { role: 'user', content: v }];
    let reply;
    try {
      reply = await claude(SYSTEM, winMessages, 900);
    } catch (e) {
      console.error(`turn ${state.turn}: API failed (${e.message}); ending turn`);
      applyAction(state, { t: 'endTurn' });
      continue;
    }
    const parsed = extractJson(reply) ?? { actions: [] };
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 10) : [];
    const applied = [];
    for (const action of actions) {
      if (!action || typeof action.t !== 'string' || action.t === 'endTurn' || action.t === 'concede') continue;
      totalActions++;
      const result = applyAction(state, action);
      applied.push({ action, ok: result.ok, error: result.error });
      if (!result.ok) { rejectedActions++; rejections.push({ action, error: result.error ?? '?' }); }
      if (state.phase === 'ended') break;
    }
    transcript.push({ turn: state.turn, plan: parsed.plan, note: parsed.note, applied });
    if (parsed.note) console.log(`  [s${state.turn}] note: ${parsed.note}`);
    messages.push({ role: 'user', content: v }, { role: 'assistant', content: reply });
    if (state.phase !== 'ended') applyAction(state, { t: 'endTurn' });
  }

  // ---- debrief
  const me = state.players[SEAT];
  const outcome = state.victory.winner === SEAT
    ? `YOU WON by ${state.victory.winPath}`
    : state.victory.winner !== null
      ? `${LORD_BY_ID[state.players[state.victory.winner].lordId].name} won by ${state.victory.winPath}; you ${me.alive ? 'survived' : 'were eliminated'}`
      : `the game reached the cap unresolved`;
  const debriefRaw = await claude(SYSTEM, [
    ...messages.slice(-6),
    { role: 'user', content: `${outcome} (season ${state.turn}).\n\n${DEBRIEF_PROMPT}` },
  ], 900);
  const debrief = extractJson(debriefRaw) ?? { raw: debriefRaw };

  const summary = {
    seed, model: MODEL, seat: SEAT, outcome, seasons: state.turn,
    winner: state.victory.winner, winPath: state.victory.winPath,
    myProvincesAtEnd: provincesOf(state, SEAT).length,
    actionStats: { total: totalActions, rejected: rejectedActions, rejectionRate: totalActions ? +(rejectedActions / totalActions).toFixed(3) : 0 },
    debrief,
    notes: transcript.filter((t) => t.note).map((t) => ({ turn: t.turn, note: t.note })),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${seed}.json`, JSON.stringify({ summary, transcript }, null, 2));
  return summary;
}

// ----------------------------------------------------------------- series

let notes = '';
const summaries = [];
for (let g = 0; g < GAMES; g++) {
  console.log(`\n=== playtest game ${g + 1}/${GAMES} (${MODEL}) ===`);
  const s = await playGame(g, SERIES ? notes : '');
  summaries.push(s);
  console.log(`${s.outcome} in ${s.seasons} seasons; rejection rate ${(s.actionStats.rejectionRate * 100).toFixed(1)}%`);
  console.log(`debrief: fun ${s.debrief.fun}/10, clarity ${s.debrief.clarity}/10`);
  for (const sug of s.debrief.suggestions ?? []) console.log(`  suggestion: ${sug}`);
  if (SERIES && g < GAMES - 1) {
    notes = await claude('You are keeping strategy notes between playtest games. Reply with plain text notes only, max 150 words.', [
      { role: 'user', content: `Game result: ${s.outcome}. Your debrief: ${JSON.stringify(s.debrief)}. Previous notes: ${notes || '(none)'}. Revise your notes.` },
    ], 300);
  }
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summaries, null, 2));
console.log(`\nwritten: ${OUT}/summary.json`);
