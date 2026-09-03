import { useEffect, useState } from 'react';
import { csvParse } from 'd3-dsv';

export type Row = Record<string, string>;

// Served from public/, so it is fetched at runtime rather than bundled. BASE_URL keeps
// the path correct under the GitHub Pages subdirectory.
export const DATA_URL = `${import.meta.env.BASE_URL}data/online-food-orders/online-food-orders.csv`;

export interface Dataset {
  rows: Row[];
  /** Header names exactly as they appear in the file, including the empty trailing one. */
  columns: string[];
  bytes: number;
}

interface DatasetState {
  data: Dataset | null;
  error: string | null;
}

export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;

        const parsed = csvParse(text);
        const columns = parsed.columns;

        // Trim every value on the way in: the source file stores negative feedback as
        // "Negative " with a trailing space, which would otherwise split the grouping.
        const rows: Row[] = parsed.map((row) =>
          Object.fromEntries(columns.map((column) => [column, (row[column] ?? '').trim()])),
        );

        setState({
          data: { rows, columns, bytes: new TextEncoder().encode(text).length },
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ data: null, error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
