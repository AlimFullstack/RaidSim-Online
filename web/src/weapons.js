/** Базовый разброс при ходьбе */
const WALK_SPREAD = 0.62;
const SPRINT_SPREAD = 0.78;
const STANDING_ACCURACY_MULT = 0.6;
const WALKING_MOVE_SPREAD_MULT = 0.6;
const STANDING_FIRE_RATE_MULT = 1 / 1.05;

export const WEAPONS = {
  pm: {
    id: 'pm',
    name: 'ПМ',
    magSize: 18,
    damage: 22,
    fireRate: 0.38,
    spread: 0.018,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: true,
    standToFire: false,
    bulletSpeed: 760,
    bulletSize: 2.5,
    recoilKick: 5,
    reloadTime: 1.6,
    muzzleColor: '#fff4c8',
    tracerColor: '#f5e6a8',
  },
  pp: {
    id: 'pp',
    name: 'ПП-91',
    magSize: 30,
    damage: 14,
    fireRate: 0.065,
    spread: 0.048,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: false,
    standToFire: false,
    bulletSpeed: 680,
    bulletSize: 2.8,
    recoilKick: 4,
    reloadTime: 1.8,
    muzzleColor: '#ffe08a',
    tracerColor: '#ffd866',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    magSize: 6,
    damage: 12,
    fireRate: 0.9,
    spread: 0.2,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 6,
    range: 240,
    semiAuto: true,
    standToFire: false,
    bulletSpeed: 520,
    bulletSize: 2,
    recoilKick: 14,
    reloadTime: 2.2,
    muzzleColor: '#ffaa66',
    tracerColor: '#ffcc88',
  },
  ak: {
    id: 'ak',
    name: 'АК-74',
    magSize: 45,
    damage: 20,
    fireRate: 0.095,
    spread: 0.042,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: false,
    standToFire: false,
    bulletSpeed: 920,
    bulletSize: 3,
    recoilKick: 7,
    reloadTime: 2,
    muzzleColor: '#ffb347',
    tracerColor: '#ffd080',
  },
};

/** @param {string} id */
export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.pm;
}

/** Total spread angle (radians) from weapon + movement + recoil */
export function calcSpread(weapon, { moving, sprinting, recoilHeat = 0 }) {
  let s = weapon.spread || 0;
  if (!moving && !sprinting) {
    s *= STANDING_ACCURACY_MULT;
  } else {
    if (moving) s += (weapon.moveSpread || WALK_SPREAD) * WALKING_MOVE_SPREAD_MULT;
    if (sprinting) s += weapon.sprintSpread || SPRINT_SPREAD;
  }
  s += recoilHeat * (weapon.semiAuto ? 0.04 : 0.03);
  return s;
}

/** Cooldown between shots; standing player shoots ~5% faster */
export function getFireRate(weapon, { moving = false, sprinting = false } = {}) {
  const rate = weapon.fireRate || 0;
  return moving || sprinting ? rate : rate * STANDING_FIRE_RATE_MULT;
}

export function getMuzzleOffset(weaponId) {
  if (weaponId === 'shotgun') return { x: 26, y: 0 };
  if (weaponId === 'ak') return { x: 30, y: 0 };
  if (weaponId === 'pp') return { x: 24, y: 0 };
  return { x: 22, y: 0 };
}
