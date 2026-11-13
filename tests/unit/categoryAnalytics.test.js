import { describe, it, expect } from 'vitest';
import { calculateCategoryAnalytics } from '../../src/domain/budget/categoryAnalytics.js';

describe('Domain: categoryAnalytics', () => {
  const mockState = {
    plannedTransactions: [],
    actualTransactions: [
      { type: 'expense', actualDate: '2026-11-01', amountMinor: 10000, category: 'food' },
      { type: 'expense', actualDate: '2026-11-02', amountMinor: 20000, category: 'housing' }
    ]
  };

  const mockMeta = {
    food: { name: 'Еда', color: '#ff0000', emoji: '🍎' },
    housing: { name: 'Жилье', color: '#00ff00', emoji: '🏠' }
  };

  it('должен корректно считать суммы и использовать данные из справочника', () => {
    const result = calculateCategoryAnalytics('2026-11', mockState, mockMeta);
    
    expect(result.source).toBe('fact');
    expect(result.totalMinor).toBe(30000);
    expect(result.categories.length).toBe(2);
    
    // Проверяем, что данные берутся из mockMeta
    const housingCat = result.categories.find(c => c.key === 'housing');
    expect(housingCat.name).toBe('Жилье');
    expect(housingCat.color).toBe('#00ff00');
    expect(housingCat.amountMinor).toBe(20000);
    expect(housingCat.percent).toBe(66.66666666666666);
  });

  it('должен корректно работать, если категории нет в справочнике', () => {
    const stateWithUnknown = {
      plannedTransactions: [],
      actualTransactions: [
        { type: 'expense', actualDate: '2026-11-01', amountMinor: 5000, category: 'unknown' }
      ]
    };
    const result = calculateCategoryAnalytics('2026-11', stateWithUnknown, mockMeta);
    
    expect(result.categories[0].name).toBe('unknown');
    expect(result.categories[0].color).toBe('#8b91a3');
  });
});
