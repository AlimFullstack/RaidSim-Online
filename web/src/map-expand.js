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
  const mulWall = (w) => ({ x: mul(w.x), y: mul(w.y), w: mul(w.w), h: mul(w.h), m: w.m });
  const mulZone = (z) => ({ x: mul(z.x), y: mul(z.y), w: mul(z.w), h: mul(z.h) });

  const borderWalls = [
    { x: 0, y: 0, w: gridW, h: 0.12, m: 1 },
    { x: 0, y: gridH - 0.12, w: gridW, h: 0.12, m: 1 },
    { x: 0, y: 0, w: 0.12, h: gridH, m: 1 },
    { x: gridW - 0.12, y: 0, w: 0.12, h: gridH, m: 1 },
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

  const extraWalls = Math.max(8, Math.round(15 * density));
  for (let i = 0; i < extraWalls; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)];
    const p = clusterPoint(a, 1, rng, 1.1);
    walls.push({
      x: Math.max(0.3, Math.min(gridW - 0.8, p.x)),
      y: Math.max(0.3, Math.min(gridH - 0.8, p.y)),
      w: 0.18 + rng() * 0.45,
      h: 0.18 + rng() * 0.45,
    });
  }

  const lootPoints = raw.lootPoints.map((p) => ({ ...mulPt(p), tier: p.tier || 'normal' }));
  const extraLoot = Math.max(6, Math.round(10 * density));
  for (let i = 0; i < extraLoot; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)];
    const p = clusterPoint(a, 1, rng, 1.6);
    lootPoints.push({
      x: Math.max(0.4, Math.min(gridW - 0.6, p.x)),
      y: Math.max(0.4, Math.min(gridH - 0.6, p.y)),
      tier: rng() > 0.75 ? 'valuable' : 'normal',
    });
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
