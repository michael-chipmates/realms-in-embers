# Security

Realms in Embers has no accounts, no tracking, and no server-side game state. Saves live in your browser. The only thing that ever touches a network is online play, so this page says plainly what that protects and what it does not.

## What the encryption protects

Online play runs over a blind relay. Every action that leaves your device is encrypted with AES-GCM (128-bit). The key lives only in the invite link's URL fragment, which browsers never send over the wire, and the room id is bound in as additional authenticated data, so ciphertext from one room cannot be replayed into another. The relay stores opaque blobs and ordinals. It cannot read a single move.

That holds for any relay operator, including us, and for anyone watching the wire.

## What it does not protect

The invite link is the room. Anyone holding the full link — key and all — can read the whole war and act in it. There is no anti-cheat, no identity, and no way to tell one holder of the link from another. Online play is a table for trusted friends: share the invite like you'd share your front-door key, and start a fresh room if a link gets loose.

## Reporting

- Something sensitive: open a [private security advisory](https://github.com/michael-chipmates/realms-in-embers/security/advisories/new) on GitHub.
- Everything else: a regular [issue](https://github.com/michael-chipmates/realms-in-embers/issues) is fine.

Either way, thank you for telling us.
