import { describe, it, expect } from 'vitest';
import { toQuestRef, pickRandomQuest, QUEST_POOL } from '../src/quests.js';
import { serializeProfile } from '../src/auth.js';
import { createDefaultProfile } from '../src/profile.js';

describe('toQuestRef', () => {
  it('strips check and reward', () => {
    const ref = toQuestRef(QUEST_POOL[0]);
    expect(ref).toEqual({ id: 'coins3', title: QUEST_POOL[0].title, desc: QUEST_POOL[0].desc });
    expect(ref.check).toBeUndefined();
    expect(ref.reward).toBeUndefined();
  });
});

describe('pickRandomQuest', () => {
  it('returns serializable ref', () => {
    const q = pickRandomQuest([]);
    expect(q.id).toBeDefined();
    expect(q.title).toBeDefined();
    expect(q.check).toBeUndefined();
  });
});

describe('serializeProfile', () => {
  it('removes isGuest and undefined loadout fields', () => {
    const p = createDefaultProfile({
      isGuest: true,
      quests: { active: pickRandomQuest([]), completed: [] },
      loadout: { extraMedkits: 0, extraAmmo: 0, startArmor: 0, weapon: undefined },
    });
    const data = serializeProfile(p);
    expect(data.isGuest).toBeUndefined();
    expect(data.loadout.weapon).toBeUndefined();
    expect(data.quests.active.check).toBeUndefined();
  });
});
