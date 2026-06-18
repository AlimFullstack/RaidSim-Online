import { METER, MAP_W, MAP_H } from './map-core.js';

/** @param {import('./types.d.ts').MapConfig} raw */
export function parseMapConfig(raw) {
  const scale = (v, m = false) => (m ? v * METER : v * METER);

  const walls = raw.walls.map((w) => ({
    x: scale(w.x, w.m),
    y: scale(w.y, w.m),
    w: scale(w.w, w.m),
    h: scale(w.h, w.m),
  }));

  const pt = (p) => ({ x: p.x * METER, y: p.y * METER });

  return {
    id: raw.id,
    name: raw.name,
    theme: raw.theme || 'default',
    walls,
    extractZone: {
      x: raw.extractZone.x * METER,
      y: raw.extractZone.y * METER,
      w: raw.extractZone.w * METER,
      h: raw.extractZone.h * METER,
    },
    spawnPlayer: pt(raw.spawnPlayer),
    lootPoints: raw.lootPoints.map((p) => ({ ...pt(p), tier: p.tier || 'normal' })),
    scavSpawns: raw.scavSpawns.map(pt),
    bossSpawn: raw.bossSpawn ? pt(raw.bossSpawn) : null,
    mapW: MAP_W,
    mapH: MAP_H,
  };
}

const cache = new Map();

/** @param {string} mapId */
export async function loadMap(mapId = 'factory') {
  if (cache.has(mapId)) return cache.get(mapId);
  const base = import.meta.env.BASE_URL || './';
  const res = await fetch(`${base}maps/${mapId}.json`);
  if (!res.ok) throw new Error(`Map not found: ${mapId}`);
  const raw = await res.json();
  const parsed = parseMapConfig(raw);
  cache.set(mapId, parsed);
  return parsed;
}

export function getMapList() {
  return [
    { id: 'factory', name: 'Завод 4×4', theme: 'default' },
    { id: 'night', name: 'Ночной двор', theme: 'night' },
  ];
}
