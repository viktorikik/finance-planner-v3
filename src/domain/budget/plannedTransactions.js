/* ==========================================================================
   Чистая логика для создания и обновления плановых транзакций (доходы/расходы).
   ========================================================================== */
import { generateId } from '../shared/ids.js';

export function planPlannedTransactionCreate(payload) {
  const now = new Date().toISOString();
  
  // Валидация
  if (!payload.title || payload.title.trim() === '') throw new Error('Название обязательно');
  if (payload.amountMinor <= 0) throw new Error('Сумма должна быть больше нуля');
  if (!['income', 'expense'].includes(payload.type)) throw new Error('Неверный тип транзакции');
  if (!payload.startMonth) throw new Error('Месяц начала обязателен');

  const tx = {
    id: generateId(),
    type: payload.type,
    title: payload.title.trim(),
    amountMinor: Math.round(payload.amountMinor),
    category: payload.category || 'other',
    frequency: payload.frequency || 'regular', // 'regular' | 'one-time'
    startMonth: payload.startMonth, // YYYY-MM
    endMonth: payload.endMonth || null, // YYYY-MM
    date: payload.date || null, // YYYY-MM-DD
    dayOfMonth: payload.dayOfMonth || null, // 1-31
    isActive: true,
    createdAt: now,
    updatedAt: now
  };

  return { newPlannedTransactions: [tx] };
}

export function planPlannedTransactionUpdate(payload, existing) {
  const now = new Date().toISOString();
  
  const updated = {
    ...existing,
    title: payload.title !== undefined ? payload.title.trim() : existing.title,
    amountMinor: payload.amountMinor !== undefined ? Math.round(payload.amountMinor) : existing.amountMinor,
    type: payload.type !== undefined ? payload.type : existing.type,
    category: payload.category !== undefined ? payload.category : existing.category,
    frequency: payload.frequency !== undefined ? payload.frequency : existing.frequency,
    startMonth: payload.startMonth !== undefined ? payload.startMonth : existing.startMonth,
    endMonth: payload.endMonth !== undefined ? payload.endMonth : existing.endMonth,
    date: payload.date !== undefined ? payload.date : existing.date,
    dayOfMonth: payload.dayOfMonth !== undefined ? payload.dayOfMonth : existing.dayOfMonth,
    isActive: payload.isActive !== undefined ? payload.isActive : existing.isActive,
    updatedAt: now
  };

  return { newPlannedTransactions: [updated] };
}
