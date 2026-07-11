# Changelog

All notable changes to Realms in Embers. The game's rules carry their own
version (`RULES_VERSION` in `src/engine/state.ts`, currently v15) — bumped
whenever engine semantics change, with a frozen replay fixture as the canary.

## [0.5.0] — the legible war (2026-07-12)

The experience wave and the second trust wave, in one release: battles stage
themselves, a stranger's first game teaches by doing, the map has a semantic
twin, online tables verify their own history, and the balance referee gained
the statistics to convict — then convicted, twice, and was obeyed.

- **The Battle Theater** — every fight opens as a staged scene: a stakes card
  carrying the odds you accepted, ranks of company chits, a balance that tips
  clash by clash at three speeds, and an aftermath naming the decisive
  moments and answering the forecast. Reduced motion keeps the still report.
- **The First Ember** — a guided first chronicle on a pinned friendly seed;
  six steps that only advance when the real thing happened in the action log.
  Skippable always; leads the title for first visits.
- **The Province Navigator** (`p`) — the map as rows, fog-gated to exactly
  what the vellum shows, filterable, selection mirrored both ways. The Keys
  card moved to `?`; an axe accessibility gate joined CI at zero violations.
- **ActionEvaluation** (UX-030) — one typed legality/cost/reason source that
  dry-runs the engine's own validator; the build and muster buttons read it.
- **Trust wave two** — online state checkpoints every ended season with
  freeze-on-divergence (NET-033); a crash boundary that sets the game down as
  "The emergency copy" (SAVE-033); the replay fixture verified nightly in
  Chromium, Firefox, and WebKit (DET-030); staged service-worker updates
  (BOOT_OK — a shell that cannot boot never destroys the last one that could),
  applied deliberately from the title.
- **QA-030 statistics** — the mirror harness now reports game-block bootstrap
  CIs and judges each lord against a ROPE equivalence band: a CI wholly
  outside expectation ±5pp fails the night conclusively; straddles are
  reported, never failed. Route attempts print beside wins so Golden Age
  rarity stays a choice. The harness judges and never tunes.
- **Allies press the same front** (rules v15) — an allied banner beside a
  shared enemy's province lowers the AI's attack threshold and raises the
  prize, so allied wars converge instead of running in parallel; and the
  fierce or greedy now shop for war against a ≥34% leader someone else
  already fights (never over a pact, never from weakness). The sweep counts
  converging attacks to prove it fires.
- **recallMove** (rules v14) — a peaceful march onto already-seen ground can
  be taken back the same season. A fight, a capture, or new ground glimpsed
  spends the season for good (no free scouting through the fog), a merge or
  hero change spends it too, and the AI never recalls. The army card offers
  the recall exactly when the engine would allow it.
- **The Council Brief** (`b`) — next season's coin itemized, recent
  developments, open items with deep-links, the race, and a pinned intention;
  the End button whispers true omissions and never blocks.
- Disbanding a company and releasing a hero now arm on the first press and
  act on the second — nothing irreversible on a stray tap.
- **The chronicle at the right volume** — entries carry reading tiers
  (ceremony, decision, alert, weather), new lines since your last full
  reading wear an ember dot and count on the collapsed spine, and long wars
  mount only their trailing seasons; the rest unroll on request.
- **The endgame debrief and the share card** — the end screen names where
  the war turned (great land-grabs, fallen banners, the season the lead
  became permanent); a share card renders to PNG entirely on-device (victor,
  path, score, seed, the final map), and a copied seed link opens the same
  realm for anyone — never over a live game.
- **The rival table** — every living rival in one row: stance, their regard
  for you, lands, saga, signature readiness; the full card below as dossier.
- **The map's three lifetimes** — a renderer layer cache: terrain moves with
  the camera, politics with the action log, hover with the hand. A hover
  repaint fell from ~6 ms of cartography to 0.05 ms of composition, with
  screenshots within 0.2% of the old ink.
- **The phone mode bar** — Map, Realm, Lords, Chronicle at the thumb line,
  opening surfaces that already exist; the sheet sits on its shoulder.
  Setup folds the victory fine print; the gallery says HOW each lord plays
  (archetype line, candor chip) and recommends three first banners; iOS
  learns the Add-to-Home-Screen line; the smallest phones get a 320px gate.
- **Relay round two** — reconnects fetch only what they missed (`since` on
  both relays), room-minting is throttled, and every act carries the cid the
  start entry pinned to its seat (anti-spoofing among key-holders, labeled
  honestly; older editions stay welcome).
- **The offline keeper's card** — Settings shows the keeper's watch and a
  one-tap sweep that carries all 96 plates, songs, and voices home, with an
  honest megabyte count. CI gains a bundle budget (≤190 KB JS gz).
- **The three-eyed lint and the reconciling clerk** — ESLint on exactly the
  audit's classes (floating promises, loose equality, non-exhaustive
  switches; one finding in the codebase, fixed) and a content check that
  every plate is named and every name plated, on every PR.
- **The shelf keeps every age** — save migrations are a registry of record
  with tests that reopen an old chronicle and play it; Settings' credits
  carry the full honest ledger including the AI-art disclosure.
- **/lords/** — the twelve claimants as one crawlable page, rendered from
  the engine's own content; joined the sitemap beside the Codex export.

The enforced balance gates, over ≥300 mirrored games: every lord's bootstrap
CI must touch expectation ±5pp (the ROPE gate — a CI wholly outside fails
conclusively; bare p-values are printed evidence, never gates, because twelve
simultaneous tests at p<0.01 would false-alarm one sweep in nine); dominion
≤ 40% of endings; other paths ≥ 4% (Golden Age: reachable); signatures
≥ 1.0 uses/seat. Refereed by that gate this release: Barrow Revenants swing
like the dead (4/4/5, raising costs 90 gold — a conclusive 41% Morrikan
winrate said a free elite standing army was too generous) and Open the Doors
returns every 16 seasons at −8 order; then the 600-game sweep convicted
Aldric at a conclusive 40%, so the compounding half of The Old Blood eased
(capital +10% → +5%) and the Royal Muster slowed to every 16 seasons; and
dominion, over its ceiling on four straight sweeps, holds `DOMINION_ROUNDS`
5 now (dominion 30% of endings, chronicle 31%, all five alive). Final
600-game sweep: every gate passes.

## [0.4.0] — the open realm (2026-07-12)

The round-2 audits arrived (8.9 and 8.8, both up from 8.4) and every finding
was validated and dispositioned in `docs/ROADMAP.md` §2.16. This release
ships the trust batches both rounds demanded, the first experience flagship,
and the Wayhouse.

### Added
- **The Wayhouse** — open tables for strangers (`docs/design/open-tables.md`):
  a host can post their table to a well-known room on the same blind relay
  (its key is published on purpose — public is just "everyone holds the key");
  anyone opening Play with Friends sees the open tables and sits down with one
  tap, no link needed. Ads heartbeat while seats stay free, expire cold after
  30 minutes, withdraw on start/leave, and re-announce when seats fill. The
  plain-words warning ships with the toggle: a posted table is public.
  `drive-wayhouse.mjs` proves the whole stranger path: post → discover →
  sit → identical war on both clients.
- **Protocol v2 handshake** — hellos carry protocol + rules versions; the
  lobby names peers on a different edition, the host cannot start a mixed
  table, and a joiner refusing a foreign `start` gets plain instructions
  instead of a silent desync.
- **Idempotent appends** — every payload carries a random message id; both
  relay flavors dedupe retransmissions and replay the original entry, and the
  client settles its unacked ledger against the backlog on reconnect. The
  lost-ack duplicate is closed. Appends are also token-bucket throttled
  per socket (burst 20, 2/s refill) on both relays.
- **Validate-before-apply** — decrypted payloads pass structural bounds
  before use; anything unreadable or out of bounds becomes a tombstone
  identically on every honest client (one shared key: skipping is consistent,
  never a fork).
- **Save trust bundle** — every save write returns a typed result, writes are
  transactional (write → verify → rotate) with a last-known-good generation,
  save health is visible in Settings with retry/export, imports pass a 10 MB
  cap + structural validation + prototype-pollution rejection and can never
  touch the running game; 16 new tests including a 40-case fuzz corpus.
- **Workflows** — `nightly.yml` (300-game mirrored sweep with enforced gates
  + codex drift check), `deploy.yml` (tag-triggered build → codex export →
  deploy → live smoke; needs two repo secrets), and the PR pipeline now runs
  the real browser drives, desktop and mobile.
- **Invite hygiene** — the room key leaves the address bar the moment it is
  read (session storage carries the war across reloads; Copy invite rebuilds
  the link deliberately).

### Fixed (round-2 audit findings, all verified)
- The setup screen promised "3 consecutive seasons" for Dominion after rules
  v12 made it four — victory copy now renders from the engine's constants,
  permanently.
- Mutual annihilation crowned player 0 by seat order; the chronicle now draws
  a seeded lot over the ruins.
- The mirror referee itself was confounded: fog and map size cycled with the
  lord rotation. Mirror mode now fixes every condition but the lords
  (re-verified: all twelve within gates on fresh seeds).
- A sampled forecast can no longer print certainty: 240 clean trials read
  "≥99%", a washout "≤1%", and the trial count is stated.
- The service worker stopped seizing live campaigns mid-deploy (no more
  `skipWaiting`); a fresh build waits for the next launch.
- The map canvas no longer claims `role="application"` (it suppressed
  screen-reader browse mode while providing no keyboard model); it is an
  `img` with an honest label until the Navigator flagship lands.
- Two seated lords can no longer share a heraldic fill pattern.
- A Continue button whose save fails to parse now says so instead of dying
  silently.
- CHANGELOG/ROADMAP now quote the enforced statistical gates, not one
  sweep's observed ranges — and a meta-test asserts the documented numbers
  equal the harness constants.

### Added — the first experience flagship
- **Season Digest** (rules **v13**) — the chronicle no longer buries its good
  writing under ~237 routine lines. At every round end Osperan closes the
  season with one digest entry (`ChronicleEntry.digest`, a new `seasonDigest`
  bank with six count-parameterized variants) summarizing the season's
  ordinary business; routine ledger lines (insolvency, guild-loan bookkeeping)
  now carry `minor: true`. In the feed, a persisted **Digest** toggle (on by
  default, `rie-digest` in localStorage) groups entries under collapsible
  season headers: the current season expanded, older seasons folded to their
  digest line plus their ceremonies — which, along with battles, diplomacy,
  heroes, magic, events and teachings, are never digested. Digest off is
  exactly the old flat feed. The filter is a pure engine function
  (`filterChronicle`/`digestView` in `src/engine/narrator.ts`), shared with
  the new `tests/digest.test.ts`; a full AI game now reads in ~51 visible
  lines instead of ~239. Replay fixture refrozen at rules v13.

## [0.3.0] — the revision night (2026-07-11)

Four independent auditors read the game, the code, and the live site on
review night; their findings (kept under `docs/reviews/`) plus Michel's own
phone report became `docs/ROADMAP.md` — every point validated and
dispositioned. This release ships the P0 layer.

### Fixed
- **Phones could not set up or play a war.** The setup screen's grid track
  inherited the config row's max-content width (~780px on a 390px phone) and
  clipped; the in-game bottom sheet sat under `pointer-events: none`, which
  iOS refuses to touch-scroll (Chrome allows it — which is why the drive
  scripts never saw it). Both fixed; drive-mobile now performs real touch
  scroll gestures and fails on any horizontal overflow. Form controls stay
  ≥16px on touch devices so iOS Safari stops zooming into the seed field.
- **Simultaneous victory claims** (rules v12) resolved by seat order —
  including equal-richest Golden Age ties. Claims are now collected from one
  snapshot and tie-broken on the path's own virtue (share and order for
  Dominion, gold and order for the Golden Age, saga progress for Legend),
  then the chronicle score, then a seeded lot. Never the seat.
- Deselecting every victory path silently restored Conquest; setup now says
  so and blocks, and the engine rejects pathless settings outright.

### Balance (rules v12) — refereed by the new mirror harness
- `npm run sim -- --mirror`: every seat plays knight, lords deal round-robin,
  and statistical gates judge the sweep (per-lord two-sided test vs the
  seat-weighted baseline at p ≥ 0.01, ending bands, signature-use floor).
  The old mixed sweep hid a 44%-Corvas / 4%-Maera spread inside difficulty
  noise (both external audits caught it; the gates now cannot).
- Corvas' Call in the Debts softens by 1/√(rivals−1) — no signature scales
  uncapped with table size (new standing rule, DECISIONS D-018).
- Fen Lights gained their offensive half: attacks launched from lit ground
  strike +15% harder. Maera's moors also yield +12 (was +9).
- Stand Fast gained the sally: +12% attacking from Halvard's own ground, and
  Stonefast walls now pay +4 gold in gate tolls — the wall finally earns.
- Morrikan's doors open at his seat (one company) on barrow-less seeds;
  the doors cool 12 seasons and raise one company per barrow.
- Seraphine's Great Vigil: +10 order, 3 gold tithe per province, and her AI
  actually calls it now. Aldric's capital yields +10% (was +20%) and Banner
  Knights discount eased to 10%; Royal Muster cools 12 seasons.
- `DOMINION_ROUNDS` 3 → 4; dominion endings 44% → 35% of AI games.
- Final 600-game mirrored sweep passed every enforced gate: per-lord
  fairness at p ≥ 0.01 vs the seat-weighted baseline, dominion ≤ 40% of
  endings, every other path ≥ 4% (Golden Age exempt — rare by decision,
  gated at ≥ 1 per 300 games), and every signature ≥ 1.0 uses/seat.
  Observed on that sweep (not gates): lords landed within 20–32% per seat
  (worst p = 0.019), all five endings alive, signatures at ≥ 1.5 uses/seat.

### Added
- **A landing page that exists**: rie.gg now serves real, styled, crawlable
  content (and a noscript block, VideoGame JSON-LD, robots.txt, sitemap.xml)
  before the app boots over it.
- **Copy bug report** in Settings: rules version, seed, settings, and the
  full action log — a byte-perfect repro in one tap.
- SECURITY.md (the honest threat model), CONTRIBUTING.md, and GitHub issue
  templates that ask for the seed and the log.
- A determinism guard test: no engine file may reach for transcendental
  Math or the wall clock (only `Math.sqrt` is bit-exact across browsers).
- The season banner is a polite `aria-live` region.

### Changed
- The soundtrack went on a diet: 26 MB of MP3 → 7.1 MB of AAC (attribution
  unchanged, durations identical). The service worker now keeps one
  `rie-app-<build>` cache (old bundles are finally evicted on deploy) and a
  `rie-media` cache with proper Range handling, so iPhones keep music
  offline instead of re-downloading it every session.
- Documentation truth pass: version 0.3.0 (tagged), artifact count, the
  voice claim, and the internal-log references all match reality now.

## [0.2.0] — the adoption round (2026-07-11)

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
