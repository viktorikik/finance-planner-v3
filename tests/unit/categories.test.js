import { describe, it, expect } from 'vitest';
import { planCategoryCreate, planCategoryUpdate, validateCategoryDeletion } from '../../src/domain/categories/categories.js';
import { SystemCategoryError, CategoryInUseError } from '../../src/domain/shared/errors.js';

describe('Domain: categories', () => {
  const mockSystemCat = { id: 'food', isSystem: true };
  const mockUserCat = { id: 'my_cat', isSystem: false };

  it('должен создавать новую категорию', () => {
    const newCat = planCategoryCreate({ name: 'Подписки', type: 'expense' });
    expect(newCat.id).toBeDefined();
    expect(newCat.name).toBe('Подписки');
    expect(newCat.isSystem).toBe(false);
  });

  it('должен обновлять категорию', () => {
    const updated = planCategoryUpdate(mockUserCat, { name: 'Новое имя' });
    expect(updated.name).toBe('Новое имя');
  });

  it('должен блокировать удаление системной категории', () => {
    const state = { plannedTransactions: [], actualTransactions: [] };
    expect(() => validateCategoryDeletion(mockSystemCat, state)).toThrow(SystemCategoryError);
  });

  it('должен блокировать удаление категории, если на нее есть ссылки в транзакциях', () => {
    const state = {
      plannedTransactions: [{ category: 'my_cat' }],
      actualTransactions: []
    };
    expect(() => validateCategoryDeletion(mockUserCat, state)).toThrow(CategoryInUseError);
  });

  it('должен разрешать удаление пользовательской категории без ссылок', () => {
    const state = { plannedTransactions: [], actualTransactions: [] };
    expect(() => validateCategoryDeletion(mockUserCat, state)).not.toThrow();
  });
});
