# An AI played my strategy game a few hundred seasons and filed better bug reports than I do

*A devlog draft for Realms in Embers ([realmsinembers.com](https://realmsinembers.com)) — free in the
browser, no accounts, no tracking. Publish target: itch.io devlog, once the
listing exists.*

Realms in Embers is a deterministic, turn-based fantasy strategy game: seed
plus action log equals save equals replay equals netcode. That determinism
bought me an unusual playtester — a language model that plays a real seat
through the real engine, one JSON action at a time, with every illegal move
rejected by the same validator human clicks go through.

## The harness

`scripts/model-playtest.mjs` deals the model one seat at a 2–6 lord table.
Every season it gets a plain-text view of what its lord may legitimately see
(fog included), a cookbook of legal action shapes, and — this turned out to
be the load-bearing part — **the rejections from its previous season, with
the engine's own error messages**. It ends each game with a structured
debrief: what confused you, what felt strong, what could you never see?

## What it found

- **A real exploit.** The guild loan (borrow now, repay over seasons) was
  free money if taken close to the chronicle's final season — the game ended
  before repayment. The model found this in its first smoke run and used it,
  repeatedly and shamelessly. The loan is now gated eight seasons before the
  close (rules v7), and the fixture canary remembers.
- **Every vague error message.** Early rejection strings ("The land does not
  suit it") taught the model nothing; it retried variations for whole
  seasons. Terrain gates now name the terrain, cost failures name the number.
  The rejection rate across the series fell from **28% → 12.5% → 7.9% →
  3.1%** as the messages sharpened — and human players get the same words.
- **Treaty passage vs. capture confusion.** It marched "through" an ally
  expecting ground it did not get. The harness view (and later the game's
  own tooltips) now label treaty passage explicitly.
- **"I cannot see who is winning."** Its debriefs kept asking for the
  victory race. That request became the Realm Ledger's race board, then the
  Council Brief's race line, and honest "who leads each ending" visibility
  everywhere.

## Why this works at all

None of it would function without determinism. The model plays the same
engine build a browser runs; a rejected action costs nothing and mutates
nothing; a suspicious game replays byte-for-byte from its log. When it finds
an exploit, the fix is refereed by a 300-game mirrored AI sweep with
statistical gates — never by feel.

The model is not a balance oracle — it plays a fair-to-middling game and
overvalues gold like a first-time player. That is precisely what makes its
confusion reports valuable: it is an inexhaustible, articulate newcomer that
files structured debriefs at three in the morning and never gets tired of
being asked "and what did you expect to happen?"

---

*Realms in Embers is open source (AGPL-3.0, content CC BY-SA 4.0):
[github.com/michael-chipmates/realms-in-embers](https://github.com/michael-chipmates/realms-in-embers).*
