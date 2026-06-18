/** Deterministic RNG from string seed */
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function clusterPoint(anchor, scale, rng, spread = 1.4) {
  return {
    x: anchor.x * scale + (rng() - 0.5) * spread,
    y: anchor.y * scale + (rng() - 0.5) * spread,
  };
}

/** @param {number} x @param {number} y @param {object[]} walls @param {number} [pad] */
export function isValidLootPosition(x, y, walls, pad = 0.14) {
  for (const w of walls) {
    if (w.m) continue;
    if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) {
      return false;
    }
  }
  return true;
}

function placeLootPoint(walls, rng, gridW, gridH, tier, anchors, attempts = 24) {
  for (let i = 0; i < attempts; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)];
    const p = clusterPoint(a, 1, rng, 1.8);
    const x = Math.max(0.45, Math.min(gridW - 0.55, p.x));
    const y = Math.max(0.45, Math.min(gridH - 0.55, p.y));
    if (isValidLootPosition(x, y, walls)) return { x, y, tier };
  }
  for (let i = 0; i < 40; i++) {
    const x = 0.5 + rng() * (gridW - 1);
    const y = 0.5 + rng() * (gridH - 1);
    if (isValidLootPosition(x, y, walls)) return { x, y, tier };
  }
  return { x: gridW / 2, y: gridH / 2, tier };
}

/**
 * Expand a compact 4×4 map layout to a larger world (default ×3 → 12×12 grid units).
 * @param {object} raw — map JSON
 * @param {number} [scale=3]
 */
export function expandRawMap(raw, scale = raw.worldScale ?? 3) {
  const gridW = (raw.gridW ?? 4) * scale;
  const gridH = (raw.gridH ?? 4) * scale;
  const rng = seededRandom(raw.id || 'map');
  const density = (scale / 10) ** 2;

  const mul = (v) => v * scale;
  const mulPt = (p) => ({ x: mul(p.x), y: mul(p.y) });
  const mulWall = (w) => ({
    x: mul(w.x),
    y: mul(w.y),
    w: mul(w.w),
    h: mul(w.h),
    m: w.m,
    kind: w.kind,
  });
  const mulZone = (z) => ({ x: mul(z.x), y: mul(z.y), w: mul(z.w), h: mul(z.h) });

  const borderWalls = [
    { x: 0, y: 0, w: gridW, h: 0.12, m: 1, kind: 'border' },
    { x: 0, y: gridH - 0.12, w: gridW, h: 0.12, m: 1, kind: 'border' },
    { x: 0, y: 0, w: 0.12, h: gridH, m: 1, kind: 'border' },
    { x: gridW - 0.12, y: 0, w: 0.12, h: gridH, m: 1, kind: 'border' },
  ];

  const interiorWalls = raw.walls
    .filter((_, i) => i >= 4)
    .map(mulWall);

  const walls = [...borderWalls, ...interiorWalls];

  const anchors = [
    ...raw.lootPoints,
    ...raw.scavSpawns,
    raw.spawnPlayer,
    raw.extractZone ? { x: raw.extractZone.x + 0.5, y: raw.extractZone.y + 0.5 } : null,
  ].filter(Boolean);

  const extraWalls = Math.max(12, Math.round(18 * density));
  for (let i = 0; i < extraWalls; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)];
    const p = clusterPoint(a, 1, rng, 1.1);
    const isSmall = rng() > 0.45;
    walls.push({
      x: Math.max(0.3, Math.min(gridW - 0.8, p.x)),
      y: Math.max(0.3, Math.min(gridH - 0.8, p.y)),
      w: isSmall ? 0.18 + rng() * 0.12 : 0.28 + rng() * 0.22,
      h: isSmall ? 0.18 + rng() * 0.12 : 0.28 + rng() * 0.22,
      kind: rng() > 0.25 ? 'crate' : 'cover',
    });
  }

  const lootPoints = raw.lootPoints.map((p) => {
    const pt = { x: mul(p.x), y: mul(p.y), tier: p.tier || 'normal' };
    if (!isValidLootPosition(pt.x, pt.y, walls)) {
      return placeLootPoint(walls, rng, gridW, gridH, p.tier || 'normal', anchors.map((a) => ({ x: mul(a.x), y: mul(a.y) })));
    }
    return pt;
  });

  const extraLoot = Math.max(8, Math.round(12 * density));
  for (let i = 0; i < extraLoot; i++) {
    const tier = rng() > 0.75 ? 'valuable' : 'normal';
    lootPoints.push(placeLootPoint(walls, rng, gridW, gridH, tier, anchors.map((a) => ({ x: mul(a.x), y: mul(a.y) }))));
  }

  const scavSpawns = raw.scavSpawns.map(mulPt);
  const extraScavs = Math.max(3, Math.round(5 * density));
  for (let i = 0; i < extraScavs; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)];
    const p = clusterPoint(a, 1, rng, 1.8);
    scavSpawns.push({
      x: Math.max(0.6, Math.min(gridW - 0.6, p.x)),
      y: Math.max(0.6, Math.min(gridH - 0.6, p.y)),
    });
  }

  return {
    ...raw,
    gridW,
    gridH,
    walls,
    extractZone: mulZone(raw.extractZone),
    spawnPlayer: mulPt(raw.spawnPlayer),
    lootPoints,
    scavSpawns,
    bossSpawn: raw.bossSpawn ? mulPt(raw.bossSpawn) : null,
  };
}
