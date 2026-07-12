# Contributing

Thank you for pulling up a chair. This page is the short version of how the workshop runs; [`DECISIONS.md`](DECISIONS.md) is the long version of why.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

Node 20 or newer. Everything else is a dev dependency; the shipped game has zero runtime dependencies, and we intend to keep it that way.

## The gates

Every change should pass all three before a PR:

```bash
npm run typecheck
npm test           # includes a frozen replay fixture: a full AI game whose final-state hash must not move
npm run sim        # headless AI-vs-AI sweep with invariants checked every round
```

The fixture test is a canary, not a formality. If it fails and you didn't mean to change the rules, you changed the rules.

## Seeing your change in the real game

The drive scripts replay real user flows through Playwright and screenshot each stage. Start a dev server on port 5199, then run any of them from the repo root:

```bash
npm run dev -- --port 5199
node scripts/drive.mjs
```

`scripts/drive-*.mjs` variants cover specific flows: attack, codex, gallery, mobile, online, and more. Most UI bugs in this project were caught this way.

## The determinism rules

These are the house laws. The engine replays byte-identically from seed + action log, and everything below exists to keep that true.

- **No state outside `GameState`.** It is one JSON-serializable plain object: no classes, no Maps, no Dates, no module-level mutable variables.
- **No randomness outside `Rng`.** UI-only jitter uses a separate throwaway RNG; previews use `rng.fork()`, which never advances the real stream.
- **Any engine-visible change** (rules, content numbers, AI decisions, anything a replay could notice) means bumping `RULES_VERSION` in `src/engine/state.ts` and regenerating the fixture:

  ```bash
  npx tsx scripts/make-replay-fixture.mjs
  ```

  Do this deliberately, in the same commit as the change.

## Art

The painted plates are produced and reviewed outside this repo: every slot is generated several times against one approved style anchor, judged against its written brief, and only the best candidate ships into `public/art/`. The procedural heraldry fallback means the game never needs the images to run, so art changes can't break play. If you want to propose new art, open an issue with the slot name; don't commit generated images directly.

## Voice

Two registers, never mixed in one line:

- **Rules text** is plain sentences with the numbers stated outright. "Knights hit 20% harder in the first clash."
- **Fiction** is Osperan's register: past tense, dry, secretly sentimental.

If a line explains a rule and also makes a joke, split it into two lines.
