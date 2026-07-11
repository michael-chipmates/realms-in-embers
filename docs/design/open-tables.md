# Open Tables — how strangers find a war

**Design session, 2026-07-12** (Michel's question: multiplayer works when a link
is shared — but what about players with nobody to share it with?). This is the
deep brainstorm and the chosen design. Status: **specified, ready to build —
the first item of the next session.**

## The problem, precisely

Today the invite link is the room: capability, key, and address in one URL
fragment. That is perfect for friends and useless for strangers — there is no
place where a willing stranger can *stand* and be seen. The game has no
accounts and no readable server (the relay is blind by design), so every
classic matchmaking answer (lobbies with identity, MMR, server browsers with
authenticated sessions) is off the table. Good. The constraint is the design.

## The options considered

1. **A public tables board ("the Wayhouse").** Hosts opt in to publish their
   open table; strangers browse and join. The invite IS the capability, and
   publishing it is exactly what "open to strangers" means — the trust model
   shifts explicitly from "my friends" to "the public", which the UI must say
   out loud. ✅ **Chosen — it is the smallest honest answer.**
2. **Blind date matchmaking (a queue that pairs two waiting strangers).**
   Needs a matchmaker that holds state about people — even anonymous, it's a
   queue service with liveness, timeouts, and pairing logic; more machinery,
   zero added warmth. It also produces 1v1s between two people with nothing in
   common at 3 a.m. — the Wayhouse's browsable tables (see the terms, the
   clock, the seats) make better matches with less code. ❌ Not now.
3. **Async pen-pal wars (courier by strangers).** Courier play already works
   file-by-file; a public board of "seeking a correspondent" ads could match
   slow players. Charming, very on-brand — but it is the same board mechanism
   as option 1 with a different ad type. ✅ Folded in: a Wayhouse ad can be
   marked *courier* ("a war by letters, one season a day").
4. **Scheduled war nights (a standing time, e.g. "Embers burn Sundays 20:00
   CET").** Zero code: a line on the title screen + a Wayhouse that fills up
   at that hour. Solves the empty-room cold-start problem that kills every
   small game's matchmaking. ✅ Folded in as a product ritual (GTM drumbeat,
   RELEASE-STRATEGY §4 R3).
5. **Community spaces (Discord/Discussions LFG).** Happens anyway; the game
   should link to it but never depend on it. ➖ GTM, not product.
6. **Bots-as-fallback.** Already exists — AI fill is one toggle. The lobby
   should offer "fill empty seats with rivals and start" after 5 quiet
   minutes, so posting to the Wayhouse never strands the host. ✅ Folded in.

## The chosen design: the Wayhouse

*"Every realm has a wayhouse — the room where travelers who have never met
agree to ruin each other's evening."*

### Architecture (reuses the blind relay wholesale)

- One **well-known room** per relay: `wayhouse-v1`. Ads are appended as
  entries encrypted with a **published, hardcoded key** — one code path with
  normal rooms, the relay stays byte-blind and needs zero new endpoints;
  "public" is just "the key is printed in the client".
- An **ad** is a tiny JSON blob: `{ v, kind: 'live'|'courier', name, terms:
  { size, seats, taken, clock, fog, rules }, invite, postedAt, hostBeat }`.
  Hard cap ~600 bytes, client-enforced and client-sanitized (text nodes only —
  the existing rule).
- **Freshness without deletion** (append-only log): ads expire client-side
  (hidden after 30 min without a heartbeat). The host's lobby re-appends a
  one-line heartbeat every 10 min while seats remain. Browsers dedupe by room
  id, newest wins, full ads capped at the latest ~50.
- **Joining** = following the invite in the ad — the existing flow untouched.

### The UI (Online screen gains one section)

- Host side: after creating a room — a quiet toggle: **"Post this table in
  the Wayhouse"** with the plain-words warning: *"Anyone may sit down. A
  posted table is public: strangers can watch and play. Unpost any time."*
- Guest side: **"The Wayhouse"** lists open tables: host's chosen name, realm
  size, seats (2/4 taken), clock, fog, live-or-courier, posted-when. One tap
  sits you down. Empty state does the cold-start honestly: *"No tables at
  this hour. Post one and keep your lamp lit — or the rivals are always
  willing"* (buttons: Post a table · Play the AI · war nights note).
- Auto-fill: a posted table offers the host "call in AI rivals and begin"
  once it has waited five minutes.

### Abuse, in order of likelihood

1. **Spam/griefing ads** — relay byte caps exist; add per-IP append throttle
   on the wayhouse room specifically (NET-005 work, same ticket), client-side
   sanitization + length caps, and ads are text nodes (XSS-clean by the
   existing discipline). A "hide this table" local mute.
2. **Griefers joining games** — an open table is public by definition; the
   host keeps the tools they have (don't start until the roster looks right)
   plus the P1 seat-binding work (cid on acts — ROADMAP §2.4) which matters
   MORE once strangers exist; it moves up with this feature.
3. **Dead ads** — solved by heartbeats + client expiry, not moderation.
4. **The relay's own load** — one room, capped entries, existing TTL. The
   14-day room TTL is fine; the wayhouse just keeps rolling.

### What this deliberately does not do

No accounts, no rankings, no skill matching, no chat-before-join, no server
that can read anything but sizes and times. If the Wayhouse ever needs
moderation beyond throttles and local mutes, the answer is war nights and
community spaces, not identity.

### Implementation plan (next session, ~1 day + drives)

1. `net.ts`: wayhouse append/subscribe using the published key (one constant,
   one code path). ~80 lines.
2. `lobby.ts`: post toggle + heartbeat; Wayhouse list on the Online screen;
   auto-fill offer. ~150 lines.
3. Relay throttle for the well-known room (worker + node parity).
4. `drive-online.mjs` extension: two headless clients — one posts, the other
   discovers and joins through the Wayhouse, war starts, byte-identical state.
5. Copy pass through the humanizer; the warning text is rules-register.

**Acceptance:** a player with no friends opens Online → sees tables or posts
one → is in a war (with a stranger or willing rivals) inside two minutes,
without ever pasting a link; the relay still cannot read a move; drive covers
the full stranger path.

### The cold-start truth

A board is only as alive as the hour you open it. That is why war nights
(option 4) ship WITH the Wayhouse in the same release, why the empty state
sells the AI table instead of apologizing, and why the Week's Seed
(RELEASE-STRATEGY §5) gives solo players a shared fire to sit around even
when the Wayhouse is quiet.
