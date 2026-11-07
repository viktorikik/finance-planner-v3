/* ==========================================================================
   Схема базы данных IndexedDB (модель v9.0).
   Добавлена единая таблица plannedTransactions для Бюджета.
   ========================================================================== */

export const DB_NAME = 'finance-planner-db';
export const DB_VERSION = 10; // Принудительно поднимаем версию, чтобы пробить кэш

export const STORES = {
  goals: {
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status' },
      { name: 'category', keyPath: 'category' },
      { name: 'sortOrder', keyPath: 'sortOrder' }
    ]
  },
  plannedOperations: {
    keyPath: 'id',
    indexes: [
      { name: 'goalId', keyPath: 'goalId' },
      { name: 'plannedMonth', keyPath: 'plannedMonth' },
      { name: 'state', keyPath: 'state' }
    ]
  },
  plannedTransactions: {
    keyPath: 'id',
    indexes: [
      { name: 'type', keyPath: 'type' },
      { name: 'isActive', keyPath: 'isActive' },
      { name: 'startMonth', keyPath: 'startMonth' },
      { name: 'frequency', keyPath: 'frequency' }
    ]
  },
  actualIncomes: {
    keyPath: 'id',
    indexes: [
      { name: 'actualDate', keyPath: 'actualDate' },
      { name: 'category', keyPath: 'category' }
    ]
  },
  actualContributions: {
    keyPath: 'id',
    indexes: [
      { name: 'goalId', keyPath: 'goalId' },
      { name: 'plannedOperationId', keyPath: 'plannedOperationId' },
      { name: 'actualDate', keyPath: 'actualDate' },
      { name: 'reversalStatus', keyPath: 'reversalStatus' }
    ]
  },
  initialContributions: {
    keyPath: 'id',
    indexes: [
      { name: 'reversalStatus', keyPath: 'reversalStatus' }
    ]
  },
  investmentIncomes: {
    keyPath: 'id',
    indexes: [
      { name: 'actualDate', keyPath: 'actualDate' },
      { name: 'reversalStatus', keyPath: 'reversalStatus' }
    ]
  },
  moneyLots: {
    keyPath: 'id',
    indexes: [
      { name: 'sourceRecordId', keyPath: 'sourceRecordId' },
      { name: 'sourceType', keyPath: 'sourceType' }
    ]
  },
  moneyMovements: {
    keyPath: 'id',
    indexes: [
      { name: 'actualDate', keyPath: 'actualDate' },
      { name: 'reversalStatus', keyPath: 'reversalStatus' },
      { name: 'cancellationGroupId', keyPath: 'cancellationGroupId' }
    ]
  },
  moneyEntries: {
    keyPath: 'id',
    indexes: [
      { name: 'moneyLotId', keyPath: 'moneyLotId' },
      { name: 'positionId', keyPath: 'positionId', unique: true },
      { name: 'parentPositionId', keyPath: 'parentPositionId' },
      { name: 'movementId', keyPath: 'movementId' },
      { name: 'effectiveReceivedAt', keyPath: 'effectiveReceivedAt' },
      { name: 'entryStatus', keyPath: 'entryStatus' },
      { name: 'reversalGroupId', keyPath: 'reversalGroupId' }
    ]
  },
  pool: {
    keyPath: 'id',
    indexes: []
  },
  parameterHistory: {
    keyPath: 'id',
    indexes: [
      { name: 'entityId', keyPath: 'entityId' },
      { name: 'field', keyPath: 'field' }
    ]
  },
  auditLog: {
    keyPath: 'id',
    indexes: [
      { name: 'eventType', keyPath: 'eventType' },
      { name: 'occurredAt', keyPath: 'occurredAt' }
    ]
  },
  processedCommands: {
    keyPath: 'commandId',
    indexes: [
      { name: 'commandType', keyPath: 'commandType' }
    ]
  },
  settings: {
    keyPath: 'id',
    indexes: []
  },
  meta: {
    keyPath: 'id',
    indexes: []
  }
};
