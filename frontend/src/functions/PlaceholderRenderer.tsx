import type { FC } from 'react';
import type { RendererFamily, RendererProps } from './types';
import { useRegisterExport } from '../session/exports';

// Foundation placeholder renderer. Shows a banner naming the Wave-2 family that
// will own the real renderer, plus a readable dump of the run result so the app
// is usable end-to-end before WebGL/Mosaic/SVG land. It registers JSON/CSV export
// for tabular/JSON results so the export bar works against placeholders too.

function arrowToRows(table: {
  numRows: number;
  schema: { fields: { name: string }[] };
  get: (i: number) => unknown;
}): { columns: string[]; rows: Record<string, unknown>[] } {
  const columns = table.schema.fields.map((f) => f.name);
  const rows: Record<string, unknown>[] = [];
  const limit = Math.min(table.numRows, 50);
  for (let i = 0; i < limit; i++) {
    const rec = table.get(i) as { toJSON?: () => Record<string, unknown> } | null;
    rows.push(rec?.toJSON ? rec.toJSON() : ({} as Record<string, unknown>));
  }
  return { columns, rows };
}

const FAMILY_HINT: Record<RendererFamily, string> = {
  webgl: 'WebGL genome-organization renderer (render/webgl/)',
  mosaic: 'Mosaic + DuckDB-WASM charts (render/mosaic/)',
  svg: 'React + SVG renderer (render/svg/)',
};

export function makePlaceholder(family: RendererFamily): FC<RendererProps> {
  return function PlaceholderRenderer({ params, result }: RendererProps) {
    const jsonPayload =
      result.kind === 'json'
        ? result.data
        : result.kind === 'plotly'
          ? result.figure
          : arrowToRows(result.table as never);

    const jsonText = JSON.stringify(jsonPayload, null, 2);

    useRegisterExport(
      {
        json: () => jsonPayload,
        csv: () => (result.kind === 'arrow' ? tableToCsv(result.table as never) : ''),
      },
      [result],
    );

    return (
      <div className="placeholder">
        <div className="placeholder-banner">
          renderer: TODO({family}) — will be implemented by {FAMILY_HINT[family]}
        </div>
        <details className="placeholder-params" open>
          <summary>params</summary>
          <pre>{JSON.stringify(params, null, 2)}</pre>
        </details>
        {result.kind === 'arrow' ? (
          <ArrowTable table={result.table as never} />
        ) : (
          <pre className="placeholder-json">{jsonText}</pre>
        )}
      </div>
    );
  };
}

function tableToCsv(table: {
  numRows: number;
  schema: { fields: { name: string }[] };
  get: (i: number) => unknown;
}): string {
  const { columns, rows } = arrowToRows(table);
  const head = columns.join(',');
  const body = rows
    .map((r) => columns.map((c) => JSON.stringify(r[c] ?? '')).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

function ArrowTable({
  table,
}: {
  table: { numRows: number; schema: { fields: { name: string }[] }; get: (i: number) => unknown };
}) {
  const { columns, rows } = arrowToRows(table);
  return (
    <div className="placeholder-table-wrap">
      <p className="placeholder-count">
        {table.numRows} rows (showing {rows.length})
      </p>
      <table className="placeholder-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{String(r[c] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
