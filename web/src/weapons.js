/** Базовый разброс при ходьбе */
const WALK_SPREAD = 0.62;
const SPRINT_SPREAD = 0.78;
export const STANDING_ACCURACY_MULT = 1.2;
/** При ходьбе разброс = стоя × этот множитель */
export const WALKING_STAND_SPREAD_MULT = 3;
/** Бонус точности игрока (вычитается из итогового разброса) */
export const PLAYER_SPREAD_REDUCTION = 0.1;
const STANDING_FIRE_RATE_MULT = 1 / 1.05;

export const PLAYER_FIRE_RATE_MULT = 0.5;
export const PLAYER_BULLET_SPEED_MULT = 2;
export const RAID_LOOT_VALUE_MULT = 5;
/** Визуальный масштаб пуль (радиус и толщина трассера) */
export const BULLET_SIZE_MULT = 0.72;

const SNIPER_MIN_SPREAD = Math.PI / 180;
const SNIPER_STABILIZE_TIME = 0.35;
/** Разброс игрока стоя на месте (1°) */
export const STANDING_STILL_SPREAD = Math.PI / 180;

export const WEAPONS = {
  pm: {
    id: 'pm',
    name: 'ПМ',
    magSize: 18,
    damage: 10,
    fireRate: 0.38,
    spread: 0.018,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: true,
    standToFire: false,
    bulletSpeed: 760,
    bulletSize: 1.1,
    recoilKick: 5,
    reloadTime: 1.6,
    muzzleColor: '#fff4c8',
    tracerColor: '#f5e6a8',
  },
  pp: {
    id: 'pp',
    name: 'ПП-91',
    magSize: 30,
    damage: 12,
    fireRate: 0.065,
    spread: 0.048,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: false,
    standToFire: false,
    bulletSpeed: 680,
    bulletSize: 1.2,
    recoilKick: 4,
    reloadTime: 1.8,
    muzzleColor: '#ffe08a',
    tracerColor: '#ffd866',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    magSize: 6,
    damage: 9,
    fireRate: 0.9,
    spread: 0.2,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 6,
    range: 240,
    semiAuto: true,
    standToFire: false,
    bulletSpeed: 520,
    bulletSize: 0.9,
    recoilKick: 14,
    reloadTime: 2.2,
    muzzleColor: '#ffaa66',
    tracerColor: '#ffcc88',
  },
  ak: {
    id: 'ak',
    name: 'АК-74',
    magSize: 45,
    damage: 16,
    fireRate: 0.095,
    spread: 0.042,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: false,
    standToFire: false,
    bulletSpeed: 920,
    bulletSize: 1.3,
    recoilKick: 7,
    reloadTime: 2,
    muzzleColor: '#ffb347',
    tracerColor: '#ffd080',
  },
  sniper: {
    id: 'sniper',
    name: 'СВД',
    magSize: 1,
    damage: 140,
    fireRate: 1.1,
    spread: 0.042,
    moveSpread: WALK_SPREAD,
    sprintSpread: SPRINT_SPREAD,
    pellets: 1,
    range: 9999,
    semiAuto: true,
    standToFire: true,
    sniper: true,
    bulletSpeed: 1100,
    bulletSize: 1.2,
    recoilKick: 12,
    reloadTime: 2.8,
    muzzleColor: '#e8dcc8',
    tracerColor: '#f0e6d0',
  },
};

/** @param {string} id */
export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.pm;
}

/** Total spread angle (radians) from weapon + movement + recoil — без бонуса игрока */
function calcSpreadBase(weapon, { moving, sprinting, recoilHeat = 0 }) {
  let s;
  if (!moving && !sprinting) {
    s = STANDING_STILL_SPREAD;
  } else {
    const standing = (weapon.spread || 0) * STANDING_ACCURACY_MULT;
    s = standing * WALKING_STAND_SPREAD_MULT;
    if (sprinting) s += weapon.sprintSpread || SPRINT_SPREAD;
  }
  s += recoilHeat * (weapon.semiAuto ? 0.04 : 0.03);
  return s;
}

/** Total spread angle (radians) from weapon + movement + recoil */
export function calcSpread(weapon, { moving, sprinting, recoilHeat = 0 }) {
  if (!moving && !sprinting) {
    return Math.max(0, calcSpreadBase(weapon, { moving, sprinting, recoilHeat }));
  }
  return Math.max(0, calcSpreadBase(weapon, { moving, sprinting, recoilHeat }) - PLAYER_SPREAD_REDUCTION);
}

/** Sniper: walk spread while moving, stabilizes to 1° when stopped */
export function calcSniperSpread(weapon, { moving, sprinting, stoppedTime = 0, recoilHeat = 0 }) {
  if (moving || sprinting) {
    return calcSpread(weapon, { moving: true, sprinting, recoilHeat });
  }
  const movingSpread = calcSpread(weapon, { moving: true, sprinting: false, recoilHeat: 0 });
  const t = Math.min(1, stoppedTime / SNIPER_STABILIZE_TIME);
  return movingSpread + (STANDING_STILL_SPREAD - movingSpread) * t + recoilHeat * 0.04;
}

/** Cooldown between shots; standing player shoots ~5% faster */
export function getFireRate(weapon, { moving = false, sprinting = false } = {}) {
  const rate = weapon.fireRate || 0;
  return moving || sprinting ? rate : rate * STANDING_FIRE_RATE_MULT;
}

export function getMuzzleOffset(weaponId) {
  if (weaponId === 'sniper') return { x: 38, y: 0 };
  if (weaponId === 'shotgun') return { x: 26, y: 0 };
  if (weaponId === 'ak') return { x: 30, y: 0 };
  if (weaponId === 'pp') return { x: 24, y: 0 };
  return { x: 22, y: 0 };
}
