import { describe, it, expect } from 'vitest';
import { planSettingsUpdate } from '../../src/domain/settings/settings.js';
import { InvariantViolationError } from '../../src/domain/shared/errors.js';

describe('Domain: settings', () => {
  it('должен корректно обновлять generalInflationRate', () => {
    const result = planSettingsUpdate('generalInflationRate', 5);
    expect(result.id).toBe('generalInflationRate');
    expect(result.value).toBe(5);
    expect(result.updatedAt).toBeDefined();
  });

  it('должен выбрасывать ошибку при отрицательном значении инфляции', () => {
    expect(() => planSettingsUpdate('generalInflationRate', -1)).toThrow(InvariantViolationError);
  });

  it('должен выбрасывать ошибку при значении больше 100', () => {
    expect(() => planSettingsUpdate('generalInflationRate', 101)).toThrow(InvariantViolationError);
  });

  it('должен выбрасывать ошибку при неверном ID настройки', () => {
    expect(() => planSettingsUpdate('someUnknownSetting', 5)).toThrow(InvariantViolationError);
  });
});
