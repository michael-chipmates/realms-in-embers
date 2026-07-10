/**
 * The saga export: Osperan's chronicle, bound and finished — a readable
 * account of the whole campaign, built from the deterministic record.
 */
import { LORD_BY_ID } from '../engine/content/lords';
import { ARTIFACTS } from '../engine/content/artifacts';
import { chronicleScore } from '../engine/victory';
import type { GameState } from '../engine/types';

export function buildSaga(state: GameState): string {
  const lines: string[] = [];
  const width = 64;
  const center = (s: string): string => s.length >= width ? s : ' '.repeat(Math.floor((width - s.length) / 2)) + s;

  lines.push(center('THE CHRONICLE OF THE SUNDERED AGE'));
  lines.push(center('being a true account of the war for the Embermark'));
  lines.push(center(`as set down by Osperan the Unresting, seed “${state.seed}”`));
  lines.push('');
  lines.push(center('· ❧ ·'));
  lines.push('');

  // the claimants
  lines.push('THE CLAIMANTS');
  for (const player of state.players) {
    const lord = LORD_BY_ID[player.lordId];
    lines.push(`  ${lord.name}, ${lord.epithet} — of the ${lord.creed === 'flame' ? 'Flame' : lord.creed === 'ash' ? 'Ash' : 'Umbra'}${player.kind === 'human' ? ' (a mortal hand at the table)' : ''}`);
  }
  lines.push('');

  // the chronicle proper, in acts
  const actLength = Math.max(8, Math.ceil(state.turn / 3));
  const acts: { title: string; entries: typeof state.chronicle }[] = [
    { title: 'ACT I — THE KINDLING', entries: [] },
    { title: 'ACT II — THE BLAZE', entries: [] },
    { title: 'ACT III — THE RECKONING', entries: [] },
  ];
  for (const entry of state.chronicle) {
    if (entry.privateTo !== undefined) continue;
    if (entry.kind === 'teaching') continue;
    const act = Math.min(2, Math.floor((entry.turn - 1) / actLength));
    acts[act].entries.push(entry);
  }
  for (const act of acts) {
    if (act.entries.length === 0) continue;
    lines.push(act.title);
    lines.push('');
    let lastTurn = -1;
    for (const entry of act.entries) {
      // keep the saga readable: ceremonies and the load-bearing kinds in full
      const keep = entry.ceremony || entry.kind === 'war' || entry.kind === 'hero' || entry.kind === 'diplomacy' || entry.kind === 'realm' || entry.kind === 'event' || entry.kind === 'magic';
      if (!keep) continue;
      if (entry.turn !== lastTurn) {
        lines.push(`— Season ${entry.turn} —`);
        lastTurn = entry.turn;
      }
      lines.push(wrap(entry.text, width));
      lines.push('');
    }
  }

  // the close
  lines.push(center('· ❧ ·'));
  lines.push('');
  lines.push('HOW IT ENDED');
  const winner = state.victory.winner;
  if (winner !== null) {
    const lord = LORD_BY_ID[state.players[winner].lordId];
    const how: Record<string, string> = {
      conquest: 'by conquest, the last banner standing over the ashes',
      dominion: 'by dominion, the realm held until no argument remained',
      goldenAge: 'by golden age, the war ended with full granaries instead of graves',
      legend: 'by legend, the Ember Throne rekindled after forty years of dark',
      chronicle: 'by the judgment of the Chronicle, when the page ran out',
    };
    lines.push(wrap(`The realm fell to ${lord.name}, ${lord.epithet}, ${how[state.victory.winPath ?? 'chronicle']}, in season ${state.turn}.`, width));
  }
  lines.push('');

  // the roll of the fallen — every hero who did not live to see the peace
  const fallen = Object.values(state.heroes)
    .filter((hh) => hh.status === 'dead')
    .sort((a, b) => (a.diedTurn ?? 0) - (b.diedTurn ?? 0));
  if (fallen.length > 0) {
    lines.push('THE ROLL OF THE FALLEN');
    lines.push(wrap('I rule these margins wide on purpose, for names like these.', width));
    lines.push('');
    for (const hh of fallen) {
      const owner = LORD_BY_ID[state.players[hh.owner].lordId];
      lines.push(wrap(`  ${hh.name}, ${hh.epithet} — ${owner.name}'s ${hh.cls}, level ${hh.level}; fell — ${hh.deathCause ?? 'in the war'}, season ${hh.diedTurn ?? '?'}.`, width));
    }
    lines.push('');
  }

  // the vaults of the age — where the old things ended up, and who held them
  const artifacts = Object.values(state.artifacts).sort((a, b) => a.foundTurn - b.foundTurn);
  if (artifacts.length > 0) {
    lines.push('WHERE THE OLD THINGS CAME TO REST');
    for (const inst of artifacts) {
      const def = ARTIFACTS[inst.defId];
      if (!def) continue;
      const holder = artifactHolder(state, inst.id);
      const provenance = inst.history.length > 1
        ? `; it passed through the hands of ${inst.history.join(', then of ')}`
        : '';
      lines.push(wrap(`  ${def.name} — surfaced in season ${inst.foundTurn}${provenance}${holder ? `; it rests with ${holder}` : ''}.`, width));
    }
    lines.push('');
  }

  lines.push('THE FINAL RECKONING');
  const standings = state.players
    .map((p) => ({ p, score: chronicleScore(state, p.id).total }))
    .sort((a, b) => b.score - a.score);
  for (const { p, score } of standings) {
    const lord = LORD_BY_ID[p.lordId];
    lines.push(`  ${lord.name.padEnd(28)} ${String(score).padStart(5)} points${p.alive ? '' : '   (banner fallen)'}`);
  }
  lines.push('');

  // each claimant's epitaph, in their own words
  lines.push('THE CLAIMANTS, IN THEIR OWN WORDS');
  for (const { p } of standings) {
    const lord = LORD_BY_ID[p.lordId];
    const spoke = p.id === winner ? lord.lines.victory : lord.lines.defeat;
    lines.push(wrap(`  ${lord.name}: "${spoke}"`, width));
  }
  lines.push('');
  lines.push(wrap('Here the ink ends. Whoever reads this: the fire is yours now. Mind it. — O.', width));
  return lines.join('\n');
}

function artifactHolder(state: GameState, instId: number): string | null {
  for (const p of state.players) {
    if (p.vault.includes(instId)) return `${LORD_BY_ID[p.lordId].name}'s vault`;
  }
  for (const hh of Object.values(state.heroes)) {
    if (hh.status === 'dead') continue;
    const slots = hh.artifacts;
    if (slots.weapon === instId || slots.armor === instId || slots.trinket === instId) {
      return `${hh.name}, ${hh.epithet}`;
    }
  }
  return null;
}

function wrap(text: string, width: number): string {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      out.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out.join('\n');
}

export function downloadSaga(state: GameState): void {
  const blob = new Blob([buildSaga(state)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saga-${state.seed}-season${state.turn}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
