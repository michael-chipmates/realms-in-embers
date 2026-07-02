/**
 * The chronicle closes: victory or defeat with full ceremony, the campaign
 * graphs, the itemized final standing, and the Saga export.
 */
import { LORD_BY_ID } from '../../engine/content/lords';
import { chronicleScore } from '../../engine/victory';
import { provincesOf } from '../../engine/helpers';
import { h } from '../dom';
import { lordDisplay } from '../format';
import { openModal } from '../modal';
import { breakdown, tip } from '../tooltip';
import { buildSaga, downloadSaga } from '../saga';
import { audio } from '../audio';
import type { GameScreen } from './game';

const PATH_TEXT: Record<string, string> = {
  conquest: 'by conquest — the last banner standing',
  dominion: 'by dominion — the realm held past arguing',
  goldenAge: 'by golden age — the war ended by prosperity',
  legend: 'by legend — the Ember Throne rekindled',
  chronicle: 'by the judgment of the Chronicle',
};

export function showGameEnd(screen: GameScreen): void {
  const state = screen.state;
  const winner = state.victory.winner;
  if (winner === null) return;
  const winnerLord = LORD_BY_ID[state.players[winner].lordId];
  const viewerWon = state.players[winner].kind === 'human';
  const path = state.victory.winPath ?? 'chronicle';

  if (viewerWon) audio.fanfare();
  else audio.dirge();

  // ---- campaign graph: provinces over time, one ink line per lord
  const graph = renderCampaignGraph(screen);

  const standings = state.players
    .map((p) => ({ p, score: chronicleScore(state, p.id) }))
    .sort((a, b) => b.score.total - a.score.total)
    .map(({ p, score }, idx) => {
      const lord = LORD_BY_ID[p.lordId];
      const row = h('div', { class: 'standing-row' },
        h('span', { class: 'standing-rank' }, `${idx + 1}.`),
        h('span', { class: 'lord-swatch', style: { background: lord.color } }),
        h('span', { class: 'standing-name' }, `${lord.name}${p.alive ? '' : ' †'}${p.id === winner ? ' — the victor' : ''}`),
        h('span', { class: 'standing-score' }, String(score.total)),
      );
      tip(row, () => breakdown(`${lord.name} — final standing`, score.lines, `${score.total} points`));
      return row;
    });

  const heroesOfNote = Object.values(state.heroes)
    .filter((hh) => hh.level >= 4 || hh.status === 'dead')
    .sort((a, b) => b.level - a.level)
    .slice(0, 6)
    .map((hh) => h('p', { class: 'small' },
      `${hh.name}, ${hh.epithet} — level ${hh.level} ${lordDisplay(state, hh.owner).name.split(' ')[0]}'s ${hh.cls}` +
      (hh.status === 'dead' ? `; fell ${hh.deathCause ?? 'in the war'} (season ${hh.diedTurn})` : '; lives to see the peace')));

  const content = h('div', { class: 'gameend-body' },
    h('p', { class: 'gameend-line italic' },
      viewerWon
        ? `The realm is yours, ${PATH_TEXT[path]}. Osperan's pen rests at last.`
        : `${winnerLord.name}, ${winnerLord.epithet}, has won the realm ${PATH_TEXT[path]}. Your part in the chronicle is written.`),
    graph,
    h('div', { class: 'overlay-columns' },
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'Final standings'),
        ...standings,
      ),
      h('div', { class: 'overlay-col' },
        h('h3', { class: 'settings-head' }, 'Names the age will keep'),
        ...(heroesOfNote.length > 0 ? heroesOfNote : [h('p', { class: 'small muted italic' }, 'No hero rose high enough for the margins. A quiet war, as wars go.')]),
      ),
    ),
    h('div', { class: 'gameend-actions' },
      h('button', {
        class: 'btn btn-seal',
        onclick: () => {
          const saga = buildSaga(state);
          openSagaModal(screen, saga);
        },
      }, 'Read the finished Saga'),
      h('button', { class: 'btn', onclick: () => downloadSaga(state) }, 'Save the Saga to a file'),
      h('button', {
        class: 'btn',
        onclick: () => {
          modal.close();
        },
      }, 'Look over the final map'),
      h('button', {
        class: 'btn',
        onclick: () => {
          modal.close();
          screen.app.toTitle();
        },
      }, 'To the title'),
    ),
  );

  const modal = openModal(
    viewerWon ? 'The Chronicle Ends — in Your Name' : 'The Chronicle Ends',
    content,
    { wide: true, className: 'gameend-modal' },
  );
}

function renderCampaignGraph(screen: GameScreen): HTMLElement {
  const state = screen.state;
  const stats = state.stats;
  if (stats.length < 2) return h('div');
  const w = 640;
  const hgt = 160;
  const maxProvinces = Math.max(4, ...stats.flatMap((s) => s.perPlayer.map((pp) => pp.provinces)));
  const lines = state.players.map((player) => {
    const lord = LORD_BY_ID[player.lordId];
    const points = stats.map((s, i) => {
      const pp = s.perPlayer.find((x) => x.player === player.id);
      const x = (i / (stats.length - 1)) * (w - 20) + 10;
      const y = hgt - 14 - ((pp?.provinces ?? 0) / maxProvinces) * (hgt - 28);
      return `${Math.round(x)},${Math.round(y)}`;
    }).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${lord.color}" stroke-width="2.5" stroke-linejoin="round" opacity="0.9"/>`;
  }).join('');
  const graph = h('div', {
    class: 'campaign-graph',
    html: `<svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" role="img" aria-label="Provinces held by each lord across the war">${lines}</svg>`,
  });
  return h('div', {},
    h('h3', { class: 'settings-head' }, 'The shape of the war — provinces held, season by season'),
    graph,
  );
}

export function openSagaModal(screen: GameScreen, sagaText: string): void {
  void screen;
  const pre = h('div', { class: 'saga-reader' });
  pre.innerText = sagaText;
  const content = h('div', { style: { padding: '0.4rem 0.8rem 0.8rem', maxWidth: 'min(760px, 90vw)' } },
    pre,
    h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' } },
      h('button', {
        class: 'btn',
        onclick: () => {
          void navigator.clipboard?.writeText(sagaText);
        },
      }, 'Copy it all'),
    ),
  );
  openModal('The Saga, as Osperan finished it', content, { wide: true });
}
