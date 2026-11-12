/* ==========================================================================
   Аналитика расходов по категориям.
   Принимает справочник категорий извне (из БД).
   ========================================================================== */

/**
 * Считает суммы по категориям для указанного месяца.
 * @param {string} month - 'YYYY-MM'
 * @param {Object} state - { plannedTransactions, actualTransactions }
 * @param {Object} categoriesMeta - Справочник { id: {name, color, emoji} }
 * @returns {Object} { categories: [{key, name, color, amountMinor, percent}], totalMinor, source }
 */
export function calculateCategoryAnalytics(month, state, categoriesMeta = {}) {
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

  // 4. Форматируем (используя данные из БД)
  const categories = [...map.entries()]
    .sort((a, b) => b[1] - a[1]) // По убыванию суммы
    .map(([key, amountMinor]) => {
      const meta = categoriesMeta[key] || { name: key, color: '#8b91a3', emoji: '📦' };
      return {
        key,
        name: meta.name,
        color: meta.color,
        emoji: meta.emoji || '📦',
        amountMinor,
        percent: totalMinor > 0 ? (amountMinor / totalMinor) * 100 : 0,
      };
    });

  return { categories, totalMinor, source };
}
