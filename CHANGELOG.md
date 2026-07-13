# Changelog

All notable changes to Realms in Embers. The game's rules carry their own
version (`RULES_VERSION` in `src/engine/state.ts`, currently v16), bumped
whenever engine semantics change, with a frozen replay fixture as the canary.

## [0.6.0]: the table at midnight (2026-07-13)

The visual redesign, carried all the way: every surface is now an object on
or around the war table. The map is a document, the chronicle is a book,
commitment is red wax, chrome is engraved brass, and web furniture stays
outside the room. No rules change: the engine stands at v16 and the replay
fixture is untouched.

### Changed

- **The map is vellum and ink.** The sea-blue viewport is gone: the whole
  canvas is one aged sheet, with a heavy ink coast, hand-inked province
  borders, ownership as close-toned washes (your realm in sage, rivals in
  rust), dashed courier roads, sparse wave strokes on open water, a compass
  rose, and the seed name written in the corner in the chronicler's hand.
  Army markers are pewter tokens: yours ringed in gold, a hero under a
  small pennon. Selection is a wax-red ring. Ownership is never color
  alone: tokens, rings, banners, and the colorblind ink patterns carry it.
- **The chronicle is Osperan's physical book.** A paper page with stacked
  page edges, thumb-tabs on the spine, a gold season rule, a wax dropcap on
  the great moments, and teachings set as marginalia. On phones the book is
  a bottom sheet: a peek with the latest lines, pulled up to a full page,
  and ending the season is a wax roundel under the thumb.
- **Battle odds arrive as the augurs' note**: a paper sheet, slightly
  crooked, with the chance to carry the field written large, an inked gauge
  with tick marks instead of a progress bar, one ledger column per host,
  and the wax seal to commit. On phones it slides up as a sheet with the
  seal nearest the thumb.
- **Diplomacy is an open ledger**: the table at a glance with small-caps
  headers over a heavy ink rule, stances stamped in wax (slightly crooked,
  labeled, never color alone), and dossiers with ink-bordered actions.
- **The gallery is a portrait hall**: the painting in a gilt frame with a
  near-black liner and a brass nameplate, temperament as seven inked pips
  per line (Emberlight burns in ember).
- **The title is three doors, not seven.** One wax plaque leads: the First
  Ember for a stranger, New Chronicle once the ember has been played. A
  running campaign waits as a brass door; everything else is demoted to
  small-caps ink. The painting breathes under a candlelit falloff.
- **The top bar is brass and oak**: resource plaques (the value large, the
  name engraved beneath), and the ten anonymous icons regrouped into three
  labeled clusters: Council, Realm, and The Book. Every hotkey still opens
  its surface directly. Notices land one at a time on a wood status ribbon
  with a "show me" affordance.
- Progress bars left the room: rites fill an inked gauge, battle balances
  are hatched, temperament reads in pips. The emoji glyphs went with them.

### Added

- **IM Fell English** (regular + italic, SIL OFL, self-hosted latin woff2)
  for exactly two voices: map labels and the chronicle's body. It precaches
  with the shell for offline play and the UI survives its absence. The pair
  weighs ~113 KB once, cached; the app bundle itself grew about 3 KB.
- **A composed link-preview card** (`og-card.jpg`): the vellum map angled
  on the candlelit table with the wordmark beside it, rendered from the
  live game by `scripts/capture-og.mjs`, wired into every social meta tag.

### Fixed

- "Fit the whole realm" now keeps the land clear of the open book on
  desktop, so no province starts its life under the page.

## [0.5.1]: the seal before the act (2026-07-12)

A live playtest round and a third round of external audits, folded into one
release. No rules change: the engine stands at v16.

### Added

- **The confirm card**: every act that spends, sends, or cannot be taken
  back now opens one small card first: what the act does in plain words, the
  itemized price from the engine's own evaluation, then the seal or a step
  back. Mustering, raising works, disbanding a company, releasing a hero,
  sending a hero questing (now with the honest kill risk printed), casting a
  working (targeted and not), beginning a rite, and a hero's level-up
  crossroads all ask before they act. A stray tap on a phone costs nothing.
- **Join the banners**: two friendly banners in one province can merge again
  from the army card. The engine always knew how; the button was missing.
- **Mid-season autosaves**: a quiet save lands shortly after every order, so
  a phone that closes mid-season resumes mid-season. The shelf still rotates
  by season, never within one.
- **The First Ember survives a reload**: Continue re-seats the guide and the
  steps re-derive themselves from the action log; the four-page onboarding
  no longer opens on top of the guided game.

### Changed

- Computer-played lords are no longer "AI" anywhere at the table: seats read
  "Rival lord (fate plays them)" and the lobby deals rivals by fate.
- Morrikan has a new portrait: the thrice-buried statesman himself, solid
  and amused, listening to a petitioner under the earth.
- The endgame's ownership scrub is named for what it shows: "Watch the
  banners change." The invite copy now says the key is never sent to the
  relay (it is read off the address bar into session storage), and a posted
  Wayhouse table says plainly that whoever reads the board holds its key.
- The bug report is a redacted diagnostic (versions, seed, settings, log
  shape, state hash). A full save only ever leaves by the Export button.
- Battle copy renders the sampled-forecast size from the engine constant,
  and an upset is explained as the forecast's own tail, not a modifier the
  augurs somehow missed.

### Fixed

- Saving commits the state key atomically; the shelf label is a cache,
  rebuilt from the save itself if its write ever fails. No committed save
  can hide from the shelf again.
- The offline keeper precaches the hashed bundles at install, so the very
  first visit is enough for a full offline boot; an old worker no longer
  sweeps a staged update's cache.
- The Council Brief's intention is kept per seat, judged against the exact
  provinces held when the promise was made, and discarded when it belongs to
  a dead campaign on the same seed.
- The online drive compares a real SHA-256 state digest on both clients and
  proves the comparator can fail before trusting it.

## [0.5.0]: the open book (2026-07-12)

The experience wave and the second trust wave, in one release: battles stage
themselves, a stranger's first game teaches by doing, the map has a semantic
twin, online tables verify their own history, and the balance referee gained
the statistics to convict, then convicted, twice, and was obeyed.

- **The Battle Theater**: every fight opens as a staged scene: a stakes card
  carrying the odds you accepted, ranks of company chits, a balance that tips
  clash by clash at three speeds, and an aftermath naming the decisive
  moments and answering the forecast. Reduced motion keeps the still report.
- **The First Ember**: a guided first chronicle on a pinned friendly seed;
  six steps that only advance when the real thing happened in the action log.
  Skippable always; leads the title for first visits.
- **The Province Navigator** (`p`): the map as rows, fog-gated to exactly
  what the vellum shows, filterable, selection mirrored both ways. The Keys
  card moved to `?`; an axe accessibility gate joined CI at zero violations.
- **ActionEvaluation** (UX-030): one typed legality/cost/reason source that
  dry-runs the engine's own validator; the build and muster buttons read it.
- **Trust wave two**: online state checkpoints every ended season with
  freeze-on-divergence (NET-033); a crash boundary that sets the game down as
  "The emergency copy" (SAVE-033); the replay fixture verified nightly in
  Chromium, Firefox, and WebKit (DET-030); staged service-worker updates
  (BOOT_OK: a shell that cannot boot never destroys the last one that could),
  applied deliberately from the title.
- **QA-030 statistics**: the mirror harness now reports game-block bootstrap
  CIs and judges each lord against a ROPE equivalence band: a CI wholly
  outside expectation ±5pp fails the night conclusively; straddles are
  reported, never failed. Route attempts print beside wins so Golden Age
  rarity stays a choice. The harness judges and never tunes.
- **Allies press the same front** (rules v15): an allied banner beside a
  shared enemy's province lowers the AI's attack threshold and raises the
  prize, so allied wars converge instead of running in parallel; and the
  fierce or greedy now shop for war against a ≥34% leader someone else
  already fights (never over a pact, never from weakness). The sweep counts
  converging attacks to prove it fires.
- **recallMove** (rules v14): a peaceful march onto already-seen ground can
  be taken back the same season. A fight, a capture, or new ground glimpsed
  spends the season for good (no free scouting through the fog), a merge or
  hero change spends it too, and the AI never recalls. The army card offers
  the recall exactly when the engine would allow it.
- **The Council Brief** (`b`): next season's coin itemized, recent
  developments, open items with deep-links, the race, and a pinned intention;
  the End button whispers true omissions and never blocks.
- Disbanding a company and releasing a hero now arm on the first press and
  act on the second: nothing irreversible on a stray tap.
- **The chronicle at the right volume**: entries carry reading tiers
  (ceremony, decision, alert, weather), new lines since your last full
  reading wear an ember dot and count on the collapsed spine, and long wars
  mount only their trailing seasons; the rest unroll on request.
- **The endgame debrief and the share card**: the end screen names where
  the war turned (great land-grabs, fallen banners, the season the lead
  became permanent); a share card renders to PNG entirely on-device (victor,
  path, score, seed, the final map), and a copied seed link opens the same
  realm for anyone, never over a live game.
- **The rival table**: every living rival in one row: stance, their regard
  for you, lands, saga, signature readiness; the full card below as dossier.
- **The map's three lifetimes**: a renderer layer cache: terrain moves with
  the camera, politics with the action log, hover with the hand. A hover
  repaint fell from ~6 ms of cartography to 0.05 ms of composition, with
  screenshots within 0.2% of the old ink.
- **The phone mode bar**: Map, Realm, Lords, Chronicle at the thumb line,
  opening surfaces that already exist; the sheet sits on its shoulder.
  Setup folds the victory fine print; the gallery says HOW each lord plays
  (archetype line, candor chip) and recommends three first banners; iOS
  learns the Add-to-Home-Screen line; the smallest phones get a 320px gate.
- **Relay round two**: reconnects fetch only what they missed (`since` on
  both relays), room-minting is throttled, and every act carries the cid the
  start entry pinned to its seat (anti-spoofing among key-holders, labeled
  honestly; older editions stay welcome).
- **The offline keeper's card**: Settings shows the keeper's watch and a
  one-tap sweep that carries all 96 plates, songs, and voices home, with an
  honest megabyte count. CI gains a bundle budget (≤190 KB JS gz).
- **The three-eyed lint and the reconciling clerk**: ESLint on exactly the
  audit's classes (floating promises, loose equality, non-exhaustive
  switches; one finding in the codebase, fixed) and a content check that
  every plate is named and every name plated, on every PR.
- **The shelf keeps every age**: save migrations are a registry of record
  with tests that reopen an old chronicle and play it; Settings' credits
  carry the full honest ledger including the AI-art disclosure.
- **/lords/**: the twelve claimants as one crawlable page, rendered from
  the engine's own content; joined the sitemap beside the Codex export.
- **splitArmy** (rules v16): a banner may raise a second banner in place:
  mark the companies that march out, confirm, done. The new banner inherits
  the season already spent (a split never buys a free march) and heroes stay
  with the old banner. The Codex's Companies chapter states the rule.
- **One bar on phones**: the day-old bottom mode bar is gone; the topbar
  holds one non-wrapping row (sigil, coin, ember, season, drawers, End) and
  a labeled drawers sheet reaches every surface at thumb size. The map got
  the room back.
- **The First Ember plays under fog**: a newcomer's first page is a seat
  and its neighbors, not twelve banners; the guide teaches fog in the March
  step.
- **The intention reports back**: set a season's aim in the Brief and the
  next Brief scores it against what actually happened, from the same
  selectors the Ledger reads.
- The lobby says "Connected to the open table." instead of naming relay
  hostnames (a self-hosted override still shows its address on purpose),
  and the legal page tells the Wayhouse public-by-design truth and is
  linked from Settings.

The enforced balance gates, over ≥300 mirrored games: every lord's bootstrap
CI must touch expectation ±5pp (the ROPE gate: a CI wholly outside fails
conclusively; bare p-values are printed evidence, never gates, because twelve
simultaneous tests at p<0.01 would false-alarm one sweep in nine); dominion
≤ 40% of endings; other paths ≥ 4% (Golden Age: reachable); signatures
≥ 1.0 uses/seat. Refereed by that gate this release: Barrow Revenants swing
like the dead (4/4/5, raising costs 90 gold: a conclusive 41% Morrikan
winrate said a free elite standing army was too generous) and Open the Doors
returns every 16 seasons at −8 order; then the 600-game sweep convicted
Aldric at a conclusive 40%, so the compounding half of The Old Blood eased
(capital +10% → +5%) and the Royal Muster slowed to every 16 seasons; and
dominion, over its ceiling on four straight sweeps, holds `DOMINION_ROUNDS`
5 now (dominion 30% of endings, chronicle 31%, all five alive). Final
600-game sweep: every gate passes.

## [0.4.0]: the open realm (2026-07-12)

The round-2 audits arrived (8.9 and 8.8, both up from 8.4) and every finding
was validated and dispositioned in the roadmap ledger. This release
ships the trust batches both rounds demanded, the first experience flagship,
and the Wayhouse.

### Added
- **The Wayhouse**: open tables for strangers (`docs/design/open-tables.md`):
  a host can post their table to a well-known room on the same blind relay
  (its key is published on purpose: public is just "everyone holds the key");
  anyone opening Play with Friends sees the open tables and sits down with one
  tap, no link needed. Ads heartbeat while seats stay free, expire cold after
  30 minutes, withdraw on start/leave, and re-announce when seats fill. The
  plain-words warning ships with the toggle: a posted table is public.
  `drive-wayhouse.mjs` proves the whole stranger path: post → discover →
  sit → identical war on both clients.
- **Protocol v2 handshake**: hellos carry protocol + rules versions; the
  lobby names peers on a different edition, the host cannot start a mixed
  table, and a joiner refusing a foreign `start` gets plain instructions
  instead of a silent desync.
- **Idempotent appends**: every payload carries a random message id; both
  relay flavors dedupe retransmissions and replay the original entry, and the
  client settles its unacked ledger against the backlog on reconnect. The
  lost-ack duplicate is closed. Appends are also token-bucket throttled
  per socket (burst 20, 2/s refill) on both relays.
- **Validate-before-apply**: decrypted payloads pass structural bounds
  before use; anything unreadable or out of bounds becomes a tombstone
  identically on every honest client (one shared key: skipping is consistent,
  never a fork).
- **Save trust bundle**: every save write returns a typed result, writes are
  transactional (write → verify → rotate) with a last-known-good generation,
  save health is visible in Settings with retry/export, imports pass a 10 MB
  cap + structural validation + prototype-pollution rejection and can never
  touch the running game; 16 new tests including a 40-case fuzz corpus.
- **Workflows**: `nightly.yml` (300-game mirrored sweep with enforced gates
  + codex drift check), `deploy.yml` (tag-triggered build → codex export →
  deploy → live smoke; needs two repo secrets), and the PR pipeline now runs
  the real browser drives, desktop and mobile.
- **Invite hygiene**: the room key leaves the address bar the moment it is
  read (session storage carries the war across reloads; Copy invite rebuilds
  the link deliberately).

### Fixed (round-2 audit findings, all verified)
- The setup screen promised "3 consecutive seasons" for Dominion after rules
  v12 made it four. Victory copy now renders from the engine's constants,
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
- The changelog and the roadmap ledger now quote the enforced statistical
  gates, not one sweep's observed ranges, and a meta-test asserts the
  documented numbers equal the harness constants.

### Added: the first experience flagship
- **Season Digest** (rules **v13**): the chronicle no longer buries its good
  writing under ~237 routine lines. At every round end Osperan closes the
  season with one digest entry (`ChronicleEntry.digest`, a new `seasonDigest`
  bank with six count-parameterized variants) summarizing the season's
  ordinary business; routine ledger lines (insolvency, guild-loan bookkeeping)
  now carry `minor: true`. In the feed, a persisted **Digest** toggle (on by
  default, `rie-digest` in localStorage) groups entries under collapsible
  season headers: the current season expanded, older seasons folded to their
  digest line plus their ceremonies (which, along with battles, diplomacy,
  heroes, magic, events and teachings, are never digested). Digest off is
  exactly the old flat feed. The filter is a pure engine function
  (`filterChronicle`/`digestView` in `src/engine/narrator.ts`), shared with
  the new `tests/digest.test.ts`; a full AI game now reads in ~51 visible
  lines instead of ~239. Replay fixture refrozen at rules v13.

## [0.3.0]: the revision night (2026-07-11)

Four independent auditors read the game, the code, and the live site on
review night; their findings plus Michel's own phone report became the roadmap
ledger, every point validated and dispositioned. This release ships
the P0 layer.

### Fixed
- **Phones could not set up or play a war.** The setup screen's grid track
  inherited the config row's max-content width (~780px on a 390px phone) and
  clipped; the in-game bottom sheet sat under `pointer-events: none`, which
  iOS refuses to touch-scroll (Chrome allows it, which is why the drive
  scripts never saw it). Both fixed; drive-mobile now performs real touch
  scroll gestures and fails on any horizontal overflow. Form controls stay
  ≥16px on touch devices so iOS Safari stops zooming into the seed field.
- **Simultaneous victory claims** (rules v12) resolved by seat order,
  including equal-richest Golden Age ties. Claims are now collected from one
  snapshot and tie-broken on the path's own virtue (share and order for
  Dominion, gold and order for the Golden Age, saga progress for Legend),
  then the chronicle score, then a seeded lot. Never the seat.
- Deselecting every victory path silently restored Conquest; setup now says
  so and blocks, and the engine rejects pathless settings outright.

### Balance (rules v12): refereed by the new mirror harness
- `npm run sim -- --mirror`: every seat plays knight, lords deal round-robin,
  and statistical gates judge the sweep (per-lord two-sided test vs the
  seat-weighted baseline at p ≥ 0.01, ending bands, signature-use floor).
  The old mixed sweep hid a 44%-Corvas / 4%-Maera spread inside difficulty
  noise (both external audits caught it; the gates now cannot).
- Corvas' Call in the Debts softens by 1/√(rivals−1): no signature scales
  uncapped with table size (new standing rule, DECISIONS D-018).
- Fen Lights gained their offensive half: attacks launched from lit ground
  strike +15% harder. Maera's moors also yield +12 (was +9).
- Stand Fast gained the sally: +12% attacking from Halvard's own ground, and
  Stonefast walls now pay +4 gold in gate tolls: the wall finally earns.
- Morrikan's doors open at his seat (one company) on barrow-less seeds;
  the doors cool 12 seasons and raise one company per barrow.
- Seraphine's Great Vigil: +10 order, 3 gold tithe per province, and her AI
  actually calls it now. Aldric's capital yields +10% (was +20%) and Banner
  Knights discount eased to 10%; Royal Muster cools 12 seasons.
- `DOMINION_ROUNDS` 3 → 4; dominion endings 44% → 35% of AI games.
- Final 600-game mirrored sweep passed every enforced gate: per-lord
  fairness at p ≥ 0.01 vs the seat-weighted baseline, dominion ≤ 40% of
  endings, every other path ≥ 4% (Golden Age exempt: rare by decision,
  gated at ≥ 1 per 300 games), and every signature ≥ 1.0 uses/seat.
  Observed on that sweep (not gates): lords landed within 20–32% per seat
  (worst p = 0.019), all five endings alive, signatures at ≥ 1.5 uses/seat.

### Added
- **A landing page that exists**: rie.gg now serves real, styled, crawlable
  content (and a noscript block, VideoGame JSON-LD, robots.txt, sitemap.xml)
  before the app boots over it.
- **Copy bug report** in Settings: rules version, seed, settings, and the
  full action log: a byte-perfect repro in one tap.
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

## [0.2.0]: the adoption round (2026-07-11)

### Added
- **A domain**: the realm lives at rie.gg (realmsinembers.com redirects).
- **The Codex** (press c): Osperan's complete handbook: thirteen chapters,
  every number rendered from the engine's own constants so the book cannot
  drift; a Marginalia chapter that re-opens every teaching he has written
  for you; deep pagers, phone chip-nav, and a live line to the Ledger race.
- **Quick War**: one tap on the title, three tempers, straight into a
  fogged medium realm, routed through the lord gallery.
- **Spell Theater** (rules v10): every cast is inked onto the war table in
  its family's voice (gold blooms, iron-gall blots, compass-drawn wards,
  barrow wisps, scrying rings), and every lasting working leaves a wax
  seal on the province: round for helpful, torn for harmful, pips for
  seasons left. Family-voiced audio; battle playback flares its weavings.
  Fog-gated, reduced-motion-safe, byte-identical online.
- **Signature abilities** (rules v11): every lord now carries two
  abilities: the legacy they always had, and an active signature order
  with a cooldown the whole realm hears: the Great Vigil, Royal Muster,
  Stand Fast, the Dawn Oath, the Deep Roads, Fen Lights, Greenwood
  Ambush, the Embargo, Call in the Debts, Whisper Campaign, Open the
  Doors, Marked for the Crows. The AI fires all twelve on its own read
  of the moment; rivals' cards print both abilities and cooldown state.
- **The lord gallery**: choosing a banner is the set piece: painted
  portraits, creed filters, both ability cards, temperament in ink, one
  dry Osperan line each; wired into Quick War, setup, and the online
  lobby (picks ride the hellos; a contested banner goes to the earlier
  relay seq; unclaimed banners are dealt by fate).
- **The candidate rule for art**: every slot is generated three to five
  times and reviewed before the best ships (66 of 91 plates were
  upgraded in the first full review).
- Tooltips now carry the full mechanical contract: every unit trait line,
  hero class growth and wages, and enchantment chips that name the caster.

### Changed
- Explanations everywhere follow the humanizer standard: rules text in
  plain sentences with the number stated outright, fiction in Osperan's
  voice, never mixed in one line.
- The service worker fetches navigations network-first (fresh deploys on
  the next visit; the cached shell still answers offline).

## [The outstanding round]: 2026-07-09

### Added
- **The Illustrated Edition**: 43 painted plates in a late-80s game-manual
  airbrush style, generated against a single approved style anchor:
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
  different provinces, previewed jointly; the AI stages pincers.
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

## [0.1.0]: 2026-07-03

Initial complete game: procedural realms, twelve lords in three creeds,
itemized economy, 16-unit combat with odds previews, heroes/quests/saga,
magic, diplomacy with memory, personality AI, Osperan's chronicle and saga
export, hotseat + courier play, full accessibility pass. See FINAL_REPORT.md.
