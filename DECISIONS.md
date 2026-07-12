# DECISIONS

A running log of major design and engineering decisions, and the reasoning behind them.
Newest entries at the bottom. See `FINAL_REPORT.md` (at the end) for the retrospective. (Day-to-day build status lived in an internal session log that isn't part of the published repo.)

---

## D-001 · Stack: Vite + vanilla TypeScript, zero runtime dependencies
The whole game is hand-rolled TS. No React/Vue (a strategy UI is mostly bespoke panels
and one canvas; a framework buys little and costs bundle, indirection, and update-loop
interference), no Three.js (the art direction is a 2D "war table": a painted map, not a
3D scene). Canvas 2D renders the map; the surrounding UI is plain DOM, which keeps it
accessible (real buttons, focus order, screen-readable text) for free. Dev deps only:
vite, typescript, vitest, tsx.

## D-002 · Deterministic core: one seeded RNG, plain-object state, action log
- All game randomness flows through one `Rng` (sfc32, seeded from a human-readable string).
  Its state lives *inside* the game state, so save/load resumes mid-stream.
- `GameState` is a single JSON-serializable plain object. No classes, no Maps, no Dates
  inside state.
- Every mutation, human *and* AI, is an `Action` object passed through `applyAction()`,
  appended to an action log. Seed + log replays to an identical state (tested).
  Logging AI actions too means replays survive future AI tuning, and "watch replay" is
  possible later.
- UI-only randomness (animation jitter, particle drift) uses a separate throwaway RNG and
  never touches the core. Previews (battle odds) use `rng.fork()`, a hashed side stream
  that never advances the real one, so looking at odds never changes fate.

## D-003 · Engine/UI split is a hard wall
`src/engine/**` never imports from `src/ui/**` and never touches DOM globals. The engine
exposes `createGame`, `applyAction`, `aiTakeTurn`, and pure selectors/previews. The sim
harness and tests run the engine headless in Node. The UI is a renderer + action
dispatcher over the same API a future online server would use.

## D-004 · World, title, and narrator (originality)
Title stays **Realms in Embers** (considered "Embermark", "Cinders of the Crown": kept
the working title; it reads as a campaign, which is the point; "the Embermark" becomes
the *realm's* name instead). Original fiction: the Ember Throne shattered in the
Sundering; claimant lords war over a realm of cooling embers. Alignment axis is the three
**Creeds**: Flame (relight the throne), Ash (let it rest), Umbra (the dark is a ladder).
Original terms, no D&D/SSI material anywhere.
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
rendering, with zero dependencies. Grid is part of state (province index per cell).

## D-007 · Battles resolve in the core, animate in the UI
`resolveBattle()` produces a complete `BattleReport` (rounds, per-unit casualties, hero
events, spells) deterministically. The battle screen *plays back* the report:
framerate-independent, skippable, never input-locking. Odds preview runs ~300 Monte-Carlo
resolutions on a forked RNG and itemizes every modifier in plain language.

## D-008 · Battle magic auto-weaves; realm magic is deliberate
Battle spells cast themselves when a side fields casters and can pay, but the
odds preview names the spell and its Emberlight price for BOTH sides before any
commitment. This keeps battles one decision (fight or don't) while making
casters matter; realm spells stay slow, targeted, map-level decisions. Magic is
everywhere without a second battle UI.

## D-009 · The Saga is a public race
The Legend path (five chapters ending in a three-night ritual every lord can
see) is one chain shared by all players, first-come. It forces interaction:
a saga leader is a target; the Rekindling announces itself realm-wide. AI lords
run the race too: in simulation ~28% of games end in a Legend.

## D-010 · Teaching is engine-side and deterministic
Osperan's marginalia are chronicle entries written by the engine at first
encounters (flags in state), not UI toasts, so they replay identically,
save/load correctly, and read as part of the book. Veteran mode filters the
kind rather than suppressing the writes.

## D-011 · Pacing knobs are visible mechanics, not modifiers
Anti-snowball is "Strain of rule" (−order per province at 34%/50% of the realm)
and the fear line in every rival's attitude; catch-up is "Defiant hearts"
(+order, −15% musters when at half the leader's size). Both appear as labeled
lines in tooltips: the catch-up system is itself part of the readable game.

## D-012 · Balance is sim-driven, and quests were the key lever
The first playable AI reached 100% turn-limit endings. The fixes that moved it
to 33% chronicle / 28% legend / 20% dominion / 15% conquest / 3% golden age
(60-game sweep): quest fortune 2d4 instead of d8 with wider setback bands,
gentler death risks, cheaper hero levels, AI ambition gates (saga at even odds,
generic quests at +0.5 margin), winners refusing peace, endgame nerve, and
dominion at 55% held 3 seasons.

## D-013 · One dependency policy, held
Shipped with zero runtime dependencies. Dev deps: vite, typescript, vitest,
tsx, @types/node, playwright (screenshot-driven UI iteration: scripts/drive*.mjs
replay real user flows headlessly and were how most UI bugs were caught).


## D-014 · Post-ship polish: clarity beats subtlety (iteration 2)
User playtest verdicts drove a clarity pass: the viewer's realm now renders
unmistakably theirs (stronger fill, bright double border), terrain washes got
real color, march targets carry explicit order-glyphs (crossed swords vs
chevron), walls show as crenellated badges, rivers read at a glance. The
earlier map was atmospheric but coy; a strategy map must answer "what's mine
and where can I go" preattentively.

## D-015 · Licensed score over generative, with a graceful ladder
Scott Buckley's CC-BY 4.0 tracks (Penumbra; Song Of The Forge) are bundled and
credited in-game. The ladder: user-provided playlist.json > bundled tracks >
procedural WebAudio score. Attribution lives in Settings, README, and this
file. The synth engine remains as the offline fallback and for all SFX.

## D-016 · Art slots now, images later
Fantasy Empires' looming Dungeon Master and ornamental map frame inspired
(not copied): Osperan now has a visible presence at the chronicle head and the
war table wears carved-brass corner flourishes. Every illustrated surface
already queries a named art slot (src/ui/art.ts) with a procedural fallback,
and the art plan specifies the full generated-image manifest (provider,
style block, per-image prompts) so the illustration round is a drop-in.

## D-017 · Zero runtime deps, honest dev deps
The shipped game still imports nothing at runtime. The toolchain, by
contrast, earns its keep where it pays: `playwright` drives the real UI in
every drive script, `sharp` feeds the art pipeline, `tsx`/`vitest`/`vite`
build and test. Dev-dependencies are allowed to be boring and replaceable;
the runtime is not allowed to have any.

## D-018 · No signature scales with the table, uncapped
Review night finding (2026-07-11): Corvas took 6% of *every* rival treasury,
so his power grew linearly with player count: audit sweeps showed his wins
clustering at five- and six-lord tables (44% per seat on fresh seeds). The
rule, now standing: any per-rival effect must scale sub-linearly with the
number of rivals (Corvas pays out at 6%/√(rivals−1)) or carry an explicit
cap stated in its desc. The mirror sweep referees; the desc-pinning test
keeps the printed rules honest.
