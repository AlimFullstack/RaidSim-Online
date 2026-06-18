export const WEAPONS = {
  pm: {
    id: 'pm',
    name: 'ПМ',
    magSize: 12,
    damage: 18,
    fireRate: 0.18,
    spread: 0,
    pellets: 1,
    range: 9999,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    magSize: 4,
    damage: 14,
    fireRate: 0.75,
    spread: 0.25,
    pellets: 5,
    range: 220,
  },
  ak: {
    id: 'ak',
    name: 'АК-74',
    magSize: 30,
    damage: 22,
    fireRate: 0.1,
    spread: 0.06,
    pellets: 1,
    range: 9999,
  },
};

/** @param {string} id */
export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.pm;
}
