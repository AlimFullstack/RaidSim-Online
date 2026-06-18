/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ x: number, y: number, tier?: string }} LootPointDef */
/** @typedef {{ x: number, y: number }} PointDef */

/**
 * @typedef {Object} MapConfig
 * @property {string} id
 * @property {string} name
 * @property {string} theme
 * @property {Array<Rect & { m?: number }>} walls
 * @property {Rect} extractZone
 * @property {PointDef} spawnPlayer
 * @property {LootPointDef[]} lootPoints
 * @property {PointDef[]} scavSpawns
 * @property {PointDef} [bossSpawn]
 */

/**
 * @typedef {Object} PlayerProfile
 * @property {string} displayName
 * @property {string|null} photoURL
 * @property {boolean} isGuest
 * @property {number} xp
 * @property {number} rubles
 * @property {{ items: import('./profile.js').LootItem[] }} stash
 * @property {Loadout} loadout
 * @property {RaidStats} stats
 * @property {QuestState} [quests]
 */

/** @typedef {{ extraMedkits: number, extraAmmo: number, startArmor: number, weapon?: string }} Loadout */
/** @typedef {{ raids: number, extracts: number, kills: number, totalLootValue: number }} RaidStats */
/** @typedef {{ active: import('./quests.js').Quest|null, completed: string[] }} QuestState */

export {};
