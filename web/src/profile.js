import { evaluateQuest, applyQuestReward, pickRandomQuest } from './quests.js';
import {
  addToStash,
  emptyLoadout,
  emptyBackpack,
  emptyHotbar,
  cloneEquipped,
  stackItems,
  lootTotalValue,
  ensureMigratedProfile,
  normalizeLoadout,
} from './inventory-core.js';

export const RAID_MODES = {
  standard: { id: 'standard', name: 'Стандарт', duration: 5 * 60, desc: '5 минут, полный лут' },
  quick: { id: 'quick', name: 'Быстрый', duration: 2 * 60, desc: '2 минуты, +20% XP' },
  boss: { id: 'boss', name: 'Босс-рейд', duration: 6 * 60, desc: '6 минут, босс в центре, редкий лут' },
  betatest: {
    id: 'betatest',
    name: 'Бета-тест',
    duration: 5 * 60,
    desc: 'Песочница: фикс. набор, лут не сохраняется',
    sandbox: true,
  },
};

export const PARTY_TYPES = {
  solo: { id: 'solo', name: 'Одиночный', desc: 'Только против ИИ' },
  multi: { id: 'multi', name: 'Мультиплеер', desc: '2–4 игрока · PvP' },
};

export const MODES_BY_PARTY = {
  solo: ['quick', 'boss', 'betatest'],
  multi: ['standard', 'boss'],
};

export function isSandboxMode(mode) {
  return mode === 'betatest' || !!RAID_MODES[mode]?.sandbox;
}

/** Фиксированный набор для режима бета-тест */
export function createBetaTestLoadout() {
  return normalizeLoadout({
    equipped: {
      weapon: { id: 'beta_ak', name: 'АК-74', weapon: 'ak', value: 20 },
      armor: { id: 'beta_armor', name: 'Бронежилет', armor: 50, value: 8 },
    },
    hotbar: [
      { id: 'beta_med1', name: 'Бинт', heal: 20, healDuration: 1, consumable: true, value: 0 },
      { id: 'beta_med2', name: 'Бинт', heal: 20, healDuration: 1, consumable: true, value: 0 },
      { id: 'beta_med3', name: 'Бинт', heal: 20, healDuration: 1, consumable: true, value: 0 },
    ],
    backpack: [{ id: 'beta_ammo', name: 'Патроны', ammo: 36, value: 0, count: 1 }],
  });
}

export function getModesForParty(partyType) {
  const ids = MODES_BY_PARTY[partyType] || MODES_BY_PARTY.solo;
  return ids.map((id) => RAID_MODES[id]).filter(Boolean);
}

export function defaultModeForParty(partyType) {
  return MODES_BY_PARTY[partyType]?.[0] || 'quick';
}

export const SHOP_ITEMS = [
  { id: 'pm', name: 'ПМ', cost: 0, item: { id: 'pm_shop', name: 'ПМ', weapon: 'pm', value: 1 } },
  { id: 'pp', name: 'ПП-91', cost: 240, item: { id: 'pp', name: 'ПП-91', weapon: 'pp', value: 28 } },
  { id: 'shotgun', name: 'Дробовик', cost: 180, item: { id: 'shotgun', name: 'Дробовик', weapon: 'shotgun', value: 12 } },
  { id: 'ak', name: 'АК-74', cost: 350, item: { id: 'ak', name: 'АК-74', weapon: 'ak', value: 20 } },
  { id: 'sniper', name: 'СВД', cost: 500, item: { id: 'sniper', name: 'СВД', weapon: 'sniper', value: 50 } },
  { id: 'ammo', name: 'Патроны +36', cost: 30, item: { id: 'ammo', name: 'Патроны', ammo: 36, value: 0 } },
  { id: 'bandage', name: 'Бинт', cost: 20, item: { id: 'bandage', name: 'Бинт', heal: 20, healDuration: 1, consumable: true, value: 0 } },
  { id: 'medkit', name: 'Аптечка', cost: 75, item: { id: 'medkit', name: 'Аптечка', heal: 75, healDuration: 3, consumable: true, value: 0 } },
  { id: 'armor', name: 'Бронежилет', cost: 100, item: { id: 'armor', name: 'Бронежилет', armor: 50, value: 8 } },
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
    loadout: emptyLoadout(),
    stats: { raids: 0, extracts: 0, kills: 0, totalLootValue: 0 },
    quests: { active: null, completed: [] },
    hideout: { level: 1 },
    ...overrides,
  };
}

export function applyRaidResult(profile, result) {
  if (isSandboxMode(result.mode) || result.sandbox) {
    return ensureMigratedProfile(profile);
  }

  let p = ensureMigratedProfile({
    ...profile,
    stash: { items: [...profile.stash.items] },
    loadout: normalizeLoadout(profile.loadout),
    stats: { ...profile.stats },
    quests: { ...profile.quests },
  });

  p.stats.raids += 1;
  p.stats.kills += result.kills || 0;

  if (result.type === 'extracted') {
    p.stats.extracts += 1;
    let lootValue = 0;
    let overflowRubles = 0;
    for (const item of stackItems(result.loot || [])) {
      const added = addToStash(p.stash, item, item.count || 1);
      const worth = (item.value || 0) * (item.count || 1);
      lootValue += worth;
      if (!added.ok) overflowRubles += worth;
    }
    p.stats.totalLootValue += lootValue;
    p.rubles += overflowRubles;
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
  const value = (item.value || 0) * (item.count || 1);
  if (value <= 0) return { ok: false, msg: 'Нечего продавать', profile: p };
  p.rubles += value;
  p.stash.items.splice(index, 1);
  return { ok: true, profile: p, msg: `Продано: ${item.name}${item.count > 1 ? ` ×${item.count}` : ''}` };
}

export { ensureMigratedProfile, lootTotalValue, stackItems, emptyLoadout, emptyBackpack, emptyHotbar };
