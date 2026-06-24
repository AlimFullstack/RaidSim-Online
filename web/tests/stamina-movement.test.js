import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities.js';
import { WALKING_STAND_SPREAD_MULT, calcSpread, STANDING_STILL_SPREAD, PLAYER_SPREAD_REDUCTION, WEAPONS } from '../src/weapons.js';
import { generateScavLoot } from '../src/map-core.js';

describe('stamina and movement', () => {
  it('drains stamina fully in 5 seconds of sprint', () => {
    const p = new Player(100, 100, []);
    const input = {
      pressed: (k) => k === 'ShiftLeft' || k === 'KeyW',
      tapped: () => false,
      mouse: { worldX: 200, worldY: 100, down: false, justDown: false },
    };
    for (let i = 0; i < 51; i++) p.update(input, 0.1, true);
    expect(p.stamina).toBeLessThan(0.01);
    expect(p.isSprinting).toBe(false);
  });

  it('regens after 2s stop over 4s', () => {
    const p = new Player(100, 100, []);
    p.stamina = 0;
    p.staminaRegenDelay = 0;
    p.tickStamina(0.1, false);
    expect(p.stamina).toBeCloseTo(0.025, 2);
    p.stamina = 0;
    p.staminaRegenDelay = 2;
    p.tickStamina(2.1, false);
    expect(p.staminaRegenDelay).toBe(0);
    p.tickStamina(4, false);
    expect(p.stamina).toBeCloseTo(1, 1);
  });

  it('standing still spread is 1 degree', () => {
    expect(WALKING_STAND_SPREAD_MULT).toBe(3);
    const standing = calcSpread(WEAPONS.ak, { moving: false, sprinting: false });
    const walking = calcSpread(WEAPONS.ak, { moving: true, sprinting: false });
    expect(standing).toBeCloseTo(STANDING_STILL_SPREAD, 5);
    const rawStanding = WEAPONS.ak.spread * 1.2;
    expect(walking).toBeCloseTo(Math.max(0, rawStanding * 3 - PLAYER_SPREAD_REDUCTION), 5);
  });

  it('generateScavLoot often includes ammo', () => {
    let ammoCount = 0;
    for (let i = 0; i < 40; i++) {
      const loot = generateScavLoot();
      if (loot.some((item) => item.id === 'ammo' || item.id === 'ammo2' || item.ammo)) ammoCount++;
    }
    expect(ammoCount).toBeGreaterThan(10);
  });
});
