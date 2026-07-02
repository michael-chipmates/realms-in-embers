# DECISIONS

A running log of major design and engineering decisions, and the reasoning behind them.
Newest entries at the bottom. See `STATE.md` for build status, `FINAL_REPORT.md` (at the end) for the retrospective.

---

## D-001 · Stack: Vite + vanilla TypeScript, zero runtime dependencies
The whole game is hand-rolled TS. No React/Vue (a strategy UI is mostly bespoke panels
and one canvas; a framework buys little and costs bundle, indirection, and update-loop
interference), no Three.js (the art direction is a 2D "war table" — a painted map, not a
3D scene). Canvas 2D renders the map; the surrounding UI is plain DOM, which keeps it
accessible (real buttons, focus order, screen-readable text) for free. Dev deps only:
vite, typescript, vitest, tsx.

## D-002 · Deterministic core: one seeded RNG, plain-object state, action log
- All game randomness flows through one `Rng` (sfc32, seeded from a human-readable string).
  Its state lives *inside* the game state, so save/load resumes mid-stream.
- `GameState` is a single JSON-serializable plain object. No classes, no Maps, no Dates
  inside state.
- Every mutation — human *and* AI — is an `Action` object passed through `applyAction()`,
  appended to an action log. Seed + log replays to an identical state (tested).
  Logging AI actions too means replays survive future AI tuning, and "watch replay" is
  possible later.
- UI-only randomness (animation jitter, particle drift) uses a separate throwaway RNG and
  never touches the core. Previews (battle odds) use `rng.fork()` — a hashed side stream
  that never advances the real one, so looking at odds never changes fate.

## D-003 · Engine/UI split is a hard wall
`src/engine/**` never imports from `src/ui/**` and never touches DOM globals. The engine
exposes `createGame`, `applyAction`, `aiTakeTurn`, and pure selectors/previews. The sim
harness and tests run the engine headless in Node. The UI is a renderer + action
dispatcher over the same API a future online server would use.

## D-004 · World, title, and narrator (originality)
Title stays **Realms in Embers** (considered "Embermark", "Cinders of the Crown" — kept
the working title; it reads as a campaign, which is the point; "the Embermark" becomes
the *realm's* name instead). Original fiction: the Ember Throne shattered in the
Sundering; claimant lords war over a realm of cooling embers. Alignment axis is the three
**Creeds** — Flame (relight the throne), Ash (let it rest), Umbra (the dark is a ladder)
— original terms, no D&D/SSI material anywhere.
The narrator is **Osperan the Unresting**, the palace chronicler who died in the
Sundering and cannot rest until the Chronicle has an ending. He writes the war as history
while it happens (past tense, sardonic, secretly sentimental). This unifies three
features: the narrator voice, in-fiction teaching (his "marginalia"), and the saga export
(the export *is* his finished chronicle).

## D-005 · Art direction: war table at midnight
Committed: candlelit room around an aged-vellum map. Parchment texture and province
shapes generated procedurally on canvas; heraldic tints for realms; a serif chronicle
column; wax-seal buttons; ink-line iconography (hand-authored inline SVG). Dark wood
frame, warm low light, restrained gold. No default-looking UI anywhere.

## D-006 · Map generation: grid growth, not Voronoi
Provinces grow from farthest-point seeds over a noise-costed grid (multi-source Dijkstra)
on a noise-shaped continent. Gives organic hand-drawn-looking borders, guaranteed
contiguity, trivial adjacency/hit-testing, and marching-squares boundaries for painterly
rendering — with zero dependencies. Grid is part of state (province index per cell).

## D-007 · Battles resolve in the core, animate in the UI
`resolveBattle()` produces a complete `BattleReport` (rounds, per-unit casualties, hero
events, spells) deterministically. The battle screen *plays back* the report —
framerate-independent, skippable, never input-locking. Odds preview runs ~300 Monte-Carlo
resolutions on a forked RNG and itemizes every modifier in plain language.
