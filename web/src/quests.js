export const QUEST_POOL = [
  {
    id: 'coins3',
    title: 'Принеси 3 монеты',
    desc: 'Вынеси с рейда 3 монеты',
    reward: { rubles: 40, xp: 30 },
    check: (_profile, result) => {
      if (result.type !== 'extracted') return false;
      return result.loot.filter((i) => i.id === 'coin').length >= 3;
    },
  },
  {
    id: 'kills2',
    title: 'Убей 2 Scav',
    desc: 'Ликвидируй двух Scav за рейд',
    reward: { rubles: 25, xp: 50 },
    check: (_profile, result) => (result.kills || 0) >= 2,
  },
  {
    id: 'extract1',
    title: 'Чистый выход',
    desc: 'Выйди с экстракта живым',
    reward: { rubles: 20, xp: 40 },
    check: (_profile, result) => result.type === 'extracted',
  },
  {
    id: 'loot500',
    title: 'Богатый рейд',
    desc: 'Вынеси лут на 500₽',
    reward: { rubles: 60, xp: 80 },
    check: (_profile, result) => {
      if (result.type !== 'extracted') return false;
      const v = result.loot.reduce((s, i) => s + (i.value || 0), 0);
      return v >= 500;
    },
  },
];

/** Serializable quest reference for Firestore (no functions). */
export function toQuestRef(quest) {
  if (!quest) return null;
  return { id: quest.id, title: quest.title, desc: quest.desc };
}

/** Normalize quest from Firestore — strip legacy check/reward fields. */
export function normalizeQuestRef(raw) {
  if (!raw?.id) return null;
  const def = QUEST_POOL.find((d) => d.id === raw.id);
  return {
    id: raw.id,
    title: raw.title || def?.title || raw.id,
    desc: raw.desc || def?.desc || '',
  };
}

export function pickRandomQuest(completed = []) {
  const available = QUEST_POOL.filter((q) => !completed.includes(q.id));
  const pick = available.length
    ? available[Math.floor(Math.random() * available.length)]
    : QUEST_POOL[Math.floor(Math.random() * QUEST_POOL.length)];
  return toQuestRef(pick);
}

export function evaluateQuest(profile, result) {
  const q = profile.quests?.active;
  if (!q) return { completed: false };
  const def = QUEST_POOL.find((d) => d.id === q.id);
  if (!def || !def.check(profile, result)) return { completed: false };
  return { completed: true, quest: def };
}

export function applyQuestReward(profile, quest) {
  const p = { ...profile, quests: { active: null, completed: [...(profile.quests?.completed || [])] } };
  if (!p.quests.completed.includes(quest.id)) p.quests.completed.push(quest.id);
  if (quest.reward.rubles) p.rubles += quest.reward.rubles;
  if (quest.reward.xp) p.xp += quest.reward.xp;
  return p;
}
