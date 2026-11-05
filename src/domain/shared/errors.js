/* ==========================================================================
   Доменные ошибки.
   Позволяют различать бизнес-ошибки (недостаточно средств) от технических.
   ========================================================================== */

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message) {
    super('INVARIANT_VIOLATION', message);
  }
}

export class AlreadyReversedError extends DomainError {
  constructor(message = 'Операция уже отменена') {
    super('ALREADY_REVERSED', message);
  }
}

export class DeletedGoalError extends DomainError {
  constructor(message = 'Нельзя отменить операцию, связанную с удаленной целью') {
    super('DELETED_GOAL', message);
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(message = 'Недостаточно средств') {
    super('INSUFFICIENT_FUNDS', message);
  }
}
