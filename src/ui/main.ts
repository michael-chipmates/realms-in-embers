/** Boot: theme, app shell, title screen, or straight to a war you were
 * invited to (the invite key rides the URL fragment; it never leaves
 * this device). */
import './theme.css';
import './game.css';
import { App } from './app';
import { preloadArtManifest } from './art';
import { parseInvite } from './net';
import { openOnlineLobby } from './screens/lobby';
import { registerSw } from './swUpdate';

const root = document.getElementById('app');
if (!root) throw new Error('no #app mount point');

// The static landing in index.html exists for crawlers and the no-JS crowd;
// the app takes the room over from here. (Screens also clear #app, but the
// invite path renders asynchronously: remove it now so it never lingers.)
document.getElementById('landing')?.remove();

preloadArtManifest();
const app = new App(root);
// The invite key comes off the address bar the moment it's read (round-2
// audit): screenshots, history sync, and shoulder surfing see a clean URL.
// The war survives a reload through session storage; "Copy invite" in the
// lobby reconstructs the full link deliberately.
const fromHash = parseInvite(location.hash);
const stashed = sessionStorage.getItem('rie-war');
const invite = fromHash ?? (stashed ? parseInvite(`#war=${stashed}`) : null);
if (fromHash) {
  sessionStorage.setItem('rie-war', `${fromHash.roomId}.${fromHash.key}`);
  history.replaceState(null, '', location.pathname);
}
// a shared seed link (#seed=…) opens the muster table with that realm
// pinned: it carries nothing but the seed
const seedMatch = location.hash.match(/#seed=([^&]+)/);
if (invite) {
  // a truncated or tampered invite key must fail into the hall, not a blank room
  openOnlineLobby(app, invite).catch(() => {
    sessionStorage.removeItem('rie-war');
    history.replaceState(null, '', location.pathname);
    app.toTitle();
  });
} else if (seedMatch) {
  history.replaceState(null, '', location.pathname);
  app.toSetup(decodeURIComponent(seedMatch[1]).slice(0, 128));
} else {
  app.toTitle();
}

// a seed link pasted over the OPEN app is a same-document navigation; honor
// it, but never over a live chronicle, which a stray link must not destroy
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/#seed=([^&]+)/);
  if (!m || app.gameScreen) return;
  history.replaceState(null, '', location.pathname);
  app.toSetup(decodeURIComponent(m[1]).slice(0, 128));
});

// offline keeper: after first visit the whole game works with no network.
// The registration is staged: see swUpdate.ts for the BOOT_OK handshake.
if (import.meta.env.PROD) {
  registerSw();
}
