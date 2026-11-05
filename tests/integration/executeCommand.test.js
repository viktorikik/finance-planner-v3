/* ==========================================================================
   Интеграционный тест: выполнение команд через IndexedDB.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, closeDB } from '../../src/infrastructure/database/db.js';
import { executeCommand } from '../../src/application/commands/executeCommand.js';
import { requestToPromise } from '../../src/infrastructure/database/transaction.js';
import { DuplicateCommandError } from '../../src/domain/shared/errors.js';

describe('Stage 3.3 — Command Execution', () => {
  let db;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    closeDB();
  });

  it('Создает взнос и сохраняет в базу', async () => {
    const command = {
      commandId: 'cmd-123',
      commandType: 'contribution.create',
      payload: {
        goalId: 'goal-1',
        amountMinor: 10000,
        actualDate: '2026-11-05',
        type: 'additional'
      }
    };

    const result = await executeCommand(db, command);
    expect(result.success).toBe(true);

    // Проверяем, что данные физически в БД
    const tx = db.transaction(['actualContributions', 'moneyEntries', 'processedCommands'], 'readonly');
    
    const contribs = await requestToPromise(tx.objectStore('actualContributions').getAll());
    expect(contribs.length).toBe(1);
    expect(contribs[0].amountMinor).toBe(10000);

    const entries = await requestToPromise(tx.objectStore('moneyEntries').getAll());
    expect(entries.length).toBe(1);
    expect(entries[0].amountMinor).toBe(10000);

    const processed = await requestToPromise(tx.objectStore('processedCommands').getAll());
    expect(processed.length).toBe(1);
    expect(processed[0].commandId).toBe('cmd-123');
  });

  it('Защищает от дублирования (идемпотентность)', async () => {
    // Пытаемся выполнить ту же команду (тот же commandId)
    const command = {
      commandId: 'cmd-123', // Тот же ID
      commandType: 'contribution.create',
      payload: {
        goalId: 'goal-1',
        amountMinor: 10000,
        actualDate: '2026-11-05',
        type: 'additional'
      }
    };

    await expect(executeCommand(db, command)).rejects.toThrow(DuplicateCommandError);

    // Проверяем, что новых записей не появилось
    const tx = db.transaction('actualContributions', 'readonly');
    const contribs = await requestToPromise(tx.objectStore('actualContributions').getAll());
    expect(contribs.length).toBe(1); // Все еще 1
  });
});
