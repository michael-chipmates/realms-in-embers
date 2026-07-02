/** Boot: theme, app shell, title screen. */
import './theme.css';
import './game.css';
import { App } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('no #app mount point');

const app = new App(root);
app.toTitle();
