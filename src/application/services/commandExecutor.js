/* ==========================================================================
   Исполнитель команд.
   Проверяет processedCommands для защиты от дублей.
   ========================================================================== */
import { generateId } from '../../domain/shared/ids.js';

/**
 * Создает объект команды с уникальным ID.
 * @param {string} type 
 * @param {Object} payload 
 */
export function createCommand(type, payload) {
  return {
    commandId: generateId(),
    commandType: type,
    payload,
    registeredAt: new Date().toISOString()
  };
}

/**
 * Проверяет, была ли команда уже выполнена.
 * Возвращает true, если дубликат.
 */
export function isCommandProcessed(commandId, processedCommands) {
  return processedCommands.some(cmd => cmd.commandId === commandId);
}
