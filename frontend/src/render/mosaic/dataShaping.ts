import type { Table } from 'apache-arrow';

// Pure data-shaping helpers for the mosaic renderers. No DuckDB / vgplot / DOM
// dependencies so they are unit-testable in isolation.

export type Row = Record<string, unknown>;

export function arrowToRecords(table: Table): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const rec = table.get(i) as { toJSON: () => Row } | null;
    rows.push(rec ? rec.toJSON() : {});
  }
  return rows;
}

// Distinct category values in the given order, keeping only values that appear
// in `values` and appending any present values missing from `order` (first-seen).
// Used to align a heatmap's x/y domains with the backend's clustering order.
export function orderDomain(values: string[], order: string[]): string[] {
  const present = new Set(values);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of order) {
    if (present.has(o) && !seen.has(o)) {
      out.push(o);
      seen.add(o);
    }
  }
  for (const v of values) {
    if (!seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  }
  return out;
}

// Ordered list of distinct category values, sorted by an associated numeric
// metric (e.g. genomes sorted by prop_genes_detected, bins by bin_size).
export function domainByMetric(
  records: Row[],
  categoryKey: string,
  metricKey: string,
  descending = false,
): string[] {
  const metric = new Map<string, number>();
  for (const r of records) {
    const cat = String(r[categoryKey]);
    if (!metric.has(cat)) metric.set(cat, Number(r[metricKey]));
  }
  const entries = [...metric.entries()];
  entries.sort((a, b) => (descending ? b[1] - a[1] : a[1] - b[1]));
  return entries.map(([cat]) => cat);
}

export interface Extent {
  min: number;
  max: number;
}

// Symmetric domain spanning all values across the given keys, for a square
// scatter with a y = x reference line. Falls back to a unit range when empty
// and pads a degenerate (min === max) range.
export function scatterExtent(points: Row[], keys: string[] = ['base', 'comparator']): Extent {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    for (const k of keys) {
      const v = Number(p[k]);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

export interface CategoryMatrix {
  self: string[];
  comparitor: string[];
  matrix: number[][];
}

export interface CategoryCell {
  self: string;
  comparator: string;
  count: number;
  row: number;
  col: number;
}

// Flatten the 3x3 significance-category matrix (rows = base/self category,
// cols = comparator category) into labeled cells for a small heatmap/table.
export function categoryMatrixToCells(categories: CategoryMatrix): CategoryCell[] {
  const cells: CategoryCell[] = [];
  categories.matrix.forEach((rowValues, row) => {
    rowValues.forEach((count, col) => {
      cells.push({
        self: categories.self[row],
        comparator: categories.comparitor[col],
        count,
        row,
        col,
      });
    });
  });
  return cells;
}

export function recordsToCsv(records: Row[], columns?: string[]): string {
  const cols = columns ?? (records.length ? Object.keys(records[0]) : []);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = records.map((r) => cols.map((c) => escape(r[c])).join(','));
  return [head, ...body].join('\n');
}
