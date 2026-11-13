/* ==========================================================================
   state.js — глобальное состояние UI.
   ========================================================================== */
let activeViewOwnerId = null; // null = смотрим свои данные, строка = смотрим данные друга

export function getActiveViewOwnerId() {
  return activeViewOwnerId;
}

export function setActiveViewOwnerId(id) {
  activeViewOwnerId = id;
}
