export const BACKPACK_SIZE = 4;
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
export function emptyBackpack() {
  return [null, null, null, null];
}

export function emptyEquipped() {
  return { weapon: null, armor: null };
}

function cloneLoadoutProfile(profile) {
  const ld = profile.loadout || {};
  const bp = [...(ld.backpack || emptyBackpack())];
  while (bp.length < BACKPACK_SIZE) bp.push(null);
  return {
    ...profile,
    stash: { items: [...(profile.stash?.items || [])] },
    loadout: {
      backpack: bp.slice(0, BACKPACK_SIZE),
      equipped: {
        weapon: ld.equipped?.weapon ? cloneItem(ld.equipped.weapon) : null,
        armor: ld.equipped?.armor ? cloneItem(ld.equipped.armor) : null,
      },
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
      return { ok: true, slot: idx, msg: `В рюкзак: ${n.name} ×${amount}` };
    }
  }
  const empty = slots.findIndex((s) => !s);
  if (empty < 0) return { ok: false, msg: 'Рюкзак полон' };
  slots[empty] = normalizeItem(n, amount);
  return { ok: true, slot: empty, msg: `В рюкзак: ${n.name}` };
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

/** @param {object} profile @param {number} stashIdx @param {number} loadoutIdx @param {number} [count] */
export function moveStashToLoadout(profile, stashIdx, loadoutIdx, count = 1) {
  if (loadoutIdx < 0 || loadoutIdx >= BACKPACK_SIZE) {
    return { ok: false, msg: 'Неверный слот' };
  }
  const p = cloneLoadoutProfile(profile);
  const removed = removeFromStash(p.stash, stashIdx, count);
  if (!removed.ok || !removed.item) return removed;

  const target = p.loadout.backpack[loadoutIdx];
  if (!target) {
    p.loadout.backpack[loadoutIdx] = removed.item;
    return { ok: true, profile: p, msg: `Взято: ${removed.item.name}` };
  }
  if (itemsMatch(target, removed.item)) {
    p.loadout.backpack[loadoutIdx] = { ...target, count: target.count + removed.item.count };
    return { ok: true, profile: p, msg: `Взято: ${removed.item.name}` };
  }
  return { ok: false, msg: 'Слот занят другим предметом' };
}

/** @param {object} profile @param {number} loadoutIdx @param {number} [count] */
export function moveLoadoutToStash(profile, loadoutIdx, count = 1) {
  const p = cloneLoadoutProfile(profile);

  const removed = removeFromBackpack(p.loadout.backpack, loadoutIdx, count);
  if (!removed.ok || !removed.item) return removed;

  const added = addToStash(p.stash, removed.item, removed.item.count);
  if (!added.ok) {
    addToBackpack(p.loadout.backpack, removed.item, removed.item.count);
    return { ok: false, msg: added.msg };
  }
  return { ok: true, profile: p, msg: `В схрон: ${removed.item.name}` };
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

export function lobbyEquipWeapon(profile, backpackIdx) {
  const p = cloneLoadoutProfile(profile);
  const item = p.loadout.backpack[backpackIdx];
  if (!item?.weapon) return { ok: false, msg: 'Не оружие' };
  const removed = removeFromBackpack(p.loadout.backpack, backpackIdx, 1);
  if (!removed.ok || !removed.item) return removed;
  const old = p.loadout.equipped.weapon;
  if (old) {
    const added = addToBackpack(p.loadout.backpack, old, 1);
    if (!added.ok) {
      p.loadout.backpack[backpackIdx] = removed.item;
      return { ok: false, msg: 'Рюкзак полон — освободи место' };
    }
  }
  p.loadout.equipped.weapon = removed.item;
  return { ok: true, profile: p, msg: `Оружие: ${removed.item.name}` };
}

export function lobbyEquipArmor(profile, backpackIdx) {
  const p = cloneLoadoutProfile(profile);
  const item = p.loadout.backpack[backpackIdx];
  if (!item?.armor) return { ok: false, msg: 'Не броня' };
  const removed = removeFromBackpack(p.loadout.backpack, backpackIdx, 1);
  if (!removed.ok || !removed.item) return removed;
  const old = p.loadout.equipped.armor;
  if (old) {
    const added = addToBackpack(p.loadout.backpack, old, 1);
    if (!added.ok) {
      p.loadout.backpack[backpackIdx] = removed.item;
      return { ok: false, msg: 'Рюкзак полон' };
    }
  }
  p.loadout.equipped.armor = removed.item;
  return { ok: true, profile: p, msg: `Броня: ${removed.item.name}` };
}

export function lobbyUnequipWeapon(profile, backpackIdx) {
  const p = cloneLoadoutProfile(profile);
  const weapon = p.loadout.equipped.weapon;
  if (!weapon) return { ok: false, msg: 'Нет оружия' };
  if (p.loadout.backpack[backpackIdx]) return { ok: false, msg: 'Слот занят' };
  p.loadout.backpack[backpackIdx] = cloneItem(weapon);
  p.loadout.equipped.weapon = null;
  return { ok: true, profile: p, msg: 'Оружие в рюкзак' };
}

export function lobbyUnequipArmor(profile, backpackIdx) {
  const p = cloneLoadoutProfile(profile);
  const armor = p.loadout.equipped.armor;
  if (!armor) return { ok: false, msg: 'Нет брони' };
  if (p.loadout.backpack[backpackIdx]) return { ok: false, msg: 'Слот занят' };
  p.loadout.backpack[backpackIdx] = cloneItem(armor);
  p.loadout.equipped.armor = null;
  return { ok: true, profile: p, msg: 'Броня в рюкзак' };
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
    loadout: { backpack: emptyBackpack(), equipped: emptyEquipped() },
  };

  const old = profile.loadout || {};
  const backpack = p.loadout.backpack;

  const tryAdd = (item) => {
    const r = addToBackpack(backpack, item, item.count || 1);
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

  if (Array.isArray(ld.backpack) && !hasOldFormat) {
    const bp = [...ld.backpack];
    while (bp.length < BACKPACK_SIZE) bp.push(null);
    return {
      ...profile,
      stash: { items: stackItems(profile.stash?.items || []) },
      loadout: {
        backpack: bp.slice(0, BACKPACK_SIZE),
        equipped: ld.equipped ? cloneEquipped(ld.equipped) : emptyEquipped(),
      },
    };
  }

  if (hasOldFormat || Array.isArray(ld.backpack)) {
    return migrateProfile(profile);
  }

  return {
    ...profile,
    stash: { items: stackItems(profile.stash?.items || []) },
    loadout: { backpack: emptyBackpack(), equipped: emptyEquipped() },
  };
}

/** @param {{ backpack?: (object|null)[], equipped?: { weapon?: object|null, armor?: object|null } }} loadout */
export function loadoutHasWeapon(loadout) {
  if (loadout?.equipped?.weapon) return true;
  return (loadout?.backpack || []).some((i) => i?.weapon);
}

export function consumeLoadoutForRaid(profile) {
  return {
    ...profile,
    loadout: { backpack: emptyBackpack(), equipped: emptyEquipped() },
  };
}

/** @param {(object|null)[]} backpack @param {{ weapon: object|null, armor: object|null }} equipped */
export function collectRaidLoot(backpack, equipped) {
  const loot = [];
  for (const item of backpack) {
    if (item) loot.push(cloneItem(item));
  }
  if (equipped.weapon) loot.push(cloneItem(equipped.weapon));
  if (equipped.armor) loot.push(cloneItem(equipped.armor));
  return loot;
}

/** @param {object[]} loot */
export function lootTotalValue(loot) {
  return loot.reduce((s, i) => s + (i.value || 0) * (i.count || 1), 0);
}

/** @param {(object|null)[]} slots */
export function cloneBackpack(slots) {
  return slots.map((s) => (s ? cloneItem(s) : null));
}
