import type { Row } from '../week-02/useDataset';

export interface Cell {
  age: number;
  family: number;
  count: number;
}

/**
 * Age and Family size are both small integers, so 388 respondents land on far fewer
 * distinct positions - 70 of the 96 cells in an 16x6 grid. One circle per row would
 * silently stack them, so we count the respondents per (age, family size) pair and
 * encode that count instead.
 */
export function aggregate(rows: Row[]): Cell[] {
  const cells = new Map<string, Cell>();

  for (const row of rows) {
    const age = Number(row['Age']);
    const family = Number(row['Family size']);
    if (!Number.isFinite(age) || !Number.isFinite(family)) continue;

    const key = `${age}:${family}`;
    const cell = cells.get(key);
    if (cell) cell.count += 1;
    else cells.set(key, { age, family, count: 1 });
  }

  // Largest first, so the big circles are painted behind the small ones and nothing
  // gets buried.
  return [...cells.values()].sort((a, b) => b.count - a.count);
}
