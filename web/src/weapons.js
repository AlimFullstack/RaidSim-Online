export const WEAPONS = {
  pm: {
    id: 'pm',
    name: 'ПМ',
    magSize: 12,
    damage: 22,
    fireRate: 0.38,
    spread: 0.018,
    moveSpread: 0.08,
    sprintSpread: 0.2,
    pellets: 1,
    range: 9999,
    semiAuto: true,
    standToFire: true,
    bulletSpeed: 760,
    bulletSize: 2.5,
    recoilKick: 5,
    reloadTime: 1.6,
    muzzleColor: '#fff4c8',
    tracerColor: '#f5e6a8',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    magSize: 4,
    damage: 12,
    fireRate: 0.9,
    spread: 0.2,
    moveSpread: 0.1,
    sprintSpread: 0.22,
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
    magSize: 30,
    damage: 20,
    fireRate: 0.095,
    spread: 0.042,
    moveSpread: 0.06,
    sprintSpread: 0.14,
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
  if (moving) s += weapon.moveSpread || 0.05;
  if (sprinting) s += weapon.sprintSpread || 0.1;
  s += recoilHeat * (weapon.semiAuto ? 0.04 : 0.03);
  return s;
}

export function getMuzzleOffset(weaponId) {
  if (weaponId === 'shotgun') return { x: 26, y: 0 };
  if (weaponId === 'ak') return { x: 30, y: 0 };
  return { x: 22, y: 0 };
}
