import { describe, it, expect } from 'vitest';
import {
  pointInRect,
  circleRectCollision,
  rollLoot,
  dist,
  clamp,
  LOOT_TABLE,
} from '../src/map-core.js';
import { parseMapConfig } from '../src/map-loader.js';

describe('pointInRect', () => {
  it('detects inside', () => {
    expect(pointInRect(5, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });
  it('detects outside', () => {
    expect(pointInRect(15, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('circleRectCollision', () => {
  it('detects overlap', () => {
    expect(circleRectCollision(5, 5, 3, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });
  it('detects no overlap', () => {
    expect(circleRectCollision(50, 50, 3, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('rollLoot', () => {
  it('returns item from table', () => {
    const item = rollLoot('normal');
    expect(LOOT_TABLE.normal.some((i) => i.id === item.id)).toBe(true);
    expect(item.uid).toBeDefined();
  });
});

describe('dist', () => {
  it('computes distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
});

describe('clamp', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('parseMapConfig', () => {
  it('scales meter coordinates', () => {
    const map = parseMapConfig({
      id: 'test',
      name: 'Test',
      theme: 'default',
      walls: [{ x: 1, y: 1, w: 0.5, h: 0.5 }],
      extractZone: { x: 1, y: 1, w: 1, h: 1 },
      spawnPlayer: { x: 0.5, y: 0.5 },
      lootPoints: [{ x: 2, y: 2, tier: 'normal' }],
      scavSpawns: [{ x: 1, y: 1 }],
    });
    expect(map.walls[0].x).toBe(200);
    expect(map.spawnPlayer.x).toBe(100);
  });
});
