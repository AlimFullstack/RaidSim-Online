import { describe, it, expect } from 'vitest';
import {
  WEAPONS,
  calcSpread,
  calcSniperSpread,
  STANDING_ACCURACY_MULT,
  STANDING_STILL_SPREAD,
  PLAYER_SPREAD_REDUCTION,
  getWeapon,
} from '../src/weapons.js';

describe('weapons balance', () => {
  it('PM damage is 10, others reduced 25%', () => {
    expect(WEAPONS.pm.damage).toBe(10);
    expect(WEAPONS.pp.damage).toBe(11);
    expect(WEAPONS.ak.damage).toBe(15);
    expect(WEAPONS.shotgun.damage).toBe(9);
  });

  it('standing still spread is 1 degree', () => {
    expect(STANDING_STILL_SPREAD).toBeCloseTo(Math.PI / 180, 6);
    const standing = calcSpread(WEAPONS.ak, { moving: false, sprinting: false });
    expect(standing).toBeCloseTo(Math.PI / 180, 5);
  });

  it('walking spread is 3x weapon standing base minus player bonus', () => {
    const walking = calcSpread(WEAPONS.ak, { moving: true, sprinting: false });
    const rawStanding = WEAPONS.ak.spread * STANDING_ACCURACY_MULT;
    expect(walking).toBeCloseTo(Math.max(0, rawStanding * 3 - PLAYER_SPREAD_REDUCTION), 5);
  });

  it('sniper spread matches walk while moving', () => {
    const moving = calcSniperSpread(WEAPONS.sniper, { moving: true, stoppedTime: 0 });
    const akWalk = calcSpread(getWeapon('ak'), { moving: true, sprinting: false });
    expect(moving).toBeCloseTo(akWalk, 5);
  });

  it('sniper spread stabilizes to 1 degree when stopped', () => {
    const stable = calcSniperSpread(WEAPONS.sniper, { moving: false, stoppedTime: 0.35 });
    expect(stable).toBeCloseTo(Math.PI / 180, 3);
  });

  it('sniper has standToFire and 3-round mag', () => {
    expect(WEAPONS.sniper.standToFire).toBe(true);
    expect(WEAPONS.sniper.magSize).toBe(3);
    expect(WEAPONS.sniper.damage).toBe(150);
  });
});
