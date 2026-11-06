/* ==========================================================================
   Логика управления целями.
   ========================================================================== */
import { generateId } from '../shared/ids.js';
import { DomainError } from '../shared/errors.js';

/**
 * Планирует создание новой цели.
 * 
 * @param {Object} params 
 * @param {string} params.name - Название
 * @param {string} params.category - 'long' | 'short'
 * @param {number} params.targetAmountMinor - Целевая сумма
 * @param {string|null} params.deadlineMonth - YYYY-MM
 * @returns {Object} - { newGoals }
 */
export function planGoalCreate(params) {
  const { name, category, targetAmountMinor, deadlineMonth } = params;

  if (!name || name.trim() === '') {
    throw new DomainError('VALIDATION_ERROR', 'Название цели не может быть пустым');
  }
  if (!targetAmountMinor || targetAmountMinor <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'Целевая сумма должна быть больше нуля');
  }

  const now = new Date().toISOString();
  
  const newGoal = {
    id: generateId(),
    name,
    category,
    targetAmountMinor,
    deadlineMonth: deadlineMonth || null,
    planMode: 'auto',
    manualMonthlyAmountMinor: null,
    annualRate: 0,
    indexationRate: 0,
    individualInflationRate: null,
    status: 'active',
    achievedAt: null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now
  };

  return { newGoals: [newGoal] };
}
