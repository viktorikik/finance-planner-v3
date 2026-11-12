/* ==========================================================================
   Доменная логика для управления категориями.
   ========================================================================== */
import { CategoryInUseError, SystemCategoryError, InvariantViolationError } from '../shared/errors.js';
import { generateId } from '../shared/ids.js';

export function planCategoryCreate(payload) {
  if (!payload.name || payload.name.trim() === '') {
    throw new InvariantViolationError('Название категории не может быть пустым');
  }
  if (!['income', 'expense'].includes(payload.type)) {
    throw new InvariantViolationError('Тип категории должен быть income или expense');
  }

  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: payload.name.trim(),
    type: payload.type,
    color: payload.color || '#8b91a3',
    emoji: payload.emoji || '📦',
    sortOrder: payload.sortOrder || 999,
    isArchived: false,
    isSystem: false,
    createdAt: now,
    updatedAt: now
  };
}

export function planCategoryUpdate(existingCat, payload) {
  if (payload.name !== undefined && payload.name.trim() === '') {
    throw new InvariantViolationError('Название категории не может быть пустым');
  }
  
  return {
    ...existingCat,
    name: payload.name !== undefined ? payload.name.trim() : existingCat.name,
    color: payload.color !== undefined ? payload.color : existingCat.color,
    emoji: payload.emoji !== undefined ? payload.emoji : existingCat.emoji,
    isArchived: payload.isArchived !== undefined ? payload.isArchived : existingCat.isArchived,
    sortOrder: payload.sortOrder !== undefined ? payload.sortOrder : existingCat.sortOrder,
    updatedAt: new Date().toISOString()
  };
}

export function validateCategoryDeletion(category, state) {
  if (category.isSystem) {
    throw new SystemCategoryError();
  }

  const { plannedTransactions = [], actualTransactions = [] } = state;
  
  const isUsedInPlan = plannedTransactions.some(tx => tx.category === category.id);
  const isUsedInFact = actualTransactions.some(tx => tx.category === category.id);

  if (isUsedInPlan || isUsedInFact) {
    throw new CategoryInUseError('Нельзя удалить категорию, так как к ней привязаны транзакции. Вы можете архивировать её.');
  }
}
