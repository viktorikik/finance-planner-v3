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

export class DuplicateCommandError extends DomainError {
  constructor(message = 'Команда с таким ID уже была выполнена') {
    super('DUPLICATE_COMMAND', message);
  }
}

export class CategoryNotFoundError extends DomainError {
  constructor(message = 'Категория не найдена') {
    super('CATEGORY_NOT_FOUND', message);
  }
}

export class CategoryInUseError extends DomainError {
  constructor(message = 'Категория используется в транзакциях') {
    super('CATEGORY_IN_USE', message);
  }
}

export class SystemCategoryError extends DomainError {
  constructor(message = 'Системную категорию нельзя удалить, только архивировать') {
    super('SYSTEM_CATEGORY', message);
  }
}

export class DataClearError extends DomainError {
  constructor(message = 'Ошибка при очистке данных') {
    super('DATA_CLEAR_FAILED', message);
  }
}

export class InvalidBackupError extends DomainError {
  constructor(message = 'Неверный формат файла бэкапа') {
    super('INVALID_BACKUP', message);
  }
}
