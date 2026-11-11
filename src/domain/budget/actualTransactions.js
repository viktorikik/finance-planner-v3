/* ==========================================================================
   Чистая логика для создания фактических операций (доходы/расходы).
   ========================================================================== */
import { generateId } from '../shared/ids.js';

export function planActualTransactionCreate(payload) {
  const now = new Date().toISOString();
  
  if (!payload.title || payload.title.trim() === '') throw new Error('Название обязательно');
  if (payload.amountMinor <= 0) throw new Error('Сумма должна быть больше нуля');
  if (!['income', 'expense'].includes(payload.type)) throw new Error('Неверный тип транзакции');
  if (!payload.actualDate) throw new Error('Дата обязательна');

  const tx = {
    id: generateId(),
    type: payload.type,
    title: payload.title.trim(),
    amountMinor: Math.round(payload.amountMinor),
    actualDate: payload.actualDate, // YYYY-MM-DD
    category: payload.category || 'other',
    plannedTransactionId: payload.plannedTransactionId || null, // Связь с планом
    createdAt: now,
    updatedAt: now
  };

  return { newActualTransactions: [tx] };
}
