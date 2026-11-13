// src/auth/authService.js
import { getSupabaseClient } from '../supabaseClient.js';

/**
 * Регистрация нового пользователя по email + паролю.
 */
export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Вход существующего пользователя.
 */
export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Выход из аккаунта.
 */
export async function signOut() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Получить текущую сессию (null, если пользователь не вошёл).
 */
export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Получить текущего пользователя (null, если не вошёл).
 */
export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

/**
 * Подписка на изменения состояния аутентификации.
 */
export function onAuthStateChange(callback) {
  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription;
}
