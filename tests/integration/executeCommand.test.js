/* ==========================================================================
   Интеграционный тест: выполнение команд через IndexedDB.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, closeDB } from '../../src/infrastructure/database/db.js';
import { executeCommand } from '../../src/application/commands/executeCommand.js';
import { requestToPromise } from '../../src/infrastructure/database/transaction.js';
import { DuplicateCommandError } from '../../src/domain/shared/errors.js';

describe('Stage 3.4 — Command Execution (Transfers & Reversals)', () => {
  let db;

  beforeAll(async () => {
    db = await openDB();
  });

  beforeEach(async () => {
    // Очищаем базу перед каждым тестом
    const tx = db.transaction(['actualContributions', 'moneyLots', 'moneyEntries', 'moneyMovements', 'processedCommands', 'auditLog'], 'readwrite');
    await Promise.all([
      requestToPromise(tx.objectStore('actualContributions').clear()),
      requestToPromise(tx.objectStore('moneyLots').clear()),
      requestToPromise(tx.objectStore('moneyEntries').clear()),
      requestToPromise(tx.objectStore('moneyMovements').clear()),
      requestToPromise(tx.objectStore('processedCommands').clear()),
      requestToPromise(tx.objectStore('auditLog').clear())
    ]);
  });

  afterAll(() => {
    closeDB();
  });

  it('Выполняет перемещение (money.transfer)', async () => {
    // 1. Сначала создаем взнос
    await executeCommand(db, {
      commandId: 'cmd-initial',
      commandType: 'contribution.create',
      payload: { goalId: 'goal-1', amountMinor: 10000, actualDate: '2026-11-01', type: 'additional' }
    });

    // 2. Переводим 4000 в пул
    const transferCmd = {
      commandId: 'cmd-transfer-1',
      commandType: 'money.transfer',
      payload: {
        from: { type: 'goal', id: 'goal-1' },
        to: { type: 'pool', id: 'main' },
        amountMinor: 4000,
        actualDate: '2026-11-02',
        movementType: 'goalToPool'
      }
    };

    const result = await executeCommand(db, transferCmd);
    expect(result.success).toBe(true);

    // Проверяем БД
    const tx = db.transaction(['moneyMovements', 'moneyEntries'], 'readonly');
    const movements = await requestToPromise(tx.objectStore('moneyMovements').getAll());
    const entries = await requestToPromise(tx.objectStore('moneyEntries').getAll());

    expect(movements.length).toBe(1);
    expect(movements[0].amountMinor).toBe(4000);
    // Взнос (1 credit) + Перевод (1 debit, 1 credit) = 3 записи
    expect(entries.length).toBe(3); 
  });

  it('Выполняет отмену перемещения (money.reverse)', async () => {
    // 1. Взнос
    await executeCommand(db, {
      commandId: 'cmd-initial',
      commandType: 'contribution.create',
      payload: { goalId: 'goal-1', amountMinor: 10000, actualDate: '2026-11-01', type: 'additional' }
    });

    // 2. Перевод
    const transferResult = await executeCommand(db, {
      commandId: 'cmd-transfer-1',
      commandType: 'money.transfer',
      payload: { from: { type: 'goal', id: 'goal-1' }, to: { type: 'pool', id: 'main' }, amountMinor: 4000, actualDate: '2026-11-02', movementType: 'goalToPool' }
    });

    const movementId = transferResult.data.newMovements[0].id;

    // 3. Отмена перевода
    const reverseCmd = {
      commandId: 'cmd-reverse-1',
      commandType: 'money.reverse',
      payload: { movementId: movementId }
    };

    await executeCommand(db, reverseCmd);

    // Проверяем БД
    const tx = db.transaction(['moneyMovements', 'moneyEntries'], 'readonly');
    const movements = await requestToPromise(tx.objectStore('moneyMovements').getAll());
    const entries = await requestToPromise(tx.objectStore('moneyEntries').getAll());

    // Статус перемещения должен быть fully_reversed
    expect(movements[0].reversalStatus).toBe('fully_reversed');
    
    // Записей стало больше (добавились компенсирующие)
    // Исходные 3 + 2 компенсирующих = 5
    expect(entries.length).toBe(5);
    
    // Проверяем, что исходный credit помечен как reversed
    const originalCredit = entries.find(e => e.movementId === movementId && e.entryType === 'credit');
    expect(originalCredit.entryStatus).toBe('reversed');
  });
});
