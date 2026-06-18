import { evaluateQuest, applyQuestReward, pickRandomQuest } from './quests.js';
import {
  addToStash,
  emptyBackpack,
  emptyEquipped,
  cloneEquipped,
  stackItems,
  lootTotalValue,
  ensureMigratedProfile,
} from './inventory-core.js';

export const RAID_MODES = {
  standard: { id: 'standard', name: 'Стандарт', duration: 5 * 60, desc: '5 минут, полный лут' },
  quick: { id: 'quick', name: 'Быстрый', duration: 2 * 60, desc: '2 минуты, +20% XP' },
  boss: { id: 'boss', name: 'Босс-рейд', duration: 6 * 60, desc: '6 минут, босс в центре, редкий лут' },
};

export const SHOP_ITEMS = [
  { id: 'pm', name: 'ПМ', cost: 5, item: { id: 'pm_shop', name: 'ПМ', weapon: 'pm', value: 1 } },
  { id: 'pp', name: 'ПП-91', cost: 240, item: { id: 'pp', name: 'ПП-91', weapon: 'pp', value: 28 } },
  { id: 'shotgun', name: 'Дробовик', cost: 180, item: { id: 'shotgun', name: 'Дробовик', weapon: 'shotgun', value: 12 } },
  { id: 'ak', name: 'АК-74', cost: 350, item: { id: 'ak', name: 'АК-74', weapon: 'ak', value: 20 } },
  { id: 'ammo', name: 'Патроны +18', cost: 30, item: { id: 'ammo', name: 'Патроны', ammo: 18, value: 0 } },
  { id: 'medkit', name: 'Аптечка', cost: 50, item: { id: 'medkit', name: 'Аптечка', heal: 50, consumable: true, value: 0 } },
  { id: 'armor', name: 'Бронежилет', cost: 100, item: { id: 'armor', name: 'Бронежилет', armor: 25, value: 8 } },
];

export function xpToLevel(xp) {
  return Math.floor(Math.sqrt(xp / 80)) + 1;
}

export function xpForNextLevel(level) {
  return level * level * 80;
}

export function getSurvivalRate(profile) {
  const raids = profile.stats?.raids || 0;
  if (!raids) return 0;
  return Math.round((profile.stats.extracts / raids) * 100);
}

export function createDefaultProfile(overrides = {}) {
  return {
    displayName: 'Оператор',
    photoURL: null,
    isGuest: true,
    xp: 0,
    rubles: 20,
    stash: { items: [] },
    loadout: { backpack: emptyBackpack(), equipped: emptyEquipped() },
    stats: { raids: 0, extracts: 0, kills: 0, totalLootValue: 0 },
    quests: { active: null, completed: [] },
    hideout: { level: 1 },
    ...overrides,
  };
}

export function applyRaidResult(profile, result) {
  let p = ensureMigratedProfile({
    ...profile,
    stash: { items: [...profile.stash.items] },
    loadout: { backpack: [...(profile.loadout?.backpack || emptyBackpack())], equipped: cloneEquipped(profile.loadout?.equipped || {}) },
    stats: { ...profile.stats },
    quests: { ...profile.quests },
  });

  p.stats.raids += 1;
  p.stats.kills += result.kills || 0;

  if (result.type === 'extracted') {
    p.stats.extracts += 1;
    let lootValue = 0;
    for (const item of result.loot || []) {
      const added = addToStash(p.stash, item, item.count || 1);
      if (!added.ok) lootValue += (item.value || 0) * (item.count || 1);
      else lootValue += (item.value || 0) * (item.count || 1);
    }
    p.stats.totalLootValue += lootValue;
    p.rubles += lootValue;
    let xpGain = (result.kills || 0) * 15 + lootValue * 2;
    if (result.mode === 'quick') xpGain = Math.floor(xpGain * 1.2);
    p.xp += xpGain;
  }

  const questResult = evaluateQuest(p, result);
  if (questResult.completed && questResult.quest) {
    p = applyQuestReward(p, questResult.quest);
  }
  if (!p.quests.active) {
    p.quests = { ...p.quests, active: pickRandomQuest(p.quests.completed) };
  }

  return p;
}

export function buyShopItem(profile, shopId) {
  const shop = SHOP_ITEMS.find((i) => i.id === shopId);
  if (!shop || profile.rubles < shop.cost) return { ok: false, msg: 'Недостаточно рублей' };
  const p = ensureMigratedProfile({
    ...profile,
    stash: { items: [...profile.stash.items] },
    rubles: profile.rubles - shop.cost,
  });
  const added = addToStash(p.stash, shop.item, 1);
  if (!added.ok) return { ok: false, msg: added.msg };
  return { ok: true, profile: p, msg: `${shop.name} → схрон` };
}

export function sellStashItem(profile, index) {
  const p = ensureMigratedProfile({
    ...profile,
    stash: { items: [...profile.stash.items] },
  });
  const item = p.stash.items[index];
  if (!item) return { ok: false, msg: 'Нет предмета' };
  const value = (item.value || 1) * (item.count || 1);
  p.rubles += value;
  p.stash.items.splice(index, 1);
  return { ok: true, profile: p, msg: `Продано: ${item.name}${item.count > 1 ? ` ×${item.count}` : ''}` };
}

export { ensureMigratedProfile, lootTotalValue, stackItems, emptyBackpack };
