/* ==========================================================================
   Утилита: кеш и загрузка имён владельцев (друзей) из profiles.display_name.
   Используется в PlanScreen, StatisticsScreen, BudgetScreen.
   ========================================================================== */

const NAMES_CACHE_KEY = 'cached_owner_names';

export function readNamesCache() {
  try {
    const raw = localStorage.getItem(NAMES_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeNamesCache(names) {
  try {
    localStorage.setItem(NAMES_CACHE_KEY, JSON.stringify(names));
  } catch { /* ignore */ }
}

export function clearNamesCache() {
  try { localStorage.removeItem(NAMES_CACHE_KEY); } catch { /* ignore */ }
}

export async function fetchOwnerNames(supabase, ids) {
  const result = {};
  if (!ids || ids.length === 0) return result;
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    if (error) {
      console.warn('[ownerNames] fetch failed:', error.message);
      return result;
    }
    (profiles || []).forEach(p => {
      const name = (p.display_name || '').trim();
      if (name) result[p.id] = name;
    });
  } catch (err) {
    console.warn('[ownerNames] fetch crashed:', err?.message);
  }
  return result;
}

export function refreshOwnerNamesInBackground(supabase, ids) {
  if (!ids || ids.length === 0) return;
  fetchOwnerNames(supabase, ids).then(fresh => {
    if (!fresh || Object.keys(fresh).length === 0) return;
    const current = readNamesCache();
    const merged = { ...current, ...fresh };
    const trimmed = {};
    ids.forEach(id => { if (merged[id]) trimmed[id] = merged[id]; });
    writeNamesCache(trimmed);
  }).catch(() => { /* ignore */ });
}

/**
 * Возвращает { id: name } для указанных id.
 *  - Если все имена есть в кеше — возвращает мгновенно + фоновое обновление.
 *  - Если кеш пуст/неполный — await запроса только для недостающих id.
 */
export async function resolveOwnerNames(supabase, ids, options = {}) {
  const { backgroundRefresh = true } = options;
  const result = {};
  if (!ids || ids.length === 0) return result;

  const cache = readNamesCache();
  const missing = [];
  ids.forEach(id => {
    if (cache[id]) result[id] = cache[id];
    else missing.push(id);
  });

  if (missing.length === 0) {
    if (backgroundRefresh) refreshOwnerNamesInBackground(supabase, ids);
    return result;
  }

  const fetched = await fetchOwnerNames(supabase, missing);
  Object.assign(result, fetched);

  const trimmed = {};
  ids.forEach(id => { if (result[id]) trimmed[id] = result[id]; });
  writeNamesCache(trimmed);

  return result;
}
