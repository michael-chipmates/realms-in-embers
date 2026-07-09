/** Boot: theme, app shell, title screen — or straight to a war you were
 * invited to (the invite key rides the URL fragment; it never leaves
 * this device). */
import './theme.css';
import './game.css';
import { App } from './app';
import { preloadArtManifest } from './art';
import { parseInvite } from './net';
import { openOnlineLobby } from './screens/lobby';

const root = document.getElementById('app');
if (!root) throw new Error('no #app mount point');

preloadArtManifest();
const app = new App(root);
const invite = parseInvite(location.hash);
if (invite) {
  void openOnlineLobby(app, invite);
} else {
  app.toTitle();
}

// offline keeper: after first visit the whole game works with no network
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js');
  });
}
