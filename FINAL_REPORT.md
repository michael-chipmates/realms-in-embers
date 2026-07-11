# FINAL REPORT — Realms in Embers

> **A snapshot, not the present.** This report closed the original build
> session (2026-07-03). The game has since gained online multiplayer, the
> Illustrated Edition, the Codex, signature abilities, the lord gallery and
> four more rules versions — `CHANGELOG.md` carries the living history.
> Kept intact as the record of the first climb.

One session, one empty directory, one finished game. This is what got built, what
was invented along the way, where it's honestly weak, and what I'd build next.

---

## What was built

A complete turn-based fantasy strategy game in the spirit of *Fantasy Empires*
(1993), running in the browser from `npm install && npm run dev`, playable with
mouse, keyboard, or touch, on a desktop or a phone.

**The world.** Procedural province maps in three sizes from visible, shareable
seeds — noise-shaped continents, provinces grown organically by cost-jittered
Dijkstra, five terrains with real mechanical identity, rivers that matter in
battle, sea lanes, six kinds of special site, and every province named and given
a line of authored flavor ("The mist comes in at dusk and reads over your
shoulder").

**The claimants.** Twelve lords across three original creeds — Flame, Ash,
Umbra — each with a published temperament (aggression, greed, mysticism,
loyalty, pride) that the AI genuinely plays, a unique perk, heraldry, and five
personal lines. Difficulty is transparent handicaps only, printed on the setup
screen and in the Lords panel.

**The rules.** An economy where every number decomposes on hover — income,
order drift, upkeep, attitude, victory standing, all itemized with labeled
causes. Order and rebellion fully legible. A 16-unit roster with traits (charge,
brace, siege, terror, flying, casters), walls that siegeworks level, stances,
veterancy. Battles resolve in a deterministic core and present as a skippable
round-by-round playback; every attack shows a Monte-Carlo odds preview first,
with both sides' modifiers in plain language — run on a forked RNG, so
inspecting your odds never changes them.

**The soul.** Heroes in four classes who level through battle and quest, choose
between arts at milestone levels, carry artifacts from a 20-piece pool (three of
them Shards of the sundered throne, two of them honestly cursed), and die
deaths that stop the room — ceremonies, not popups. A quest book of thirteen
undertakings in three risk tiers with authored outcome prose, plus the
five-chapter Grand Saga that ends with a hero rekindling the Ember Throne — a
victory path the whole table races in public. Magic as a first-class system:
Emberlight, Rites, ten realm workings cast on the map, eight battle spells that
weave themselves (always previewed, both sides, with prices). Fourteen authored
events with truthfully previewed choices. Diplomacy with memory: a decaying
ledger of deeds behind every attitude number, oathbreaking that the whole realm
remembers, pacts, alliances, gifts, demands, and rivals who sue for peace when
they're losing and refuse it when they're not.

**The narrator.** Osperan the Unresting — the palace chronicler who died in the
Sundering and can't rest until the war has an ending — writes the whole game as
history in a live chronicle feed: variety-managed line banks, teaching
marginalia the first time each mechanic appears (suppressed by veteran mode),
ceremony for the moments that deserve it, and at the end, the **saga export**:
the campaign bound into a readable story in his voice, in acts, with the final
reckoning appended.

**The proof.** A deterministic core — one seeded RNG living inside a single
serializable state object, every mutation (human and AI) an action in a log;
seed + log replays byte-identically, and the test suite enforces it. 35 unit
tests. A headless harness that plays full AI-vs-AI games with invariant checks
every round: the shipping sweep ran 60/60 games without a crash, every game
terminated, **all five endings occurred** (33% chronicle judgment, 28% legend,
20% dominion, 15% conquest, 3% golden age), and all twelve lords won games.
Hotseat with a dark handoff screen, optional fog of war with per-player memory,
three rolling autosaves + five slots + file export/import, colorblind patterns,
reduced motion, text scaling, full keyboard play, and procedural WebAudio music
and effects behind a real mixer. ~97 KB gzipped, zero runtime dependencies.

## What I invented (beyond the brief)

- **The narrator is the save file's soul**: chronicle, tutorial, and saga export
  are one system — Osperan's book — so teaching reads as marginalia and the
  export reads as literature, not a log dump.
- **The Saga as a shared public race** with a finale (the three-night
  Rekindling) that announces itself to every rival — a victory path that
  *generates* war instead of avoiding it.
- **Auto-woven battle magic**: casters matter in every fight without a tactical
  sub-game, because the odds preview discloses both sides' spells and costs.
- **Strain & Defiance**: anti-snowball and catch-up as named, tooltip-visible
  mechanics rather than hidden rubber-banding.
- **Forked-RNG previews** — an architectural guarantee that looking at your
  odds can never change your fate, tested.
- **The Chronicler's Request** — a once-per-campaign event where the narrator
  personally asks the player why they want the throne, and files the answer.
- Sites with economies of their own (circles cheapen Rites, forges bias quest
  loot toward weapons, barrows raise revenants for the right lord).
- A wolfshead protection racket you can simply pay, and rebels who send terms
  under a straw crown before they burn your province.

## Honest weaknesses

- **Battle presentation is a readable account, not a spectacle.** Round bars,
  casualty ticks, and field notes play back cleanly, but nobody will mistake it
  for a cinematic. The engine's BattleReport carries everything a real animated
  scene would need; the scene itself wasn't reached this session.
- **The tactical layer is auto-resolve only** (a deliberate scope cut, logged
  from the start). Multi-stack coordination is shallow: allies never co-attack.
- **Balance is sim-fair, not tournament-fair.** Lord win rates spread 1–9 over
  60 games; Maera underperforms (her moor economy is slow) and shades' quest
  dominance likely needs a shave. Golden Age fires rarely for AIs (3%) — it's
  really a player-shaped path.
- **AI diplomacy is competent but not devious** — no coordinated coalitions
  beyond attitude pressure, no feints, no bought wars. It reads honestly; it
  doesn't scheme.
- **The chronicle feed can run chatty** (~200 entries/game). Variety management
  keeps it from repeating, but a filter-by-kind control would help long games.
- **Localization is not scaffolded** — all copy is inline English. A string
  table would be a real refactor now.
- Hotseat + fog hides the map between turns, but panels opened *during* your
  turn trust you not to scroll a shared chronicle to another player's private
  lines (they're filtered by viewer, so actually safe — but the *battle toasts*
  for AI-vs-AI fights are visible to whoever is seated).

## What I'd build next

1. **The battle scene it deserves** — unit chits advancing on a painted field,
   driven from the existing BattleReport (all data is already there).
2. **Async online play** — the deterministic action log *is* the netcode;
   a tiny relay server + optimistic UI would make play-by-mail real.
3. **Replay theater** — scrub through any saved game's log; the engine already
   replays byte-identically.
4. **Deeper scheming AI** — coalition brokering, bought wars, feigned peace;
   personalities are in place, the diplomacy verbs exist.
5. **A map editor** and daily seeds with shared scoreboards (chronicle scoring
   is already itemized and comparable).
6. **Localization pass** — extract strings, keep Osperan's voice per language
   with dedicated line banks rather than translation.

## The numbers

- ~13,400 lines of TypeScript (engine + content + UI + sim),
  zero runtime dependencies, 97 KB gzipped.
- 35 tests green; 60-game shipping sweep: 0 crashes, 100% termination,
  5/5 victory paths reachable, 12/12 lords capable of winning.
- 9 commits, each a working game.

*The fire is yours now. Mind it. — O.*
