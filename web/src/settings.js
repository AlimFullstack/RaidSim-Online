const STORAGE_KEY = 'raidsim-settings';

export const DEFAULT_SETTINGS = {
  masterVol: 0.32,
  sfxVol: 1,
  musicVol: 0.14,
  mouseSens: 1,
};

export const CONTROL_BINDINGS = [
  { keys: 'W A S D', action: 'Движение' },
  { keys: 'Shift', action: 'Бег' },
  { keys: 'Мышь', action: 'Прицеливание' },
  { keys: 'ЛКМ', action: 'Стрельба (если выбран слот с оружием)' },
  { keys: 'R', action: 'Перезарядка' },
  { keys: 'E', action: 'Поиск / лут (удерживать)' },
  { keys: 'Tab / I', action: 'Большой рюкзак (или кнопка РЮКЗАК)' },
  { keys: 'F', action: 'Использовать выбранный слот (аптечка, бинт, броня)' },
  { keys: 'G', action: 'Граната из выбранного слота' },
  { keys: 'V', action: 'Дымовая из выбранного слота' },
  { keys: 'Q', action: 'Выбросить предмет из выбранного слота' },
  { keys: '1–6', action: 'Выбор слота — оружие ЛКМ, аптечка F, граната G' },
  { keys: 'Esc', action: 'Настройки (в рейде и лобби)' },
];

/** @returns {typeof DEFAULT_SETTINGS} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @param {typeof DEFAULT_SETTINGS} settings */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
