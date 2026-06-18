export const RAID_MODES = {
  standard: { id: 'standard', name: 'Стандарт', duration: 8 * 60, desc: '8 минут, полный лут' },
  quick: { id: 'quick', name: 'Быстрый', duration: 5 * 60, desc: '5 минут, +20% XP' },
};

export const SHOP_ITEMS = [
  { id: 'medkit', name: 'Аптечка', cost: 50, loadoutKey: 'extraMedkits', amount: 1 },
  { id: 'ammo', name: 'Патроны +12', cost: 30, loadoutKey: 'extraAmmo', amount: 12 },
  { id: 'armor', name: 'Броня на рейд', cost: 100, loadoutKey: 'startArmor', amount: 25 },
];

export function xpToLevel(xp) {
  return Math.floor(Math.sqrt(xp / 80)) + 1;
}

export function xpForNextLevel(level) {
  return level * level * 80;
}

export function createDefaultProfile(overrides = {}) {
  return {
    displayName: 'Оператор',
    photoURL: null,
    isGuest: true,
    xp: 0,
    rubles: 0,
    stash: { items: [] },
    loadout: { extraMedkits: 0, extraAmmo: 0, startArmor: 0 },
    stats: { raids: 0, extracts: 0, kills: 0, totalLootValue: 0 },
    ...overrides,
  };
}

export function applyRaidResult(profile, result) {
  const p = { ...profile, stash: { items: [...profile.stash.items] }, loadout: { ...profile.loadout }, stats: { ...profile.stats } };
  p.stats.raids += 1;
  p.stats.kills += result.kills || 0;

  if (result.type === 'extracted') {
    p.stats.extracts += 1;
    let lootValue = 0;
    for (const item of result.loot) {
      lootValue += item.value || 0;
      if (p.stash.items.length < 24) p.stash.items.push(item);
      else lootValue += item.value || 0;
    }
    p.stats.totalLootValue += lootValue;
    p.rubles += lootValue;
    let xpGain = (result.kills || 0) * 15 + lootValue * 2;
    if (result.mode === 'quick') xpGain = Math.floor(xpGain * 1.2);
    p.xp += xpGain;
  }

  p.loadout = { extraMedkits: 0, extraAmmo: 0, startArmor: 0 };
  return p;
}

export function buyShopItem(profile, shopId) {
  const item = SHOP_ITEMS.find((i) => i.id === shopId);
  if (!item || profile.rubles < item.cost) return { ok: false, msg: 'Недостаточно рублей' };
  const p = { ...profile, loadout: { ...profile.loadout }, rubles: profile.rubles - item.cost };
  p.loadout[item.loadoutKey] = (p.loadout[item.loadoutKey] || 0) + item.amount;
  return { ok: true, profile: p, msg: `Куплено: ${item.name}` };
}

export function sellStashItem(profile, index) {
  const p = { ...profile, stash: { items: [...profile.stash.items] } };
  const item = p.stash.items[index];
  if (!item) return { ok: false, msg: 'Нет предмета' };
  p.rubles += item.value || 1;
  p.stash.items.splice(index, 1);
  return { ok: true, profile: p, msg: `Продано: ${item.name}` };
}
