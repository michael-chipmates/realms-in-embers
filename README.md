# Realms in Embers

*A turn-based fantasy strategy chronicle — an original homage to the spirit of
SSI's 1993 classic Fantasy Empires.*

*Not affiliated with, endorsed by, or containing material from SSI's
successors, Ubisoft, Wizards of the Coast, or Hasbro. All fiction, names, and
systems are original.*

**Free forever, open source, no accounts, no tracking.** Code: AGPL-3.0 ·
Content & art: CC BY-SA 4.0 · Music: Scott Buckley, CC-BY 4.0 — see
`CREDITS.md`. Copyleft is deliberate: nobody can take this game closed-source
or sell it out from under its players.

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

## Music & credits

The score is **Scott Buckley** — *Penumbra* and *Song Of The Forge* — released
under CC-BY 4.0 (www.scottbuckley.com.au), bundled in `public/music/` and
credited in-game (Settings → Credits). Prefer your own soundtrack? Drop MP3s in
`public/music/` and list them in `public/music/playlist.json`; the mixer picks
them up, and falls back to the built-in generative score if files are missing.

## Multiplayer

- **Live online** (built-in): "Online War" on the title screen. One invite
  link seats everyone — no accounts, ever. Turn clocks (bank + increment
  presets) keep 2–4 player wars inside two hours. **The relay is blind:**
  every action is end-to-end encrypted with a key that lives only in the
  invite link's URL fragment; the server stores ciphertext and ordinals and
  can read nothing. Reconnecting replays the encrypted log through the
  deterministic engine — you rejoin exactly where the war stands.
  Host your own relay: `node server/relay.mjs` (or the Dockerfile in
  `server/`, or deploy `server/worker.js` to Cloudflare Workers — identical
  protocol). Set it in-game via localStorage key `rie-relay`.
- **Hotseat** (built-in): several mortals at one table; the map hides between turns.
- **Courier play** (built-in): async war by letters — after your turns, "Seal &
  send" exports the chronicle file; the other player loads it and plays on.
  A stalled online session degrades gracefully: every round autosaves, and a
  save continues by courier.

## The illustrated edition (prepared)

Every illustrated surface asks `src/ui/art.ts` for a named slot and falls back
to procedural heraldry. `docs/ART.md` holds the complete manifest — files,
sizes, style guide, and generation prompts — so an image-generation pass drops
in with zero code changes.

## Repo map

- `src/engine/` — the deterministic core. No DOM. One seeded RNG in-state, every
  mutation an action, seed+log replays byte-identically. `content/` holds all
  authored material (lords, units, spells, artifacts, quests, events, narrator).
- `src/ui/` — canvas vellum map + DOM war room. `src/sim/` — the proving ground.
- `scripts/` — Playwright drivers that replay real user flows headlessly.
- `DECISIONS.md` — why things are the way they are. `FINAL_REPORT.md` — the
  honest retrospective. `STATE.md` — build log.
