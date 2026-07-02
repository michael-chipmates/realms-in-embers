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

Then open the printed URL (default http://localhost:5173).

## Verify it

```bash
npm test        # unit tests: rng, mapgen, economy, combat, replay determinism, saves
npm run sim     # headless harness: plays full AI-vs-AI games, checks termination & balance
npm run build   # typecheck + production build
```

## Repo map

- `src/engine/` — the deterministic core. No DOM. One seeded RNG, plain-object state,
  every mutation an action. `src/engine/content/` holds all authored data (lords, units,
  spells, artifacts, quests, events, narrator lines).
- `src/ui/` — canvas map renderer + DOM panels, screens, audio.
- `src/sim/` — the headless simulation harness.
- `tests/` — vitest suites.
- `DECISIONS.md` — why things are the way they are. `STATE.md` — build status.
