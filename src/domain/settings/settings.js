/* ==========================================================================
   Доменная логика для работы с настройками.
   ========================================================================== */
import { InvariantViolationError } from '../shared/errors.js';

export function planSettingsUpdate(id, value) {
  if (id === 'generalInflationRate') {
    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 100) {
      throw new InvariantViolationError('Инфляция должна быть числом от 0 до 100');
    }
    return { id, value: num, updatedAt: new Date().toISOString() };
  }

  throw new InvariantViolationError(`Неизвестная настройка: ${id}`);
}
