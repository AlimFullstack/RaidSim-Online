import { describe, it, expect } from 'vitest';
import { applyRaidResult, sellStashItem, createDefaultProfile, createBetaTestLoadout, ensureMigratedProfile } from '../src/profile.js';
import { loadoutHasWeapon } from '../src/inventory-core.js';
import { WEAPONS } from '../src/weapons.js';

describe('profile extract and sell', () => {
  it('extract stashes loot without granting rubles', () => {
    const profile = createDefaultProfile({ rubles: 100, quests: { active: null, completed: [] } });
    const result = {
      type: 'extracted',
      kills: 1,
      loot: [
        { id: 'coin', name: 'Монета', value: 1, count: 2 },
        { id: 'chain', name: 'Цепь', value: 5, count: 1 },
      ],
    };
    const p = applyRaidResult(profile, result);
    expect(p.rubles).toBe(100);
    expect(p.stash.items.find((i) => i.id === 'coin')?.count).toBe(2);
    expect(p.stash.items.find((i) => i.id === 'chain')).toBeTruthy();
  });

  it('sellStashItem sells full stack value', () => {
    const profile = createDefaultProfile({
      rubles: 20,
      stash: { items: [{ id: 'coin', name: 'Монета', value: 1, count: 4 }] },
      quests: { active: null, completed: [] },
    });
    const r = sellStashItem(profile, 0);
    expect(r.ok).toBe(true);
    expect(r.profile.rubles).toBe(24);
    expect(r.profile.stash.items).toHaveLength(0);
  });

  it('createBetaTestLoadout has all weapons in backpack', () => {
    const ld = createBetaTestLoadout();
    expect(ld.equipped.weapon?.weapon).toBe('ak');
    expect(ld.equipped.armor?.armor).toBe(50);
    expect(ld.hotbar.filter(Boolean)).toHaveLength(3);
    expect(loadoutHasWeapon(ld)).toBe(true);

    const weaponIds = ld.backpack.filter((i) => i?.weapon).map((i) => i.weapon);
    expect(weaponIds.sort()).toEqual(Object.keys(WEAPONS).sort());
    expect(ld.backpack.find((i) => i?.ammo)).toBeTruthy();
  });

  it('betatest does not change profile on extract', () => {
    const profile = createDefaultProfile({
      rubles: 50,
      loadout: {
        hotbar: [{ id: 'pm', name: 'ПМ', weapon: 'pm', value: 1 }],
        backpack: [],
        equipped: { weapon: null, armor: null },
      },
      stash: { items: [{ id: 'coin', name: 'Монета', value: 1, count: 1 }] },
      quests: { active: null, completed: [] },
    });
    const before = ensureMigratedProfile(profile);
    const p = applyRaidResult(profile, {
      type: 'extracted',
      mode: 'betatest',
      sandbox: true,
      kills: 3,
      loot: [{ id: 'gpu', name: 'GPU', value: 99, count: 1 }],
    });
    expect(p.rubles).toBe(before.rubles);
    expect(p.stash.items).toEqual(before.stash.items);
    expect(p.loadout.hotbar[0]?.weapon).toBe(before.loadout.hotbar[0]?.weapon);
    expect(p.stats.raids).toBe(before.stats.raids);
    expect(p.stats.kills).toBe(before.stats.kills);
  });

  it('sellStashItem sells ammo packs', () => {
    const profile = createDefaultProfile({
      rubles: 0,
      stash: { items: [{ id: 'ammo', name: 'Патроны', ammo: 18, value: 15, count: 1 }] },
      quests: { active: null, completed: [] },
    });
    const r = sellStashItem(profile, 0);
    expect(r.ok).toBe(true);
    expect(r.profile.rubles).toBe(15);
    expect(r.profile.stash.items).toHaveLength(0);
  });

  it('sellStashItem sells ammo without explicit value via ammo count', () => {
    const profile = createDefaultProfile({
      rubles: 10,
      stash: { items: [{ id: 'ammo', name: 'Патроны', ammo: 36, value: 0, count: 1 }] },
      quests: { active: null, completed: [] },
    });
    const r = sellStashItem(profile, 0);
    expect(r.ok).toBe(true);
    expect(r.profile.rubles).toBe(40);
  });

  it('sellStashItem rejects zero-value consumables', () => {
    const profile = createDefaultProfile({
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 75, healDuration: 3, value: 0, count: 2 }] },
      quests: { active: null, completed: [] },
    });
    const r = sellStashItem(profile, 0);
    expect(r.ok).toBe(false);
    expect(r.profile.stash.items).toHaveLength(1);
  });
});
