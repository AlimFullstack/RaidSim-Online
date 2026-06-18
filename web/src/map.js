export const METER = 200;
export const MAP_W = METER * 4;
export const MAP_H = METER * 4;

export const RAID_DURATION = 8 * 60;
export const EXTRACT_TIME = 5;

export const COLORS = {
  floor: '#1a1f16',
  floorGrid: '#242b1f',
  wall: '#4a4035',
  wallTop: '#6b5d4d',
  cover: '#3d3428',
  extract: 'rgba(46, 204, 113, 0.25)',
  extractBorder: '#2ecc71',
  player: '#c9a227',
  scav: '#b33a3a',
  bullet: '#f5e6a8',
  loot: '#5dade2',
  lootRare: '#d4ac0d',
};

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** @type {Rect[]} */
export const WALLS = [
  // outer bounds (thick border walls)
  { x: 0, y: 0, w: MAP_W, h: 24 },
  { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
  { x: 0, y: 0, w: 24, h: MAP_H },
  { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },

  // north L-cover between spawns
  { x: METER * 1.2, y: METER * 0.3, w: 48, h: METER * 0.7 },
  { x: METER * 1.2, y: METER * 0.3, w: METER * 0.6, h: 48 },

  // north east cover (2 cubes)
  { x: METER * 2.8, y: METER * 0.35, w: 80, h: 80 },
  { x: METER * 3.1, y: METER * 0.55, w: 80, h: 80 },

  // center cross
  { x: METER * 1.85, y: METER * 1.5, w: METER * 0.3, h: METER },
  { x: METER * 1.5, y: METER * 1.85, w: METER, h: METER * 0.3 },

  // east long wall with window gap
  { x: METER * 3.35, y: METER * 2.5, w: 56, h: METER * 0.55 },
  { x: METER * 3.35, y: METER * 3.35, w: 56, h: METER * 0.55 },

  // west crate stack
  { x: METER * 0.25, y: METER * 1.1, w: 72, h: 72 },
  { x: METER * 0.25, y: METER * 1.45, w: 72, h: 72 },
  { x: METER * 0.25, y: METER * 1.8, w: 96, h: 48 },

  // narrow passage
  { x: METER * 0.55, y: METER * 2.35, w: 64, h: 64 },
  { x: METER * 1.15, y: METER * 2.55, w: 64, h: 64 },

  // extract gate cubes (sides only)
  { x: METER * 1.45, y: METER * 3.55, w: 56, h: 56 },
  { x: METER * 2.45, y: METER * 3.55, w: 56, h: 56 },

  // south east corner cover
  { x: METER * 3.2, y: METER * 3.1, w: 80, h: 80 },
];

export const EXTRACT_ZONE = {
  x: METER * 1.5,
  y: METER * 3.0,
  w: METER,
  h: METER,
};

export const SPAWN_PLAYER = { x: METER * 0.45, y: METER * 3.35 };

/** @type {{ x: number, y: number, tier: 'normal' | 'valuable' }[]} */
export const LOOT_POINTS = [
  { x: METER * 2.0, y: METER * 2.0, tier: 'valuable' },
  { x: METER * 1.75, y: METER * 1.75, tier: 'valuable' },
  { x: METER * 0.55, y: METER * 1.35, tier: 'valuable' },
  { x: METER * 1.0, y: METER * 1.25, tier: 'normal' },
  { x: METER * 0.75, y: METER * 2.75, tier: 'normal' },
  { x: METER * 2.0, y: METER * 1.25, tier: 'normal' },
  { x: METER * 2.75, y: METER * 2.25, tier: 'normal' },
  { x: METER * 3.2, y: METER * 2.85, tier: 'normal' },
  { x: METER * 1.5, y: METER * 2.5, tier: 'normal' },
  { x: METER * 3.5, y: METER * 0.65, tier: 'normal' },
];

export const SCAV_SPAWNS = [
  { x: METER * 3.35, y: METER * 0.55 },
  { x: METER * 2.5, y: METER * 1.2 },
  { x: METER * 3.0, y: METER * 2.0 },
  { x: METER * 1.8, y: METER * 3.2 },
];

export const LOOT_TABLE = {
  normal: [
    { id: 'empty', name: 'Пусто', weight: 2, value: 0 },
    { id: 'coin', name: 'Монета', weight: 3, value: 1 },
    { id: 'ammo', name: 'Патроны', weight: 3, value: 0, ammo: 12 },
    { id: 'bandage', name: 'Бинт', weight: 2, value: 0, heal: 25 },
    { id: 'food', name: 'Еда', weight: 2, value: 1 },
    { id: 'bolt', name: 'Болт', weight: 2, value: 2 },
    { id: 'chain', name: 'Цепь', weight: 1, value: 5 },
  ],
  valuable: [
    { id: 'ammo2', name: 'Патроны x2', weight: 2, value: 0, ammo: 24 },
    { id: 'medkit', name: 'Аптечка', weight: 3, value: 0, heal: 50, consumable: true },
    { id: 'armor', name: 'Бронежилет', weight: 2, value: 8, armor: 25 },
    { id: 'chain', name: 'Золотая цепь', weight: 2, value: 10 },
    { id: 'gpu', name: 'Видеокарта', weight: 1, value: 15 },
    { id: 'key', name: 'Ключ', weight: 1, value: 6 },
  ],
};

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function circleRectCollision(cx, cy, cr, r) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(cx, cy, cr, r) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  let dx = cx - closestX;
  let dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= cr * cr || distSq === 0) return { x: cx, y: cy };
  const dist = Math.sqrt(distSq);
  const overlap = cr - dist;
  return { x: cx + (dx / dist) * overlap, y: cy + (dy / dist) * overlap };
}

export function rollLoot(tier) {
  const table = LOOT_TABLE[tier];
  const total = table.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of table) {
    roll -= item.weight;
    if (roll <= 0) return { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}` };
  }
  return { ...table[0], uid: `empty-${Date.now()}` };
}

export function generateScavLoot() {
  const count = 1 + Math.floor(Math.random() * 3);
  const items = [];
  for (let i = 0; i < count; i++) {
    let item = rollLoot('normal');
    let attempts = 0;
    while (item.id === 'empty' && attempts < 5) {
      item = rollLoot('normal');
      attempts++;
    }
    if (item.id !== 'empty') items.push(item);
  }
  if (items.length === 0) {
    items.push({ id: 'coin', name: 'Монета', weight: 1, value: 1, uid: `coin-${Date.now()}` });
  }
  return items;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
