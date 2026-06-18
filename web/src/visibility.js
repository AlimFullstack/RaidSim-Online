/** Доля экрана, которую игрок «видит» (по площади круга обзора) */
export const VISION_COVERAGE_NORMAL = 0.92;
export const VISION_COVERAGE_CRITICAL = 0.55;
export const CRITICAL_HP_RATIO = 0.2;

/** @param {object} baseTheme @param {number} viewW @param {number} viewH @param {number} [hpRatio] */
export function buildVisionTheme(baseTheme, viewW, viewH, hpRatio = 1) {
  const halfDiag = Math.hypot(viewW, viewH) / 2;
  const coverage = hpRatio < CRITICAL_HP_RATIO ? VISION_COVERAGE_CRITICAL : VISION_COVERAGE_NORMAL;
  const r = halfDiag * Math.sqrt(coverage) * 1.28;
  return {
    ...baseTheme,
    visionRadius: r,
    coneRange: r,
    coneAngle: Math.PI,
  };
}

/** Мягкая дыра в тумане — без жёстких граней полигона */
export function fillSoftVision(ctx, px, py, radius) {
  const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** @param {number} ox @param {number} oy @param {number} dx @param {number} dy @param {{x:number,y:number,w:number,h:number}} rect */
function rayIntersectAABB(ox, oy, dx, dy, rect) {
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.w;
  const y2 = rect.y + rect.h;
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-9) {
    if (ox < x1 || ox > x2) return null;
  } else {
    const tx1 = (x1 - ox) / dx;
    const tx2 = (x2 - ox) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  }

  if (Math.abs(dy) < 1e-9) {
    if (oy < y1 || oy > y2) return null;
  } else {
    const ty1 = (y1 - oy) / dy;
    const ty2 = (y2 - oy) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  }

  if (tmin > tmax || tmax < 0.5) return null;
  const t = tmin >= 0.5 ? tmin : tmax;
  return t >= 0.5 ? t : null;
}

/** @param {number} ox @param {number} oy @param {number} angle @param {object[]} walls @param {number} maxDist */
export function raycastWall(ox, oy, angle, walls, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxDist;

  for (const w of walls) {
    const t = rayIntersectAABB(ox, oy, dx, dy, w);
    if (t !== null && t < best) best = t;
  }

  return { x: ox + dx * best, y: oy + dy * best, dist: best };
}

/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {object[]} walls */
export function hasLineOfSight(ax, ay, bx, by, walls) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 4) return true;
  const angle = Math.atan2(by - ay, bx - ax);
  const hit = raycastWall(ax, ay, angle, walls, d);
  return hit.dist >= d - 6;
}

function wallCorners(w) {
  return [
    { x: w.x, y: w.y },
    { x: w.x + w.w, y: w.y },
    { x: w.x + w.w, y: w.y + w.h },
    { x: w.x, y: w.y + w.h },
  ];
}

function normAngle(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

/** @param {number} px @param {number} py @param {number} aim @param {object[]} walls @param {object} theme */
export function computeVisionPolygon(px, py, aim, walls, theme) {
  const footR = theme.visionRadius;
  const coneR = theme.coneRange;
  const half = theme.coneAngle;
  const angles = new Set();

  for (let i = 0; i < 72; i++) angles.add((i / 72) * Math.PI * 2);
  for (let i = 0; i <= 44; i++) angles.add(aim - half + ((2 * half * i) / 44));

  for (const w of walls) {
    for (const v of wallCorners(w)) {
      const a = Math.atan2(v.y - py, v.x - px);
      angles.add(a);
      angles.add(a - 0.0008);
      angles.add(a + 0.0008);
    }
  }

  const sorted = [...angles].sort((a, b) => a - b);
  return sorted.map((a) => {
    let maxR = footR;
    const delta = normAngle(a - aim);
    if (Math.abs(delta) <= half) maxR = Math.max(maxR, coneR);
    return raycastWall(px, py, a, walls, maxR);
  });
}

/** @param {number} px @param {number} py @param {number} tx @param {number} ty @param {number} aim @param {object[]} walls @param {object} theme */
export function canSeePoint(px, py, tx, ty, aim, walls, theme) {
  const d = Math.hypot(tx - px, ty - py);
  const angle = Math.atan2(ty - py, tx - px);
  const delta = normAngle(angle - aim);
  const inFoot = d <= theme.visionRadius;
  const inCone = Math.abs(delta) <= theme.coneAngle && d <= theme.coneRange;
  if (!inFoot && !inCone) return false;
  return hasLineOfSight(px, py, tx, ty, walls);
}

/** @param {CanvasRenderingContext2D} ctx @param {{x:number,y:number}[]} points @param {number} px @param {number} py */
export function fillVisionPolygon(ctx, points, px, py) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
}
