import { describe, it, expect } from 'vitest';
import { applyRaidResult, sellStashItem, createDefaultProfile } from '../src/profile.js';

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

  it('sellStashItem rejects zero-value consumables', () => {
    const profile = createDefaultProfile({
      stash: { items: [{ id: 'medkit', name: 'Аптечка', heal: 50, value: 0, count: 2 }] },
      quests: { active: null, completed: [] },
    });
    const r = sellStashItem(profile, 0);
    expect(r.ok).toBe(false);
    expect(r.profile.stash.items).toHaveLength(1);
  });
});
