import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import {
  categoryMatrixToCells,
  recordsToCsv,
  scatterExtent,
  type CategoryMatrix,
  type Row,
} from './dataShaping';

const SCATTER = 'compare_scatter';
const DIAGONAL = 'compare_diagonal';
const HIGHLIGHT = 'compare_scatter_sel';
const SELECT_STROKE = '#f59e0b';

interface CompareData {
  matches: { organism: string; baseId: string; comparatorId: string }[];
  chi2: { stat: number | null; p: number | null; dof: number | null };
  categories: CategoryMatrix;
  scatter: Row[];
}

function formatStat(v: number | null): string {
  return v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toPrecision(4);
}

export function CompareContrastsRenderer({ params, result, selectedBin, onSelectBin }: RendererProps) {
  const data = result.kind === 'json' ? (result.data as CompareData) : null;
  const scatter = data?.scatter ?? [];
  const stat = String(params.stat ?? 'stat');

  // Each scatter point's `feature` is a bin name; list them for click-to-select.
  const bins = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of scatter) {
      const f = String(p.feature);
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    return out.sort();
  }, [scatter]);

  const cells = useMemo(
    () => (data ? categoryMatrixToCells(data.categories) : []),
    [data],
  );
  const maxCount = useMemo(
    () => cells.reduce((m, c) => Math.max(m, c.count), 0),
    [cells],
  );

  useRegisterExport(
    {
      json: () => data,
      csv: () => recordsToCsv(scatter, ['organism', 'feature', 'base', 'comparator']),
    },
    [data],
  );

  const build = (vg: VG) => {
    const { min, max } = scatterExtent(scatter);
    const scatterTable = tableFromJSON(
      scatter.map((p) => ({
        organism: String(p.organism),
        feature: String(p.feature),
        base: Number(p.base),
        comparator: Number(p.comparator),
      })),
    );
    const diagonalTable = tableFromJSON([
      { x: min, y: min },
      { x: max, y: max },
    ]);
    const selPoints = selectedBin ? scatter.filter((p) => String(p.feature) === selectedBin) : [];
    const registrations = [
      registerArrow(SCATTER, scatterTable),
      registerArrow(DIAGONAL, diagonalTable),
    ];
    if (selPoints.length) {
      const selTable = tableFromJSON(
        selPoints.map((p) => ({ base: Number(p.base), comparator: Number(p.comparator) })),
      );
      registrations.push(registerArrow(HIGHLIGHT, selTable));
    }
    return Promise.all(registrations).then(() => {
      const marks = [
        vg.line(vg.from(DIAGONAL), { x: 'x', y: 'y', stroke: '#9aa2b1', strokeDasharray: '4,4' }),
        vg.dot(vg.from(SCATTER), {
          x: 'base',
          y: 'comparator',
          fill: 'organism',
          r: 3,
          fillOpacity: 0.7,
        }),
      ];
      if (selPoints.length) {
        // Ringed marker over the selected bin's point(s).
        marks.push(
          vg.dot(vg.from(HIGHLIGHT), {
            x: 'base',
            y: 'comparator',
            r: 7,
            fill: 'none',
            stroke: SELECT_STROKE,
            strokeWidth: 2.5,
          }),
        );
      }
      return vg.plot(
        ...marks,
        vg.colorLegend({ label: 'organism' }),
        vg.xDomain([min, max]),
        vg.yDomain([min, max]),
        vg.xLabel(`${stat} (base)`),
        vg.yLabel(`${stat} (comparator)`),
        vg.width(520),
        vg.height(520),
      );
    });
  };

  if (!data) return <div className="mosaic-error">expected JSON result</div>;

  return (
    <div className="mosaic-view compare-contrasts">
      <MosaicChart build={build} deps={[data, selectedBin]} />
      <div className="compare-stats">
        <section>
          <h4>Bins</h4>
          <div style={binListStyle} role="listbox" aria-label="Select a bin">
            {bins.map((bin) => (
              <button
                key={bin}
                type="button"
                role="option"
                aria-selected={bin === selectedBin}
                style={binButtonStyle(bin === selectedBin)}
                onClick={() => onSelectBin?.(bin === selectedBin ? null : bin)}
              >
                {bin}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4>Matched pairs</h4>
          <ul>
            {data.matches.map((m) => (
              <li key={m.baseId + m.comparatorId}>
                {m.organism}: {m.baseId} vs {m.comparatorId}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Chi-squared</h4>
          <p>
            stat {formatStat(data.chi2.stat)} · p {formatStat(data.chi2.p)} · dof{' '}
            {data.chi2.dof ?? 'n/a'}
          </p>
        </section>
        <section>
          <h4>Significance categories (base rows × comparator cols)</h4>
          <table className="category-matrix">
            <thead>
              <tr>
                <th />
                {data.categories.comparitor.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categories.self.map((selfCat, row) => (
                <tr key={selfCat}>
                  <th>{selfCat}</th>
                  {data.categories.comparitor.map((_, col) => {
                    const cell = cells.find((c) => c.row === row && c.col === col)!;
                    const intensity = maxCount > 0 ? cell.count / maxCount : 0;
                    return (
                      <td
                        key={col}
                        style={{
                          background: `rgba(47, 111, 235, ${intensity.toFixed(3)})`,
                          color: intensity > 0.5 ? '#fff' : 'inherit',
                        }}
                      >
                        {cell.count}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

const binListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  maxHeight: 120,
  overflowY: 'auto',
};

function binButtonStyle(selected: boolean): CSSProperties {
  return {
    border: `1px solid ${selected ? SELECT_STROKE : 'var(--border)'}`,
    background: selected ? SELECT_STROKE : 'var(--panel)',
    color: selected ? '#1a1d24' : 'var(--text)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}
