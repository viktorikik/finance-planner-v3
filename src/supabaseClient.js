// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iakygphxoxgnbneyipqr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_S4VXyw4ZKa0bpzasK8lREw_0Qw0jCPU';

let client = null;

/**
 * Ленивая инициализация клиента Supabase.
 * Клиент создаётся при первом вызове, а не при импорте модуля.
 * Это предотвращает побочные эффекты в тестах (Node.js 20 не имеет WebSocket).
 */
export function getSupabaseClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}
