import type { RendererProps } from '../../functions/types';
import { useRegisterExport } from '../../session/exports';
import './mosaic.css';

// bin_stats returns a small structured object {auc, oddsRatio, logistic}. This is
// a plain React stats panel (not a Mosaic chart) — there is nothing to plot, just
// scalar statistics and nested regression coefficients to display.

function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(4);
  if (v === null || v === undefined) return 'n/a';
  return String(v);
}

function StatEntry({ label, value }: { label: string; value: unknown }) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <section className="bin-stat">
        <h4>{label}</h4>
        <table className="mosaic-table">
          <tbody>
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{formatValue(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  return (
    <section className="bin-stat">
      <h4>{label}</h4>
      <p className="bin-stat-scalar">{formatValue(value)}</p>
    </section>
  );
}

export function BinStatsRenderer({ result }: RendererProps) {
  const data = result.kind === 'json' ? (result.data as Record<string, unknown>) : null;

  useRegisterExport({ json: () => data }, [data]);

  if (!data) return <div className="mosaic-error">expected JSON result</div>;

  return (
    <div className="mosaic-view bin-stats">
      {Object.entries(data).map(([key, value]) => (
        <StatEntry key={key} label={key} value={value} />
      ))}
    </div>
  );
}
