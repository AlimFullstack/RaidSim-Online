import { describe, it, expect } from 'vitest';
import {
  isStackable,
  itemsMatch,
  addToStash,
  addToBackpack,
  removeFromStash,
  moveStashToLoadout,
  moveLoadoutToStash,
  stackItems,
  migrateProfile,
  emptyBackpack,
  STASH_MAX_STACKS,
  BACKPACK_SIZE,
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

  it('moveStashToLoadout takes 1 from stack', () => {
    const profile = {
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 3 }] },
      loadout: { backpack: emptyBackpack() },
    };
    const r = moveStashToLoadout(profile, 0, 0, 1);
    expect(r.ok).toBe(true);
    expect(r.profile.stash.items[0].count).toBe(2);
    expect(r.profile.loadout.backpack[0].count).toBe(1);
  });

  it('backpack overflow blocks add', () => {
    const slots = emptyBackpack();
    addToBackpack(slots, { id: 'coin', name: 'Монета', value: 1 });
    addToBackpack(slots, { id: 'food', name: 'Еда', value: 1 });
    addToBackpack(slots, { id: 'bolt', name: 'Болт', value: 2 });
    addToBackpack(slots, { id: 'chain', name: 'Цепь', value: 5 });
    const r = addToBackpack(slots, { id: 'key', name: 'Ключ', value: 6 });
    expect(r.ok).toBe(false);
    expect(slots.filter(Boolean)).toHaveLength(BACKPACK_SIZE);
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
      loadout: { backpack: [{ id: 'medkit', name: 'Аптечка', heal: 50, count: 1 }, null, null, null] },
    };
    const r = moveLoadoutToStash(profile, 0, 1);
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
    expect(p.loadout.backpack.filter(Boolean).length).toBeGreaterThan(0);
    expect(p.stash.items.find((i) => i.id === 'coin')).toBeTruthy();
    expect(p.loadout.weapon).toBeUndefined();
  });

  it('stackItems groups flat stash', () => {
    const stacked = stackItems([
      { id: 'ammo', name: 'Патроны', ammo: 12 },
      { id: 'ammo', name: 'Патроны', ammo: 12 },
    ]);
    expect(stacked).toHaveLength(1);
    expect(stacked[0].count).toBe(2);
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
