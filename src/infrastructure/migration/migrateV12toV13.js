/* ==========================================================================
   Миграция данных из v12 в v13 (Добавление категорий и общих настроек).
   ========================================================================== */

export const DEFAULT_CATEGORIES = [
  // Расходы
  { id: 'housing', name: 'Недвижимость', type: 'expense', color: '#7c5cff', emoji: '🏠', sortOrder: 10, isSystem: true },
  { id: 'food', name: 'Продукты', type: 'expense', color: '#3ddc97', emoji: '🛒', sortOrder: 20, isSystem: true },
  { id: 'food_out', name: 'Еда вне дома', type: 'expense', color: '#ff9f43', emoji: '🍔', sortOrder: 30, isSystem: true },
  { id: 'transport', name: 'Транспорт', type: 'expense', color: '#ffc857', emoji: '🚗', sortOrder: 40, isSystem: true },
  { id: 'health', name: 'Здоровье', type: 'expense', color: '#ff5c7c', emoji: '💊', sortOrder: 50, isSystem: true },
  { id: 'entertainment', name: 'Развлечения', type: 'expense', color: '#a89cff', emoji: '🎬', sortOrder: 60, isSystem: true },
  { id: 'education', name: 'Образование', type: 'expense', color: '#5cc8ff', emoji: '📚', sortOrder: 70, isSystem: true },
  { id: 'gifts', name: 'Подарки', type: 'expense', color: '#ff7eb3', emoji: '🎁', sortOrder: 80, isSystem: true },
  { id: 'insurance', name: 'Страховки', type: 'expense', color: '#4ecdc4', emoji: '🛡️', sortOrder: 90, isSystem: true },
  { id: 'taxes', name: 'Налоги', type: 'expense', color: '#a29bfe', emoji: '🏛️', sortOrder: 100, isSystem: true },
  { id: 'child', name: 'Ребенок', type: 'expense', color: '#fdcb6e', emoji: '👶', sortOrder: 110, isSystem: true },
  { id: 'other', name: 'Прочее', type: 'expense', color: '#8b91a3', emoji: '📦', sortOrder: 999, isSystem: true },

  // Доходы
  { id: 'salary', name: 'Зарплата', type: 'income', color: '#3ddc97', emoji: '💼', sortOrder: 10, isSystem: true },
  { id: 'freelance', name: 'Фриланс', type: 'income', color: '#5cc8ff', emoji: '💻', sortOrder: 20, isSystem: true },
  { id: 'gift_income', name: 'Подарки', type: 'income', color: '#ffc857', emoji: '🎁', sortOrder: 30, isSystem: true },
  { id: 'other_income', name: 'Прочее', type: 'income', color: '#8b91a3', emoji: '💰', sortOrder: 999, isSystem: true }
];

export const DEFAULT_SETTINGS = [
  { id: 'generalInflationRate', value: 5 }
];

/**
 * Возвращает массив категорий для сохранения.
 */
export function planCategoriesSeed() {
  const now = new Date().toISOString();
  return DEFAULT_CATEGORIES.map(c => ({
    ...c,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  }));
}

/**
 * Возвращает массив настроек для сохранения.
 */
export function planSettingsSeed() {
  const now = new Date().toISOString();
  return DEFAULT_SETTINGS.map(s => ({
    ...s,
    updatedAt: now
  }));
}
