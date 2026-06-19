export const HOTBAR_SIZE = 3;
export const BACKPACK_SIZE = 9;
export const STASH_MAX_STACKS = 24;

/** @param {object|null|undefined} item */
export function isStackable(item) {
  if (!item) return false;
  return !item.weapon && !item.armor;
}

/** @param {object} a @param {object} b */
export function itemsMatch(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (!isStackable(a) || !isStackable(b)) return false;
  return (a.heal || 0) === (b.heal || 0)
    && (a.ammo || 0) === (b.ammo || 0)
    && (a.value || 0) === (b.value || 0)
    && !!a.grenade === !!b.grenade
    && !!a.smoke === !!b.smoke
    && !!a.consumable === !!b.consumable;
}

/** @param {object} item @param {number} [count] */
export function normalizeItem(item, count = 1) {
  const c = Math.max(1, count || item.count || 1);
  return { ...item, count: isStackable(item) ? c : 1 };
}

/** @param {object} item */
export function cloneItem(item) {
  return normalizeItem({ ...item }, item.count || 1);
}

/** @returns {(object|null)[]} */
export function emptyHotbar() {
  return [null, null, null];
}

/** @returns {(object|null)[]} */
export function emptyBackpack() {
  return Array.from({ length: BACKPACK_SIZE }, () => null);
}

export function emptyEquipped() {
  return { weapon: null, armor: null };
}

export function emptyLoadout() {
  return { hotbar: emptyHotbar(), backpack: emptyBackpack(), equipped: emptyEquipped() };
}

/** @param {(object|null)[]|undefined} slots @param {number} size */
function padSlots(slots, size) {
  const out = [...(slots || [])];
  while (out.length < size) out.push(null);
  return out.slice(0, size);
}

/** @param {object} loadout */
export function normalizeLoadout(loadout = {}) {
  const oldBp = loadout.backpack;
  let hotbar = padSlots(loadout.hotbar, HOTBAR_SIZE);
  let backpack = padSlots(loadout.backpack, BACKPACK_SIZE);

  if (!loadout.hotbar && Array.isArray(oldBp) && oldBp.length <= 4) {
    backpack = padSlots(oldBp, BACKPACK_SIZE);
    hotbar = emptyHotbar();
  }

  return {
    hotbar,
    backpack,
    equipped: cloneEquipped(loadout.equipped || {}),
  };
}

/** @param {'hotbar'|'backpack'} zone @param {object} loadout */
export function getLoadoutZone(loadout, zone) {
  return zone === 'hotbar' ? loadout.hotbar : loadout.backpack;
}

/** @param {object} profile */
function cloneLoadoutProfile(profile) {
  const ld = normalizeLoadout(profile.loadout || {});
  return {
    ...profile,
    stash: { items: [...(profile.stash?.items || [])] },
    loadout: {
      hotbar: ld.hotbar.map((s) => (s ? cloneItem(s) : null)),
      backpack: ld.backpack.map((s) => (s ? cloneItem(s) : null)),
      equipped: cloneEquipped(ld.equipped),
    },
  };
}

export function cloneEquipped(equipped = {}) {
  return {
    weapon: equipped.weapon ? cloneItem(equipped.weapon) : null,
    armor: equipped.armor ? cloneItem(equipped.armor) : null,
  };
}

/** @param {(object|null)[]} slots */
export function backpackUsed(slots) {
  return slots.filter(Boolean).length;
}

/** @param {object} loadout */
export function loadoutUsed(loadout) {
  const ld = normalizeLoadout(loadout);
  return backpackUsed(ld.hotbar) + backpackUsed(ld.backpack);
}

/** @param {{ items: object[] }} stash @param {object} item @param {number} [count] */
export function addToStash(stash, item, count = 1) {
  const n = normalizeItem(item, count);
  const amount = n.count;
  if (isStackable(n)) {
    const idx = stash.items.findIndex((s) => itemsMatch(s, n));
    if (idx >= 0) {
      stash.items[idx] = { ...stash.items[idx], count: stash.items[idx].count + amount };
      return { ok: true, msg: `В схрон: ${n.name} ×${amount}` };
    }
  }
  if (stash.items.length >= STASH_MAX_STACKS) {
    return { ok: false, msg: 'Схрон полон (24 стака)' };
  }
  stash.items.push(normalizeItem(n, amount));
  return { ok: true, msg: `В схрон: ${n.name}` };
}

/** @param {{ items: object[] }} stash @param {number} index @param {number} [count] */
export function removeFromStash(stash, index, count = 1) {
  const item = stash.items[index];
  if (!item) return { ok: false, msg: 'Нет предмета' };
  const take = Math.min(count, item.count || 1);
  const taken = normalizeItem(item, take);
  if (!isStackable(item) || take >= (item.count || 1)) {
    stash.items.splice(index, 1);
  } else {
    stash.items[index] = { ...item, count: item.count - take };
  }
  return { ok: true, item: taken };
}

/** @param {(object|null)[]} slots @param {object} item @param {number} [count] */
export function addToBackpack(slots, item, count = 1) {
  const n = normalizeItem(item, count);
  const amount = n.count;
  if (isStackable(n)) {
    const idx = slots.findIndex((s) => s && itemsMatch(s, n));
    if (idx >= 0) {
      slots[idx] = { ...slots[idx], count: slots[idx].count + amount };
      return { ok: true, slot: idx, msg: `В слот: ${n.name} ×${amount}` };
    }
  }
  const empty = slots.findIndex((s) => !s);
  if (empty < 0) return { ok: false, msg: 'Нет свободных слотов' };
  slots[empty] = normalizeItem(n, amount);
  return { ok: true, slot: empty, msg: `В слот: ${n.name}` };
}

/** @param {(object|null)[]} slots @param {number} index @param {number} [count] */
export function removeFromBackpack(slots, index, count = 1) {
  const item = slots[index];
  if (!item) return { ok: false, msg: 'Слот пуст' };
  const take = Math.min(count, item.count || 1);
  const taken = normalizeItem(item, take);
  if (!isStackable(item) || take >= (item.count || 1)) {
    slots[index] = null;
  } else {
    slots[index] = { ...item, count: item.count - take };
  }
  return { ok: true, item: taken };
}

/** @param {object} loadout @param {object} item @param {number} [count] */
export function addToLoadout(loadout, item, count = 1) {
  const ld = normalizeLoadout(loadout);
  loadout.hotbar = ld.hotbar;
  loadout.backpack = ld.backpack;
  loadout.equipped = ld.equipped;
  let r = addToBackpack(loadout.backpack, item, count);
  if (r.ok) return { ...r, zone: 'backpack', loadout };
  r = addToBackpack(loadout.hotbar, item, count);
  if (r.ok) return { ...r, zone: 'hotbar', loadout };
  return { ok: false, msg: 'Рюкзак и панель полны' };
}

/** @param {object} loadout @param {'hotbar'|'backpack'} zone @param {number} index */
export function findEmptyLoadoutSlot(loadout, zone = 'backpack', index = -1) {
  const ld = normalizeLoadout(loadout);
  if (zone === 'backpack' && index >= 0 && !ld.backpack[index]) return { zone: 'backpack', index };
  if (zone === 'hotbar' && index >= 0 && !ld.hotbar[index]) return { zone: 'hotbar', index };
  const bp = ld.backpack.findIndex((s) => !s);
  if (bp >= 0) return { zone: 'backpack', index: bp };
  const hb = ld.hotbar.findIndex((s) => !s);
  if (hb >= 0) return { zone: 'hotbar', index: hb };
  return null;
}

/** @param {object} profile @param {number} stashIdx @param {'hotbar'|'backpack'} zone @param {number} slotIdx @param {number} [count] */
export function moveStashToLoadout(profile, stashIdx, zone, slotIdx, count = 1) {
  const slots = zone === 'hotbar' ? HOTBAR_SIZE : BACKPACK_SIZE;
  if (slotIdx < 0 || slotIdx >= slots) return { ok: false, msg: 'Неверный слот' };
  const p = cloneLoadoutProfile(profile);
  const removed = removeFromStash(p.stash, stashIdx, count);
  if (!removed.ok || !removed.item) return removed;

  const targetSlots = getLoadoutZone(p.loadout, zone);
  const target = targetSlots[slotIdx];
  if (!target) {
    targetSlots[slotIdx] = removed.item;
    return { ok: true, profile: p, msg: `Взято: ${removed.item.name}` };
  }
  if (itemsMatch(target, removed.item)) {
    targetSlots[slotIdx] = { ...target, count: target.count + removed.item.count };
    return { ok: true, profile: p, msg: `Взято: ${removed.item.name}` };
  }
  addToStash(p.stash, removed.item, removed.item.count);
  return { ok: false, msg: 'Слот занят другим предметом' };
}

/** @param {object} profile @param {'hotbar'|'backpack'} zone @param {number} slotIdx @param {number} [count] */
export function moveLoadoutToStash(profile, zone, slotIdx, count = 1) {
  const p = cloneLoadoutProfile(profile);
  const slots = getLoadoutZone(p.loadout, zone);
  const removed = removeFromBackpack(slots, slotIdx, count);
  if (!removed.ok || !removed.item) return removed;

  const added = addToStash(p.stash, removed.item, removed.item.count);
  if (!added.ok) {
    addToBackpack(slots, removed.item, removed.item.count);
    return { ok: false, msg: added.msg };
  }
  return { ok: true, profile: p, msg: `В схрон: ${removed.item.name}` };
}

/** @param {object} loadout @param {'hotbar'|'backpack'} fromZone @param {number} fromIdx @param {'hotbar'|'backpack'} toZone @param {number} toIdx */
export function swapLoadoutSlots(loadout, fromZone, fromIdx, toZone, toIdx) {
  const ld = normalizeLoadout(loadout);
  const fromSlots = getLoadoutZone(ld, fromZone);
  const toSlots = getLoadoutZone(ld, toZone);
  if (fromZone === toZone && fromIdx === toIdx) return { ok: false, msg: 'Тот же слот' };
  const tmp = toSlots[toIdx];
  toSlots[toIdx] = fromSlots[fromIdx];
  fromSlots[fromIdx] = tmp;
  return { ok: true, loadout: ld, msg: 'Перемещено' };
}

function lobbyEquipFromStash(profile, stashIdx, equipType, check) {
  const p = cloneLoadoutProfile(profile);
  const peek = p.stash.items[stashIdx];
  if (!peek || !check(peek)) return { ok: false, msg: equipType === 'weapon' ? 'Не оружие' : 'Не броня' };
  const removed = removeFromStash(p.stash, stashIdx, 1);
  if (!removed.ok || !removed.item) return removed;
  const old = p.loadout.equipped[equipType];
  if (old) {
    const added = addToStash(p.stash, old, 1);
    if (!added.ok) {
      addToStash(p.stash, removed.item, 1);
      return { ok: false, msg: added.msg };
    }
  }
  p.loadout.equipped[equipType] = removed.item;
  const label = equipType === 'weapon' ? 'Оружие' : 'Броня';
  return { ok: true, profile: p, msg: `${label}: ${removed.item.name}` };
}

export function lobbyEquipWeaponFromStash(profile, stashIdx) {
  return lobbyEquipFromStash(profile, stashIdx, 'weapon', (i) => i.weapon);
}

export function lobbyEquipArmorFromStash(profile, stashIdx) {
  return lobbyEquipFromStash(profile, stashIdx, 'armor', (i) => i.armor);
}

function lobbyEquipFromLoadout(profile, zone, slotIdx, equipType, check) {
  const p = cloneLoadoutProfile(profile);
  const slots = getLoadoutZone(p.loadout, zone);
  const item = slots[slotIdx];
  if (!item || !check(item)) return { ok: false, msg: equipType === 'weapon' ? 'Не оружие' : 'Не броня' };
  const removed = removeFromBackpack(slots, slotIdx, 1);
  if (!removed.ok || !removed.item) return removed;
  const old = p.loadout.equipped[equipType];
  if (old) {
    const dest = findEmptyLoadoutSlot(p.loadout);
    if (!dest) {
      slots[slotIdx] = removed.item;
      return { ok: false, msg: 'Нет свободного слота для старой экипировки' };
    }
    getLoadoutZone(p.loadout, dest.zone)[dest.index] = cloneItem(old);
  }
  p.loadout.equipped[equipType] = removed.item;
  const label = equipType === 'weapon' ? 'Оружие' : 'Броня';
  return { ok: true, profile: p, msg: `${label}: ${removed.item.name}` };
}

export function lobbyEquipWeapon(profile, zone, slotIdx) {
  return lobbyEquipFromLoadout(profile, zone, slotIdx, 'weapon', (i) => i.weapon);
}

export function lobbyEquipArmor(profile, zone, slotIdx) {
  return lobbyEquipFromLoadout(profile, zone, slotIdx, 'armor', (i) => i.armor);
}

export function lobbyUnequipWeapon(profile, zone, slotIdx) {
  const p = cloneLoadoutProfile(profile);
  const weapon = p.loadout.equipped.weapon;
  if (!weapon) return { ok: false, msg: 'Нет оружия' };
  const slots = getLoadoutZone(p.loadout, zone);
  if (slots[slotIdx]) return { ok: false, msg: 'Слот занят' };
  slots[slotIdx] = cloneItem(weapon);
  p.loadout.equipped.weapon = null;
  return { ok: true, profile: p, msg: 'Оружие снято' };
}

export function lobbyUnequipArmor(profile, zone, slotIdx) {
  const p = cloneLoadoutProfile(profile);
  const armor = p.loadout.equipped.armor;
  if (!armor) return { ok: false, msg: 'Нет брони' };
  const slots = getLoadoutZone(p.loadout, zone);
  if (slots[slotIdx]) return { ok: false, msg: 'Слот занят' };
  slots[slotIdx] = cloneItem(armor);
  p.loadout.equipped.armor = null;
  return { ok: true, profile: p, msg: 'Броня снята' };
}

export function lobbyEquipToStash(profile, equipType) {
  const p = cloneLoadoutProfile(profile);
  const item = p.loadout.equipped[equipType];
  if (!item) return { ok: false, msg: 'Слот пуст' };
  const added = addToStash(p.stash, item, 1);
  if (!added.ok) return { ok: false, msg: added.msg };
  p.loadout.equipped[equipType] = null;
  return { ok: true, profile: p, msg: `В схрон: ${item.name}` };
}

/** @param {object[]} items */
export function stackItems(items) {
  const stacks = [];
  for (const raw of items) {
    const item = normalizeItem({ ...raw });
    if (isStackable(item)) {
      const idx = stacks.findIndex((s) => itemsMatch(s, item));
      if (idx >= 0) {
        stacks[idx] = { ...stacks[idx], count: stacks[idx].count + item.count };
        continue;
      }
    }
    stacks.push(item);
  }
  return stacks;
}

/** @param {object} profile */
export function migrateProfile(profile) {
  const p = {
    ...profile,
    stash: { items: stackItems(profile.stash?.items || []) },
    loadout: emptyLoadout(),
  };

  const old = profile.loadout || {};

  const tryAdd = (item) => {
    const r = addToLoadout(p.loadout, item, item.count || 1);
    if (!r.ok) addToStash(p.stash, item, item.count || 1);
  };

  if (old.weapon && old.weapon !== 'pm') {
    const names = { shotgun: 'Дробовик', ak: 'АК-74', pp: 'ПП-91', pm: 'ПМ' };
    tryAdd({
      id: old.weapon,
      name: names[old.weapon] || old.weapon,
      weapon: old.weapon,
      value: old.weapon === 'ak' ? 20 : 12,
      count: 1,
    });
  }

  for (let i = 0; i < (old.extraMedkits || 0); i++) {
    tryAdd({ id: 'medkit', name: 'Аптечка', heal: 50, consumable: true, count: 1 });
  }

  if (old.extraAmmo) {
    tryAdd({ id: 'ammo', name: 'Патроны', ammo: 18, value: 0, count: 1 });
    if (old.extraAmmo > 18) {
      tryAdd({ id: 'ammo', name: 'Патроны', ammo: old.extraAmmo - 18, value: 0, count: 1 });
    }
  }

  if (old.startArmor) {
    tryAdd({ id: 'armor', name: 'Бронежилет', armor: old.startArmor, value: 8, count: 1 });
  }

  if (Array.isArray(old.backpack)) {
    for (const item of old.backpack) {
      if (item) tryAdd(cloneItem(item));
    }
  }

  return p;
}

/** @param {object} profile */
export function ensureMigratedProfile(profile) {
  const ld = profile.loadout || {};
  const hasOldFormat =
    'extraMedkits' in ld ||
    'extraAmmo' in ld ||
    'startArmor' in ld ||
    'weapon' in ld;

  if (hasOldFormat) return migrateProfile(profile);

  return {
    ...profile,
    stash: { items: stackItems(profile.stash?.items || []) },
    loadout: normalizeLoadout(ld),
  };
}

/** @param {{ hotbar?: (object|null)[], backpack?: (object|null)[], equipped?: { weapon?: object|null, armor?: object|null } }} loadout */
export function loadoutHasWeapon(loadout) {
  const ld = normalizeLoadout(loadout);
  if (ld.equipped?.weapon) return true;
  return ld.hotbar.some((i) => i?.weapon) || ld.backpack.some((i) => i?.weapon);
}

export function consumeLoadoutForRaid(profile) {
  return {
    ...profile,
    loadout: emptyLoadout(),
  };
}

/** @param {object} loadout */
export function collectRaidLoot(loadout) {
  const ld = normalizeLoadout(loadout);
  const loot = [];
  for (const item of [...ld.hotbar, ...ld.backpack]) {
    if (item) loot.push(cloneItem(item));
  }
  if (ld.equipped.weapon) loot.push(cloneItem(ld.equipped.weapon));
  if (ld.equipped.armor) loot.push(cloneItem(ld.equipped.armor));
  return loot;
}

/** @param {object[]} loot */
export function lootTotalValue(loot) {
  return loot.reduce((s, i) => s + (i.value || 0) * (i.count || 1), 0);
}

/** @param {(object|null)[]} slots */
export function cloneBackpack(slots) {
  return padSlots(slots, BACKPACK_SIZE).map((s) => (s ? cloneItem(s) : null));
}

/** @param {(object|null)[]} slots */
export function cloneHotbar(slots) {
  return padSlots(slots, HOTBAR_SIZE).map((s) => (s ? cloneItem(s) : null));
}
