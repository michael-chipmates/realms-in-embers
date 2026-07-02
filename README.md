# Realms in Embers

*A turn-based fantasy strategy chronicle — an original homage to the spirit of
SSI's 1993 classic Fantasy Empires.*

The Ember Throne is forty years shattered. The realm it warmed — the Embermark —
cools province by province, and every lord with a banner and an appetite has decided
the ashes belong to them. One chronicler, who did not survive the Sundering but
declines to let that stop him, records the war you are about to start.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). Works on desktop and phone;
mouse, keyboard, and touch.

## The game in one paragraph

Pick a lord (twelve, in three creeds, each with a real temperament the AI plays).
Expand across a procedurally forged realm — every seed is shareable and reforges
identically. Raise works and companies, mind your order (every number itemizes its
causes on hover), send heroes on quests, learn workings of Emberlight, read your
rivals' grudges in plain lines, and reach one of five endings: conquest, dominion,
a golden age, the Legend of the rekindled throne — or the judgment of the Chronicle
when the page runs out. Every game ends. The saga export hands you the whole war
as a story when it's over.

## Keys

`arrows` roam provinces · `enter` select the army there · `E` end season ·
`H` court & heroes · `M` magic · `Q` quests & saga · `D` the other lords ·
`L` ledger & victory race · `Esc` close/deselect

## Verify it

```bash
npm test        # 35 tests: rng, mapgen, economy, combat, replay determinism, saves, AI smoke
npm run sim     # headless harness: full AI-vs-AI games, invariants every round
npm run build   # typecheck + production build (~97 KB gzipped, zero runtime deps)
```

## Repo map

- `src/engine/` — the deterministic core. No DOM. One seeded RNG in-state, every
  mutation an action, seed+log replays byte-identically. `content/` holds all
  authored material (lords, units, spells, artifacts, quests, events, narrator).
- `src/ui/` — canvas vellum map + DOM war room. `src/sim/` — the proving ground.
- `scripts/` — Playwright drivers that replay real user flows headlessly.
- `DECISIONS.md` — why things are the way they are. `FINAL_REPORT.md` — the
  honest retrospective. `STATE.md` — build log.
