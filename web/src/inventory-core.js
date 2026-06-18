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
  const p = {
    ...profile,
    stash: { items: [...profile.stash.items] },
    loadout: { backpack: [...(profile.loadout?.backpack || emptyBackpack())] },
  };
  while (p.loadout.backpack.length < BACKPACK_SIZE) p.loadout.backpack.push(null);

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
  const p = {
    ...profile,
    stash: { items: [...profile.stash.items] },
    loadout: { backpack: [...(profile.loadout?.backpack || emptyBackpack())] },
  };
  while (p.loadout.backpack.length < BACKPACK_SIZE) p.loadout.backpack.push(null);

  const removed = removeFromBackpack(p.loadout.backpack, loadoutIdx, count);
  if (!removed.ok || !removed.item) return removed;

  const added = addToStash(p.stash, removed.item, removed.item.count);
  if (!added.ok) return { ok: false, msg: added.msg };
  return { ok: true, profile: p, msg: `В схрон: ${removed.item.name}` };
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
    loadout: { backpack: emptyBackpack() },
  };

  const old = profile.loadout || {};
  const backpack = p.loadout.backpack;

  const tryAdd = (item) => {
    const r = addToBackpack(backpack, item, item.count || 1);
    if (!r.ok) addToStash(p.stash, item, item.count || 1);
  };

  if (old.weapon && old.weapon !== 'pm') {
    const names = { shotgun: 'Дробовик', ak: 'АК-74' };
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
    tryAdd({ id: 'ammo', name: 'Патроны', ammo: 12, value: 0, count: 1 });
    if (old.extraAmmo > 12) {
      tryAdd({ id: 'ammo', name: 'Патроны', ammo: old.extraAmmo - 12, value: 0, count: 1 });
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
      loadout: { backpack: bp.slice(0, BACKPACK_SIZE) },
    };
  }

  if (hasOldFormat || Array.isArray(ld.backpack)) {
    return migrateProfile(profile);
  }

  return {
    ...profile,
    stash: { items: stackItems(profile.stash?.items || []) },
    loadout: { backpack: emptyBackpack() },
  };
}

/** @param {object} profile — removes taken loadout items on raid start */
export function consumeLoadoutForRaid(profile) {
  const p = {
    ...profile,
    loadout: { backpack: emptyBackpack() },
  };
  return p;
}

/** @param {(object|null)[]} backpack @param {{ weapon: object|null, armor: object|null }} equipped */
export function collectRaidLoot(backpack, equipped) {
  const loot = [];
  for (const item of backpack) {
    if (item && !item.starter) loot.push(cloneItem(item));
  }
  if (equipped.weapon && !equipped.weapon.starter) loot.push(cloneItem(equipped.weapon));
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
