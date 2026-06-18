import { describe, it, expect } from 'vitest';
import { isValidLootPosition } from '../src/map-expand.js';
import { alertNearbyScavs } from '../src/scav-ai.js';

describe('map-expand loot', () => {
  it('rejects loot inside walls', () => {
    const walls = [{ x: 1, y: 1, w: 0.5, h: 0.5 }];
    expect(isValidLootPosition(1.2, 1.2, walls)).toBe(false);
    expect(isValidLootPosition(2.5, 2.5, walls)).toBe(true);
  });

  it('ignores border walls marked with m', () => {
    const walls = [{ x: 0, y: 0, w: 12, h: 0.12, m: 1 }];
    expect(isValidLootPosition(6, 6, walls)).toBe(true);
  });
});

describe('scav-ai alerts', () => {
  it('alertNearbyScavs sets investigate state', () => {
    const scavs = [
      { dead: false, x: 100, y: 100, state: 'patrol', alertPos: null },
      { dead: false, x: 800, y: 800, state: 'patrol', alertPos: null },
    ];
    alertNearbyScavs(scavs, 110, 110, 200, 500, 500);
    expect(scavs[0].state).toBe('investigate');
    expect(scavs[0].alertPos).toEqual({ x: 500, y: 500 });
    expect(scavs[1].state).toBe('patrol');
  });
});
