/**
 * Diff Engine — compara snapshot anterior com payload novo.
 * Retorna apenas adicionados, modificados e removidos.
 */

/**
 * @param {any[]} prev  - snapshot anterior (array de objetos)
 * @param {any[]} next  - payload novo (array de objetos)
 * @param {string} key  - campo usado como identificador único
 * @returns {{ added: any[], modified: any[], removed: any[], unchanged: number }}
 */
export function computeDiff(prev, next, key) {
  const prevMap = new Map(prev.map(r => [r[key], r]));
  const nextMap = new Map(next.map(r => [r[key], r]));

  const added    = [];
  const modified = [];
  const removed  = [];
  let   unchanged = 0;

  for (const [k, nextRow] of nextMap) {
    const prevRow = prevMap.get(k);
    if (!prevRow) {
      added.push(nextRow);
    } else {
      const prevHash = stableHash(prevRow);
      const nextHash = stableHash(nextRow);
      if (prevHash !== nextHash) {
        modified.push(nextRow);
      } else {
        unchanged++;
      }
    }
  }

  for (const [k, prevRow] of prevMap) {
    if (!nextMap.has(k)) removed.push(prevRow);
  }

  return { added, modified, removed, unchanged };
}

/** Hash determinístico de um objeto (sem depender de JSON.stringify key order) */
function stableHash(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Aplica diff sobre um snapshot existente e retorna o novo snapshot */
export function applyDiff(snapshot, diff, key) {
  const map = new Map(snapshot.map(r => [r[key], r]));
  for (const r of diff.added)    map.set(r[key], r);
  for (const r of diff.modified) map.set(r[key], r);
  for (const k of diff.removed.map(r => r[key])) map.delete(k);
  return Array.from(map.values());
}

/** Verifica se o diff tem alguma mudança real */
export function hasDiff(diff) {
  return diff.added.length > 0 || diff.modified.length > 0 || diff.removed.length > 0;
}
