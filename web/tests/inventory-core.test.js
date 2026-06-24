import { describe, it, expect } from 'vitest';
import {
  isStackable,
  itemsMatch,
  addToStash,
  addToBackpack,
  addToLoadout,
  removeFromStash,
  moveStashToLoadout,
  moveLoadoutToStash,
  stackItems,
  swapLoadoutSlots,
  migrateProfile,
  ensureMigratedProfile,
  loadoutForSave,
  loadoutHasWeapon,
  emptyBackpack,
  emptyHotbar,
  emptyLoadout,
  normalizeLoadout,
  STASH_MAX_STACKS,
  BACKPACK_SIZE,
  HOTBAR_SIZE,
} from '../src/inventory-core.js';

describe('inventory-core', () => {
  it('stacks medkits and ammo', () => {
    const stash = { items: [] };
    addToStash(stash, { id: 'medkit', name: 'Аптечка', heal: 50 });
    addToStash(stash, { id: 'medkit', name: 'Аптечка', heal: 50 });
    expect(stash.items).toHaveLength(1);
    expect(stash.items[0].count).toBe(2);
  });

  it('does not stack weapons or armor', () => {
    expect(isStackable({ id: 'ak', weapon: 'ak' })).toBe(false);
    expect(isStackable({ id: 'armor', armor: 25 })).toBe(false);
    const stash = { items: [] };
    addToStash(stash, { id: 'ak', name: 'АК', weapon: 'ak' });
    addToStash(stash, { id: 'ak', name: 'АК', weapon: 'ak' });
    expect(stash.items).toHaveLength(2);
  });

  it('moveStashToLoadout takes 1 from stack into backpack', () => {
    const profile = {
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 3 }] },
      loadout: emptyLoadout(),
    };
    const r = moveStashToLoadout(profile, 0, 'backpack', 0, 1);
    expect(r.ok).toBe(true);
    expect(r.profile.stash.items[0].count).toBe(2);
    expect(r.profile.loadout.backpack[0].count).toBe(1);
  });

  it('moveStashToLoadout can target hotbar', () => {
    const profile = {
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 1 }] },
      loadout: emptyLoadout(),
    };
    const r = moveStashToLoadout(profile, 0, 'hotbar', 1, 1);
    expect(r.ok).toBe(true);
    expect(r.profile.loadout.hotbar[1].name).toBe('Аптечка');
  });

  it('backpack overflow blocks add', () => {
    const slots = emptyBackpack();
    for (let i = 0; i < BACKPACK_SIZE; i++) {
      addToBackpack(slots, { id: `item${i}`, name: `Item ${i}`, value: 1 });
    }
    const r = addToBackpack(slots, { id: 'key', name: 'Ключ', value: 6 });
    expect(r.ok).toBe(false);
    expect(slots.filter(Boolean)).toHaveLength(BACKPACK_SIZE);
  });

  it('addToLoadout fills backpack then hotbar', () => {
    const loadout = emptyLoadout();
    for (let i = 0; i < BACKPACK_SIZE; i++) {
      addToLoadout(loadout, { id: `bp${i}`, name: `B${i}`, value: 1 });
    }
    const r = addToLoadout(loadout, { id: 'hb', name: 'Hot', value: 1 });
    expect(r.ok).toBe(true);
    expect(r.zone).toBe('hotbar');
    expect(loadout.hotbar.some((i) => i?.id === 'hb')).toBe(true);
  });

  it('addToLoadout mutates existing slot arrays in place', () => {
    const outerBackpack = emptyBackpack();
    const loadout = { hotbar: emptyHotbar(), backpack: outerBackpack, equipped: { weapon: null, armor: null } };
    addToLoadout(loadout, { id: 'loot', name: 'Loot', value: 5 });
    expect(outerBackpack.some((i) => i?.id === 'loot')).toBe(true);
    expect(loadout.backpack).toBe(outerBackpack);
  });

  it('stash max stacks', () => {
    const stash = { items: [] };
    for (let i = 0; i < STASH_MAX_STACKS; i++) {
      addToStash(stash, { id: `item${i}`, name: `Item ${i}`, value: 1 });
    }
    const r = addToStash(stash, { id: 'extra', name: 'Extra', value: 1 });
    expect(r.ok).toBe(false);
  });

  it('moveLoadoutToStash merges stacks', () => {
    const profile = {
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 2 }] },
      loadout: {
        hotbar: emptyHotbar(),
        backpack: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 1 }, ...emptyBackpack().slice(1)],
        equipped: { weapon: null, armor: null },
      },
    };
    const r = moveLoadoutToStash(profile, 'backpack', 0, 1);
    expect(r.ok).toBe(true);
    expect(r.profile.stash.items[0].count).toBe(3);
    expect(r.profile.loadout.backpack[0]).toBeNull();
  });

  it('migrateProfile from old loadout counters', () => {
    const old = {
      stash: { items: [{ id: 'coin', name: 'Монета', value: 1 }] },
      loadout: { weapon: 'ak', extraMedkits: 2, extraAmmo: 12, startArmor: 25 },
    };
    const p = migrateProfile(old);
    expect(p.loadout.backpack.filter(Boolean).length + p.loadout.hotbar.filter(Boolean).length).toBeGreaterThan(0);
    expect(p.stash.items.find((i) => i.id === 'coin')).toBeTruthy();
    expect(p.loadout.weapon).toBeUndefined();
  });

  it('stale loadout.weapon does not duplicate weapon already in stash', () => {
    const ak = { id: 'ak', name: 'АК-74', weapon: 'ak', value: 20, count: 1 };
    const profile = {
      stash: { items: [ak] },
      loadout: {
        hotbar: emptyHotbar(),
        backpack: emptyBackpack(),
        equipped: { weapon: null, armor: null },
        weapon: 'ak',
      },
    };
    const p = ensureMigratedProfile(profile);
    expect(loadoutHasWeapon(p.loadout)).toBe(false);
    expect(p.stash.items.filter((i) => i.weapon === 'ak')).toHaveLength(1);
    expect(p.loadout.weapon).toBeUndefined();
  });

  it('loadoutForSave strips legacy weapon field', () => {
    const saved = loadoutForSave({
      hotbar: emptyHotbar(),
      backpack: emptyBackpack(),
      equipped: { weapon: null, armor: null },
      weapon: 'ak',
    });
    expect(saved.weapon).toBeUndefined();
    expect(saved.hotbar).toHaveLength(HOTBAR_SIZE);
  });

  it('normalizeLoadout upgrades old 4-slot backpack', () => {
    const ld = normalizeLoadout({
      backpack: [{ id: 'ak', name: 'АК', weapon: 'ak' }, null, null, null],
      equipped: { weapon: null, armor: null },
    });
    expect(ld.backpack).toHaveLength(BACKPACK_SIZE);
    expect(ld.hotbar).toHaveLength(HOTBAR_SIZE);
    expect(ld.backpack[0].weapon).toBe('ak');
  });

  it('stackItems groups flat stash', () => {
    const stacked = stackItems([
      { id: 'ammo', name: 'Патроны', ammo: 12 },
      { id: 'ammo', name: 'Патроны', ammo: 12 },
    ]);
    expect(stacked).toHaveLength(1);
    expect(stacked[0].count).toBe(2);
  });

  it('addToLoadout merges stacks across backpack and hotbar', () => {
    const loadout = {
      hotbar: [{ id: 'ammo', name: 'Патроны', ammo: 18, value: 0, count: 2 }, null, null],
      backpack: emptyBackpack(),
      equipped: { weapon: null, armor: null },
    };
    const r = addToLoadout(loadout, { id: 'ammo', name: 'Патроны', ammo: 18, value: 0 });
    expect(r.ok).toBe(true);
    expect(loadout.hotbar[0].count).toBe(3);
    expect(loadout.backpack.filter(Boolean)).toHaveLength(0);
  });

  it('swapLoadoutSlots merges matching stacks', () => {
    const loadout = {
      hotbar: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 1 }, null, null],
      backpack: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 2 }, ...emptyBackpack().slice(1)],
      equipped: { weapon: null, armor: null },
    };
    const r = swapLoadoutSlots(loadout, 'backpack', 0, 'hotbar', 0);
    expect(r.ok).toBe(true);
    expect(loadout.hotbar[0].count).toBe(3);
    expect(loadout.backpack[0]).toBeNull();
  });

  it('itemsMatch requires same id and props', () => {
    expect(itemsMatch({ id: 'ammo', ammo: 12 }, { id: 'ammo', ammo: 12 })).toBe(true);
    expect(itemsMatch({ id: 'ammo', ammo: 12 }, { id: 'ammo', ammo: 24 })).toBe(false);
  });

  it('removeFromStash partial', () => {
    const stash = { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 5 }] };
    const r = removeFromStash(stash, 0, 2);
    expect(r.ok).toBe(true);
    expect(r.item.count).toBe(2);
    expect(stash.items[0].count).toBe(3);
  });
});
