/* ==========================================================================
   Тесты распределения средств.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { allocateFunds } from '../../src/domain/money/allocation.js';
import { InsufficientFundsError } from '../../src/domain/shared/errors.js';

describe('Stage 3.1 — Allocation (FIFO/LIFO)', () => {
  const entries = [
    // p1: 100 (01.01)
    { id: 'e1', entryType: 'credit', positionId: 'p1', amountMinor: 100, entryStatus: 'active', effectiveReceivedAt: '2026-01-01T10:00:00Z' },
    // p2: 200 (02.01)
    { id: 'e2', entryType: 'credit', positionId: 'p2', amountMinor: 200, entryStatus: 'active', effectiveReceivedAt: '2026-01-02T10:00:00Z' },
    // p3: 300 (03.01)
    { id: 'e3', entryType: 'credit', positionId: 'p3', amountMinor: 300, entryStatus: 'active', effectiveReceivedAt: '2026-01-03T10:00:00Z' }
  ];

  const available = [
    { positionId: 'p1' }, { positionId: 'p2' }, { positionId: 'p3' }
  ];

  it('FIFO: берет самые старые', () => {
    const alloc = allocateFunds(250, available, 'FIFO', entries);
    expect(alloc.length).toBe(2);
    expect(alloc[0].positionId).toBe('p1');
    expect(alloc[0].amountMinor).toBe(100);
    expect(alloc[1].positionId).toBe('p2');
    expect(alloc[1].amountMinor).toBe(150);
  });

  it('LIFO: берет самые новые', () => {
    const alloc = allocateFunds(250, available, 'LIFO', entries);
    expect(alloc.length).toBe(1);
    expect(alloc[0].positionId).toBe('p3');
    expect(alloc[0].amountMinor).toBe(250);
  });

  it('Ошибка при нехватке средств', () => {
    expect(() => allocateFunds(1000, available, 'FIFO', entries)).toThrow(InsufficientFundsError);
  });
});
