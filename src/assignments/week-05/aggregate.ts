import type { Row } from '../week-02/useDataset';
import { STATUS_KEYS, type Selection, type StatusKey } from './series';

export type StatusCounts = Record<StatusKey, number>;

export interface Cell {
  age: number;
  family: number;
  /** Everyone at this age and family size. */
  count: number;
  /** The same respondents split by marital status. Sums to `count`. */
  byStatus: StatusCounts;
}

const emptyCounts = (): StatusCounts => ({ Single: 0, Married: 0, 'Prefer not to say': 0 });

function isStatus(value: string): value is StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(value);
}

/**
 * Week 4 counted respondents per (age, family size) pair. Week 5 keeps that total and
 * carries the marital-status split alongside it, so switching the legend is a lookup
 * rather than a re-scan of all 388 rows - and so a circle can draw its subset inside
 * an outline of its total.
 *
 * The three documented statuses cover every row in this file. Anything else would
 * still be counted in `count` but in no status, which would make the parts fall short
 * of the whole; nothing in the current data takes that path.
 */
export function aggregate(rows: Row[]): Cell[] {
  const cells = new Map<string, Cell>();

  for (const row of rows) {
    const age = Number(row['Age']);
    const family = Number(row['Family size']);
    if (!Number.isFinite(age) || !Number.isFinite(family)) continue;

    const key = `${age}:${family}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { age, family, count: 0, byStatus: emptyCounts() };
      cells.set(key, cell);
    }

    cell.count += 1;
    const status = row['Marital Status'];
    if (isStatus(status)) cell.byStatus[status] += 1;
  }

  // Largest total first, so the big circles are painted behind the small ones and
  // nothing gets buried. Sorting on the total rather than on the selected subset keeps
  // the paint order fixed as the legend changes.
  return [...cells.values()].sort((a, b) => b.count - a.count);
}

/** How many respondents in this cell the current legend selection counts. */
export function countIn(cell: Cell, selection: Selection) {
  return selection === 'all' ? cell.count : cell.byStatus[selection];
}

export function totalIn(cells: Cell[], selection: Selection) {
  return cells.reduce((sum, cell) => sum + countIn(cell, selection), 0);
}
