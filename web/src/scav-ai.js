import { dist, circleRectCollision } from './map-core.js';

/** @param {import('./entities.js').Scav[]} scavs */
export function alertNearbyScavs(scavs, x, y, radius, alertX, alertY) {
  for (const s of scavs) {
    if (s.dead) continue;
    if (dist(s.x, s.y, x, y) <= radius) {
      s.alertPos = { x: alertX, y: alertY };
        if (s.state !== 'attack') {
          s.state = 'investigate';
          s.fireCooldown = Math.min(s.fireCooldown ?? 0, 0.15);
        }
    }
  }
}

/** @param {object[]} walls */
export function findFreeSpawnNear(x, y, walls, r = 15, attempts = 14) {
  for (let i = 0; i < attempts; i++) {
    const ang = (i / attempts) * Math.PI * 2;
    const d = 36 + (i % 4) * 22;
    const nx = x + Math.cos(ang) * d;
    const ny = y + Math.sin(ang) * d;
    let ok = true;
    for (const w of walls) {
      if (circleRectCollision(nx, ny, r, w)) {
        ok = false;
        break;
      }
    }
    if (ok) return { x: nx, y: ny };
  }
  return { x, y };
}

/** @param {import('./entities.js').SmokeZone[]} smokes */
export function isBlindedBySmoke(ax, ay, tx, ty, smokes) {
  const segLen = dist(ax, ay, tx, ty);
  if (segLen < 6) return false;
  for (const s of smokes) {
    if (!s || s.life <= 0) continue;
    const dTo = dist(tx, ty, s.x, s.y);
    const dFrom = dist(ax, ay, s.x, s.y);
    if (dTo >= s.r) continue;
    if (dFrom <= dTo) continue;
    const dLine = distPointToSegment(s.x, s.y, ax, ay, tx, ty);
    if (dLine < s.r * 0.92) return true;
  }
  return false;
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}
