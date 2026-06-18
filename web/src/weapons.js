export const WEAPONS = {
  pm: {
    id: 'pm',
    name: 'ПМ',
    magSize: 12,
    damage: 18,
    fireRate: 0.18,
    spread: 0.035,
    moveSpread: 0.05,
    sprintSpread: 0.12,
    pellets: 1,
    range: 9999,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    magSize: 4,
    damage: 14,
    fireRate: 0.75,
    spread: 0.22,
    moveSpread: 0.08,
    sprintSpread: 0.18,
    pellets: 5,
    range: 220,
  },
  ak: {
    id: 'ak',
    name: 'АК-74',
    magSize: 30,
    damage: 22,
    fireRate: 0.1,
    spread: 0.05,
    moveSpread: 0.04,
    sprintSpread: 0.1,
    pellets: 1,
    range: 9999,
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
  s += recoilHeat * 0.025;
  return s;
}
