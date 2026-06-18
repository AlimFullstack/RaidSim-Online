import { METER } from './map-core.js';
import { expandRawMap } from './map-expand.js';

/** @param {import('./types.d.ts').MapConfig} raw */
export function parseMapConfig(raw) {
  const expanded = expandRawMap(raw);
  const gridW = expanded.gridW;
  const gridH = expanded.gridH;
  const mapW = gridW * METER;
  const mapH = gridH * METER;

  const toPx = (v) => v * METER;

  const walls = expanded.walls.map((w) => ({
    x: toPx(w.x),
    y: toPx(w.y),
    w: toPx(w.w),
    h: toPx(w.h),
  }));

  const pt = (p) => ({ x: toPx(p.x), y: toPx(p.y) });

  return {
    id: expanded.id,
    name: expanded.name,
    theme: expanded.theme || 'default',
    walls,
    extractZone: {
      x: toPx(expanded.extractZone.x),
      y: toPx(expanded.extractZone.y),
      w: toPx(expanded.extractZone.w),
      h: toPx(expanded.extractZone.h),
    },
    spawnPlayer: pt(expanded.spawnPlayer),
    lootPoints: expanded.lootPoints.map((p) => ({ ...pt(p), tier: p.tier || 'normal' })),
    scavSpawns: expanded.scavSpawns.map(pt),
    bossSpawn: expanded.bossSpawn ? pt(expanded.bossSpawn) : null,
    mapW,
    mapH,
    gridW,
    gridH,
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
    {
      id: 'factory',
      name: 'Завод 12×12',
      theme: 'default',
      desc: 'Компактная промзона — лут и Scav рядом',
      threat: 'Средняя',
      scavCount: 8,
      timeLabel: 'День',
    },
    {
      id: 'night',
      name: 'Ночной сектор 12×12',
      theme: 'night',
      desc: 'Темнота, плотные засады',
      threat: 'Высокая',
      scavCount: 9,
      timeLabel: 'Ночь',
    },
  ];
}

export function getMapById(mapId) {
  return getMapList().find((m) => m.id === mapId) || getMapList()[0];
}
