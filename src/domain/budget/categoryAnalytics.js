/* ==========================================================================
   Аналитика расходов по категориям.
   ========================================================================== */

/**
 * Считает суммы по категориям для указанного месяца.
 * Приоритет: сначала фактические расходы, если их нет — плановые.
 * @param {string} month - 'YYYY-MM'
 * @param {Object} state - { plannedTransactions, actualTransactions }
 * @returns {Object} { categories: [{key, amountMinor, percent}], totalMinor, source }
 */
export function calculateCategoryAnalytics(month, state) {
  const { plannedTransactions = [], actualTransactions = [] } = state;

  // 1. Пробуем взять фактические расходы
  const monthFacts = actualTransactions.filter(
    tx => tx.type === 'expense' && tx.actualDate && tx.actualDate.startsWith(month)
  );

  let source = 'fact';
  let items = monthFacts;

  // 2. Если фактов нет — берем плановые (активные) за этот месяц
  if (items.length === 0) {
    source = 'plan';
    // Для регулярных операций — проверяем попадание месяца в период
    items = plannedTransactions.filter(tx => {
      if (tx.type !== 'expense' || tx.isActive === false) return false;
      if (tx.frequency === 'one-time') return tx.startMonth === month;
      if (tx.frequency === 'regular') {
        if (tx.startMonth > month) return false;
        if (tx.endMonth && month > tx.endMonth) return false;
        return true;
      }
      return false;
    });
  }

  if (items.length === 0) {
    return { categories: [], totalMinor: 0, source };
  }

  // 3. Группируем по категориям
  const map = new Map();
  for (const item of items) {
    const cat = item.category || 'other';
    map.set(cat, (map.get(cat) || 0) + item.amountMinor);
  }

  const totalMinor = [...map.values()].reduce((s, v) => s + v, 0);

  // 4. Форматируем
  const CATEGORY_NAMES = {
    food: 'Еда',
    housing: 'Жилье',
    transport: 'Транспорт',
    entertainment: 'Развлечения',
    health: 'Здоровье',
    education: 'Образование',
    salary: 'Зарплата',
    freelance: 'Фриланс',
    gift: 'Подарки',
    other: 'Другое',
  };

  const CATEGORY_COLORS = {
    food: '#ff9f43',
    housing: '#7c5cff',
    transport: '#3ddc97',
    entertainment: '#ff5c7c',
    health: '#00d2d3',
    education: '#feca57',
    other: '#8b91a3',
  };

  const categories = [...map.entries()]
    .sort((a, b) => b[1] - a[1]) // По убыванию суммы
    .map(([key, amountMinor]) => ({
      key,
      name: CATEGORY_NAMES[key] || key,
      color: CATEGORY_COLORS[key] || '#8b91a3',
      amountMinor,
      percent: totalMinor > 0 ? (amountMinor / totalMinor) * 100 : 0,
    }));

  return { categories, totalMinor, source };
}
