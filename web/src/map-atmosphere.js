/** Палитры и параметры атмосферы карт */
export const MAP_THEMES = {
  factory: {
    id: 'factory',
    label: 'Завод',
    floor: '#141810',
    floorGrid: '#1e2218',
    floorAlt: '#10140e',
    wall: '#3a3428',
    wallTop: '#5a4e3a',
    wallShadow: 'rgba(0,0,0,0.45)',
    accent: '#8a7a4a',
    rust: 'rgba(120, 58, 28, 0.35)',
    oil: 'rgba(18, 14, 10, 0.55)',
    hazard: '#c9a227',
    fogColor: 'rgba(0, 0, 0, 1)',
    fogTint: 'rgba(48, 32, 12, 0.1)',
    visionRadius: 155,
    coneRange: 270,
    coneAngle: 0.62,
    ambientLabel: 'Промзона · ржавчина · тусклый свет',
  },
  night: {
    id: 'night',
    label: 'Ночной сектор',
    floor: '#060810',
    floorGrid: '#0c1018',
    floorAlt: '#04060c',
    wall: '#1a2030',
    wallTop: '#2a3448',
    wallShadow: 'rgba(0,0,8,0.55)',
    accent: '#4a6a9a',
    rust: 'rgba(40, 60, 100, 0.25)',
    oil: 'rgba(8, 16, 32, 0.5)',
    hazard: '#3a7ab8',
    fogColor: 'rgba(0, 0, 0, 1)',
    fogTint: 'rgba(12, 20, 48, 0.14)',
    visionRadius: 125,
    coneRange: 250,
    coneAngle: 0.55,
    ambientLabel: 'Ночь · неон · лужи',
  },
  default: null,
};

MAP_THEMES.default = MAP_THEMES.factory;

/** @param {string} themeId */
export function getMapTheme(themeId) {
  return MAP_THEMES[themeId] || MAP_THEMES.factory;
}

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Детерминированные декали пола */
export function drawMapDecor(ctx, mapConfig, time = 0) {
  const theme = getMapTheme(mapConfig?.theme);
  const mapW = mapConfig?.mapW || 2400;
  const mapH = mapConfig?.mapH || 2400;
  const rng = seededRandom(mapConfig?.id || 'map');
  const isNight = mapConfig?.theme === 'night';

  for (let i = 0; i < 28; i++) {
    const x = rng() * mapW;
    const y = rng() * mapH;
    const rx = 18 + rng() * 55;
    const ry = 12 + rng() * 35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.fillStyle = theme.oil;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!isNight && rng() > 0.55) {
      ctx.fillStyle = theme.rust;
      ctx.beginPath();
      ctx.ellipse(rng() * 8, rng() * 8, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (isNight) {
    for (let i = 0; i < 6; i++) {
      const lx = 200 + rng() * (mapW - 400);
      const ly = 200 + rng() * (mapH - 400);
      const flicker = 0.55 + Math.sin(time * 3 + i * 2.1) * 0.2;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 90 + rng() * 60);
      g.addColorStop(0, `rgba(80, 140, 220, ${0.12 * flicker})`);
      g.addColorStop(0.5, `rgba(40, 70, 140, ${0.05 * flicker})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 120, ly - 120, 240, 240);
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const x = rng() * mapW;
      const y = rng() * mapH;
      ctx.strokeStyle = 'rgba(60, 52, 38, 0.2)';
      ctx.lineWidth = 3 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 120, y + (rng() - 0.5) * 80);
      ctx.stroke();
    }
  }

  const ez = mapConfig?.extractZone;
  if (ez) {
    const ey = ez.y + ez.h / 2;
    ctx.strokeStyle = isNight ? 'rgba(58, 122, 184, 0.35)' : 'rgba(201, 162, 39, 0.4)';
    ctx.lineWidth = 2;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(ez.x - 8, ey + s * (ez.h / 2 + 6));
      ctx.lineTo(ez.x + ez.w + 8, ey + s * (ez.h / 2 + 6));
      ctx.stroke();
    }
  }
}

export function drawThematicWalls(ctx, walls, theme) {
  for (const w of walls) {
    const kind = w.kind || 'cover';
    if (kind === 'border') {
      ctx.fillStyle = theme.wallShadow;
      ctx.fillRect(w.x + 4, w.y + 5, w.w, w.h);
      ctx.fillStyle = theme.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      continue;
    }

    ctx.fillStyle = theme.wallShadow;
    ctx.fillRect(w.x + 5, w.y + 6, w.w, w.h);

    const top = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    if (kind === 'crate') {
      top.addColorStop(0, theme.wallTop);
      top.addColorStop(0.4, theme.wall);
      top.addColorStop(1, '#1a1610');
    } else if (kind === 'room') {
      top.addColorStop(0, '#4a4438');
      top.addColorStop(1, '#222018');
    } else {
      top.addColorStop(0, theme.wallTop);
      top.addColorStop(0.35, theme.wall);
      top.addColorStop(1, '#181410');
    }
    ctx.fillStyle = top;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    if (kind === 'crate') {
      ctx.strokeStyle = theme.accent || '#8a7a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w.x + w.w * 0.2, w.y + 2);
      ctx.lineTo(w.x + w.w * 0.2, w.y + w.h - 2);
      ctx.moveTo(w.x + w.w * 0.8, w.y + 2);
      ctx.lineTo(w.x + w.w * 0.8, w.y + w.h - 2);
      ctx.stroke();
    } else if (kind === 'room') {
      ctx.strokeStyle = 'rgba(200, 180, 120, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, Math.min(8, w.h * 0.15));
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }
}

export function drawMapAmbienceOverlay(ctx, mapConfig, time = 0) {
  const isNight = mapConfig?.theme === 'night';
  if (isNight) {
    const pulse = 0.85 + Math.sin(time * 1.5) * 0.08;
    ctx.fillStyle = `rgba(4, 8, 24, ${0.06 * pulse})`;
    ctx.fillRect(0, 0, mapConfig?.mapW || 2400, mapConfig?.mapH || 2400);
  }
}
