/**
 * The share card: one PNG, rendered entirely on this device, saying how the
 * war ended — final map, the victor, the path, the score, and the seed so a
 * friend can forge the same realm. Nothing is uploaded anywhere; sharing is
 * the player's hand on the player's file. (RELEASE-STRATEGY: the share loop
 * must never cost the no-tracking promise.)
 */
import { LORD_BY_ID } from '../engine/content/lords';
import { chronicleScore } from '../engine/victory';
import type { GameState } from '../engine/types';
import { MapRenderer } from './mapRenderer';
import { playerColors, playerPatterns } from './format';
import { h } from './dom';

const PATH_LINE: Record<string, string> = {
  conquest: 'won by conquest',
  dominion: 'won by dominion',
  goldenAge: 'won by golden age',
  legend: 'won by legend',
  chronicle: 'won by the Chronicle’s judgment',
};

/** The seed link: opens the muster table with this realm's seed pinned.
 * Carries only the seed — no state, no names, nothing private. */
export function seedLink(state: GameState): string {
  return `${location.origin}${location.pathname}#seed=${encodeURIComponent(state.seed)}`;
}

/** Render the final map into an offscreen-but-laid-out canvas. The renderer
 * reads layout boxes, so the canvas briefly lives in the DOM, far off view. */
async function renderMapThumb(state: GameState, colorblind: boolean, w: number, hgt: number): Promise<HTMLCanvasElement> {
  const holder = h('div', { style: { position: 'fixed', left: '-10000px', top: '0', width: `${w}px`, height: `${hgt}px` } });
  const canvas = h('canvas', { style: { width: `${w}px`, height: `${hgt}px` } });
  holder.appendChild(canvas);
  document.body.appendChild(holder);
  try {
    const renderer = new MapRenderer(canvas);
    renderer.setView({
      mapW: state.mapW, mapH: state.mapH, cells: state.cells, provinces: state.provinces,
      playerColors: playerColors(state), playerPatterns: playerPatterns(state),
    });
    renderer.resize();
    renderer.fit();
    renderer.render({ colorblind });
    await new Promise((r) => requestAnimationFrame(r));
    return canvas;
  } finally {
    holder.remove();
  }
}

export async function downloadShareCard(state: GameState, colorblind: boolean): Promise<boolean> {
  const winner = state.victory.winner;
  if (winner === null) return false;
  const lord = LORD_BY_ID[state.players[winner].lordId];
  const path = state.victory.winPath ?? 'chronicle';
  const score = chronicleScore(state, winner).total;

  const mapW = 560;
  const mapH = 470;
  const map = await renderMapThumb(state, colorblind, mapW, mapH);

  const card = document.createElement('canvas');
  card.width = 1200;
  card.height = 630;
  const ctx = card.getContext('2d');
  if (!ctx) return false;

  // the dark table
  ctx.fillStyle = '#120d07';
  ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(320, 320, 60, 320, 320, 620);
  glow.addColorStop(0, 'rgba(224, 120, 48, 0.10)');
  glow.addColorStop(1, 'rgba(224, 120, 48, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 630);

  // the realm, as it ended
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(600, 60, mapW - 20, mapH + 40, 10);
  ctx.clip();
  ctx.drawImage(map, 600, 60, mapW - 20, mapH + 40);
  ctx.restore();
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(600, 60, mapW - 20, mapH + 40, 10);
  ctx.stroke();

  const serif = 'Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#c9a227';
  ctx.font = `24px ${serif}`;
  ctx.fillText('REALMS IN EMBERS', 64, 110);
  ctx.fillStyle = 'rgba(232, 220, 192, 0.65)';
  ctx.font = `italic 19px ${serif}`;
  ctx.fillText('Forty years after the Sundering', 64, 142);

  ctx.fillStyle = '#f0e6cf';
  ctx.font = `bold 44px ${serif}`;
  wrapText(ctx, lord.name, 64, 230, 500, 50);
  ctx.fillStyle = 'rgba(232, 220, 192, 0.8)';
  ctx.font = `italic 26px ${serif}`;
  ctx.fillText(lord.epithet, 64, 272);

  ctx.fillStyle = '#e07830';
  ctx.font = `28px ${serif}`;
  ctx.fillText(`${PATH_LINE[path]} — season ${state.turn}`, 64, 340);
  ctx.fillStyle = 'rgba(232, 220, 192, 0.85)';
  ctx.font = `24px ${serif}`;
  ctx.fillText(`Chronicle score ${score}`, 64, 382);

  ctx.strokeStyle = 'rgba(201, 162, 39, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 430);
  ctx.lineTo(540, 430);
  ctx.stroke();

  ctx.fillStyle = 'rgba(232, 220, 192, 0.6)';
  ctx.font = `20px ${serif}`;
  ctx.fillText(`seed “${state.seed}” — the same realm awaits anyone`, 64, 474);
  ctx.fillStyle = '#c9a227';
  ctx.font = `bold 26px ${serif}`;
  ctx.fillText('rie.gg', 64, 540);
  ctx.fillStyle = 'rgba(232, 220, 192, 0.5)';
  ctx.font = `18px ${serif}`;
  ctx.fillText('free · no accounts · no tracking', 150, 540);

  const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `realms-in-embers-${state.seed}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const probe = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(probe).width > maxW && line !== '') {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = probe;
    }
  }
  ctx.fillText(line, x, yy);
}
