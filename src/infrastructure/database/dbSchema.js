/* ==========================================================================
   Схема базы данных IndexedDB (модель v14.0).
   Добавлены таблицы для синхронизации:
   - syncOutbox — журнал исходящих изменений (очередь на отправку в облако)
   - syncMeta   — служебные метаданные синхронизации (lastSync и др.)
   Синхронизируемые записи получают поля:
   - _syncUpdatedAt — время последнего локального изменения
   - _fieldVersions — {поле: timestamp} для field-level merge
   ========================================================================== */

export const DB_NAME = 'finance-planner-db';
export const DB_VERSION = 14;

/**
 * Сторы, участвующие в облачной синхронизации.
 * Для всех записей в этих сторах executeCommand будет поддерживать
 * _syncUpdatedAt и _fieldVersions, а также писать в syncOutbox.
 */
export const SYNCABLE_STORES = [
  'goals',
  'plannedOperations',
  'plannedTransactions',
  'actualTransactions',
  'actualIncomes',
  'actualContributions',
  'initialContributions',
  'investmentIncomes',
  'moneyLots',
  'moneyMovements',
  'moneyEntries',
  'pool',
  'categories',
  'settings',
  'parameterHistory'
];

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
  actualTransactions: {
    keyPath: 'id',
    indexes: [
      { name: 'type', keyPath: 'type' },
      { name: 'actualDate', keyPath: 'actualDate' },
      { name: 'plannedTransactionId', keyPath: 'plannedTransactionId' }
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
  categories: {
    keyPath: 'id',
    indexes: [
      { name: 'type', keyPath: 'type' },
      { name: 'isArchived', keyPath: 'isArchived' },
      { name: 'sortOrder', keyPath: 'sortOrder' }
    ]
  },
  meta: {
    keyPath: 'id',
    indexes: []
  },
  // === НОВОЕ В v14 ===
  syncOutbox: {
    keyPath: 'id',
    indexes: [
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'entityId', keyPath: 'entityId' },
      { name: 'storeName', keyPath: 'storeName' }
    ]
  },
  syncMeta: {
    keyPath: 'id',
    indexes: []
  }
};
