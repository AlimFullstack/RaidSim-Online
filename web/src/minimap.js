/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./game.js').Game} game
 */
export function drawMinimap(ctx, game) {
  const size = 120;
  const pad = 10;
  const x0 = game.canvas.width - size - pad;
  const y0 = pad;
  const map = game.activeMap;
  const p = game.player;
  if (!map || !p) return;

  const scaleX = size / map.mapW;
  const scaleY = size / map.mapH;
  const tx = (wx) => x0 + wx * scaleX;
  const ty = (wy) => y0 + wy * scaleY;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(10, 12, 8, 0.9)';
  ctx.strokeStyle = 'rgba(138, 154, 122, 0.5)';
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, size, size);
  ctx.strokeRect(x0, y0, size, size);

  const ez = map.extractZone;
  const ex = ez.x + ez.w / 2;
  const ey = ez.y + ez.h / 2;
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath();
  ctx.arc(tx(ex), ty(ey), 4, 0, Math.PI * 2);
  ctx.fill();

  if (!p.dead) {
    ctx.fillStyle = '#8a9a7a';
    ctx.beginPath();
    ctx.arc(tx(p.x), ty(p.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '8px JetBrains Mono';
  ctx.fillText('MAP', x0 + 4, y0 + 10);
  ctx.restore();
}
