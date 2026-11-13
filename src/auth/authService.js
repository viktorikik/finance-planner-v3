// src/auth/authService.js
import { supabase } from '../supabaseClient.js';

/**
 * Регистрация нового пользователя по email + паролю.
 * Возвращает объект с данными пользователя или бросает ошибку.
 */
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Вход существующего пользователя.
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Выход из аккаунта.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Получить текущую сессию (null, если пользователь не вошёл).
 * Сессия сохраняется автоматически в localStorage браузера,
 * поэтому вход продолжает работать после перезапуска PWA и офлайн.
 */
export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Получить текущего пользователя (null, если не вошёл).
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

/**
 * Подписка на изменения состояния аутентификации.
 * Возвращает объект с методом unsubscribe().
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription;
}
