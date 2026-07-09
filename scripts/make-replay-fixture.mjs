// Regenerate tests/fixtures/replay-fixture.json after a DELIBERATE rules
// change (bump RULES_VERSION in src/engine/state.ts first):
//   npx tsx scripts/make-replay-fixture.mjs
// The fixture freezes a full AI game's settings+log+final-state hash so the
// determinism test catches ACCIDENTAL changes to engine semantics.
import { writeFileSync } from 'fs';
import { createGame, applyAction } from '../src/engine/engine.ts';
import { aiTakeTurn } from '../src/engine/ai.ts';
import { RULES_VERSION } from '../src/engine/state.ts';
import { fnv } from '../tests/fixtureHash.ts';

const settings = {
  seed: 'fixture-anvil-7',
  mapSize: 'small',
  maxTurns: 40,
  fogOfWar: false,
  veteranChronicle: false,
  victoryPaths: ['conquest', 'dominion', 'goldenAge', 'legend'],
  players: [
    { kind: 'ai', lordId: 'seraphine', difficulty: 'knight' },
    { kind: 'ai', lordId: 'nyssa', difficulty: 'knight' },
    { kind: 'ai', lordId: 'ulvra', difficulty: 'knight' },
    { kind: 'ai', lordId: 'morrikan', difficulty: 'knight' },
  ],
};

const { state } = createGame(settings);
let guard = 0;
while (state.phase !== 'ended' && guard++ < 5000) {
  if (state.players[state.current].kind === 'ai') aiTakeTurn(state);
  else applyAction(state, { t: 'endTurn' });
}

const fixture = {
  rulesVersion: RULES_VERSION,
  settings: state.settings,
  log: state.log,
  finalTurn: state.turn,
  finalHash: fnv(JSON.stringify(state)),
};
writeFileSync(new URL('../tests/fixtures/replay-fixture.json', import.meta.url), JSON.stringify(fixture));
console.log(`fixture written: rules v${RULES_VERSION}, ${state.log.length} actions, ended turn ${state.turn}, hash ${fixture.finalHash}`);
