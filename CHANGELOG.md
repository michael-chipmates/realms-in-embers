# Changelog

All notable changes to Realms in Embers. The game's rules carry their own
version (`RULES_VERSION` in `src/engine/state.ts`, currently v11) — bumped
whenever engine semantics change, with a frozen replay fixture as the canary.

## [Unreleased] — the adoption round (2026-07-11)

### Added
- **A domain**: the realm lives at rie.gg (realmsinembers.com redirects).
- **The Codex** (press c): Osperan's complete handbook — thirteen chapters,
  every number rendered from the engine's own constants so the book cannot
  drift; a Marginalia chapter that re-opens every teaching he has written
  for you; deep pagers, phone chip-nav, and a live line to the Ledger race.
- **Quick War**: one tap on the title, three tempers, straight into a
  fogged medium realm — routed through the lord gallery.
- **Spell Theater** (rules v10): every cast is inked onto the war table in
  its family's voice (gold blooms, iron-gall blots, compass-drawn wards,
  barrow wisps, scrying rings), and every lasting working leaves a wax
  seal on the province — round for helpful, torn for harmful, pips for
  seasons left. Family-voiced audio; battle playback flares its weavings.
  Fog-gated, reduced-motion-safe, byte-identical online.
- **Signature abilities** (rules v11): every lord now carries two
  abilities — the legacy they always had, and an active signature order
  with a cooldown the whole realm hears: the Great Vigil, Royal Muster,
  Stand Fast, the Dawn Oath, the Deep Roads, Fen Lights, Greenwood
  Ambush, the Embargo, Call in the Debts, Whisper Campaign, Open the
  Doors, Marked for the Crows. The AI fires all twelve on its own read
  of the moment; rivals' cards print both abilities and cooldown state.
- **The lord gallery**: choosing a banner is the set piece — painted
  portraits, creed filters, both ability cards, temperament in ink, one
  dry Osperan line each; wired into Quick War, setup, and the online
  lobby (picks ride the hellos; a contested banner goes to the earlier
  relay seq; unclaimed banners are dealt by fate).
- **The candidate rule for art**: every slot is generated three to five
  times and reviewed before the best ships — 66 of 91 plates were
  upgraded in the first full review.
- Tooltips now carry the full mechanical contract: every unit trait line,
  hero class growth and wages, and enchantment chips that name the caster.

### Changed
- Explanations everywhere follow the humanizer standard: rules text in
  plain sentences with the number stated outright, fiction in Osperan's
  voice, never mixed in one line.
- The service worker fetches navigations network-first (fresh deploys on
  the next visit; the cached shell still answers offline).

## [The outstanding round] — 2026-07-09

### Added
- **The Illustrated Edition**: 43 painted plates in a late-80s game-manual
  airbrush style, generated against a single approved style anchor —
  every lord, class, event, ceremony, the title hall, and Osperan himself.
- **Model playtesting**: `scripts/model-playtest.mjs` seats an LLM at the
  table through the real engine; its first outing found (and we fixed) the
  guild-loan endgame exploit and several vague rejection messages.
- **Online multiplayer**: live wars over a blind, end-to-end-encrypted relay.
  One invite link, no accounts, turn clocks (none/relaxed/standard/blitz with
  bank + increment), self-hostable relay (Node/Docker) or Cloudflare Worker.
- **Coalitions & calls to war**: the realm leagues once per game against a
  runaway leader; lords recruit allies into their wars with gold sweeteners;
  alliances are defensive (attacker of one fights both) and share map vision.
- **Combined assaults**: multiple banners converge on one field from
  different provinces — previewed jointly; the AI stages pincers.
- **Emberlight fervor**: opt-in +12% attacker burn, previewed like everything.
- **Endings that arrive**: the Chronicle wearies (dominion threshold erodes
  from season 38), the Golden Age is reachable (and the AI merchant archetype
  plays for it), the Saga's later chapters demand a realm behind the legend,
  and the Rekindling can be broken by storming the seat mid-ritual.
- **Ten new events** (13 → 23), including two chains that pay off planted
  flags (the wolfshead toll comes back doubled; the peddler's relic gets
  homesick).
- **The lords speak**: 65 authored dialogue lines wired into war, peace,
  elimination, and victory; intro quotes on diplomacy cards.
- **Quest improvisation**: any hero may attempt any quest on their best other
  stat at −4.
- **Living title screen**: ember drift, rotating epigraphs, candle-glow.
- **PWA**: installable, works fully offline after first load.
- Save-format discipline: RULES_VERSION + frozen replay-fixture canary test.

### Changed
- Balance (180-game sweeps): every lord's winrate within 5.6–11.1%; all five
  endings occur (dominion 33%, chronicle 22%, legend 21%, conquest 8%,
  golden age 4%).
- Narrator variety: per-turn banks tripled; quest outcomes have variants;
  site flavor varies; the saga export gained the Roll of the Fallen,
  artifact provenance, and per-claimant epitaphs.

### Fixed
- Keyboard input dying after casting a targeted spell from the Magic overlay.
- Battle-report sounds continuing after closing the report with Escape.
- Ceremony queue wedging across games.
- Chronicle filter tabs showing ceremony entries under every tab.

## [0.1.0] — 2026-07-03

Initial complete game: procedural realms, twelve lords in three creeds,
itemized economy, 16-unit combat with odds previews, heroes/quests/saga,
magic, diplomacy with memory, personality AI, Osperan's chronicle and saga
export, hotseat + courier play, full accessibility pass. See FINAL_REPORT.md.
