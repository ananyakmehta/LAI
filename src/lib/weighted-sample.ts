/**
 * Weighted random sampling without replacement, used by the admin "assign
 * random rankings" simulation control (src/app/admin/simulation-panel.tsx).
 * Same algorithm as the one duplicated in scripts/generate-rankings.ts and
 * scripts/simulate-wave-cycle.ts — those keep their own copies deliberately
 * (self-contained standalone scripts); this copy is for the in-app admin
 * route only.
 */
export function weightedSampleWithoutReplacement<T>(
  items: { item: T; weight: number }[],
  count: number,
): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    result.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return result;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
