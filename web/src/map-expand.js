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

/**
 * Expand a compact 4×4 map layout to a larger world (default ×10 → 40×40 grid units).
 * @param {object} raw — map JSON
 * @param {number} [scale=10]
 */
export function expandRawMap(raw, scale = raw.worldScale ?? 10) {
  const gridW = (raw.gridW ?? 4) * scale;
  const gridH = (raw.gridH ?? 4) * scale;
  const rng = seededRandom(raw.id || 'map');

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

  for (let i = 0; i < 40; i++) {
    walls.push({
      x: 0.4 + rng() * (gridW - 1.2),
      y: 0.4 + rng() * (gridH - 1.2),
      w: 0.18 + rng() * 0.55,
      h: 0.18 + rng() * 0.55,
    });
  }

  const lootPoints = raw.lootPoints.map((p) => ({ ...mulPt(p), tier: p.tier || 'normal' }));
  for (let i = 0; i < 24; i++) {
    lootPoints.push({
      x: 0.5 + rng() * (gridW - 1),
      y: 0.5 + rng() * (gridH - 1),
      tier: rng() > 0.78 ? 'valuable' : 'normal',
    });
  }

  const scavSpawns = raw.scavSpawns.map(mulPt);
  for (let i = 0; i < 14; i++) {
    scavSpawns.push({
      x: 1 + rng() * (gridW - 2),
      y: 1 + rng() * (gridH - 2),
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
