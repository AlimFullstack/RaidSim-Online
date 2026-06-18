/** @typedef {{ id: string, name: string, count?: number, value?: number, heal?: number, ammo?: number, weapon?: string, armor?: number, grenade?: boolean, smoke?: boolean, consumable?: boolean, starter?: boolean, uid?: string }} StackItem */

/**
 * @typedef {Object} PlayerProfile
 * @property {string} displayName
 * @property {string|null} photoURL
 * @property {boolean} isGuest
 * @property {number} xp
 * @property {number} rubles
 * @property {{ items: StackItem[] }} stash
 * @property {Loadout} loadout
 * @property {RaidStats} stats
 * @property {QuestState} [quests]
 */

/** @typedef {{ backpack: (StackItem|null)[] }} Loadout */
/** @typedef {{ raids: number, extracts: number, kills: number, totalLootValue: number }} RaidStats */
/** @typedef {{ active: import('./quests.js').Quest|null, completed: string[] }} QuestState */

export {};
