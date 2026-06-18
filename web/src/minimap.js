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
  if (!map) return;

  const mapW = map.mapW;
  const mapH = map.mapH;
  const scaleX = size / mapW;
  const scaleY = size / mapH;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(10, 12, 8, 0.9)';
  ctx.strokeStyle = 'rgba(138, 154, 122, 0.5)';
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, size, size);
  ctx.strokeRect(x0, y0, size, size);

  const tx = (wx) => x0 + wx * scaleX;
  const ty = (wy) => y0 + wy * scaleY;

  ctx.fillStyle = 'rgba(46, 204, 113, 0.4)';
  ctx.fillRect(tx(map.extractZone.x), ty(map.extractZone.y), map.extractZone.w * scaleX, map.extractZone.h * scaleY);

  ctx.fillStyle = 'rgba(93, 173, 226, 0.5)';
  for (const lp of game.lootPoints) {
    if (lp.searched) continue;
    ctx.beginPath();
    ctx.arc(tx(lp.x), ty(lp.y), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const scav of game.scavs) {
    if (scav.dead) continue;
    ctx.fillStyle = scav.isBoss ? '#b39ddb' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(tx(scav.x), ty(scav.y), scav.isBoss ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.player && !game.player.dead) {
    ctx.fillStyle = '#8a9a7a';
    ctx.beginPath();
    ctx.arc(tx(game.player.x), ty(game.player.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const viewW = game.canvas.width / game.scale;
  const viewH = game.canvas.height / game.scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x0 + game.camX * scaleX,
    y0 + game.camY * scaleY,
    viewW * scaleX,
    viewH * scaleY
  );

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '8px JetBrains Mono';
  ctx.fillText('MAP', x0 + 4, y0 + 10);
  ctx.restore();
}
