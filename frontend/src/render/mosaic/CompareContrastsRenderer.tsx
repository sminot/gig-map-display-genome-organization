import { useMemo } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../functions/types';
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

interface CompareData {
  matches: { organism: string; baseId: string; comparatorId: string }[];
  chi2: { stat: number | null; p: number | null; dof: number | null };
  categories: CategoryMatrix;
  scatter: Row[];
}

function formatStat(v: number | null): string {
  return v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toPrecision(4);
}

export function CompareContrastsRenderer({ params, result }: RendererProps) {
  const data = result.kind === 'json' ? (result.data as CompareData) : null;
  const scatter = data?.scatter ?? [];
  const stat = String(params.stat ?? 'stat');

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
    return Promise.all([
      registerArrow(SCATTER, scatterTable),
      registerArrow(DIAGONAL, diagonalTable),
    ]).then(() =>
      vg.plot(
        vg.line(vg.from(DIAGONAL), { x: 'x', y: 'y', stroke: '#9aa2b1', strokeDasharray: '4,4' }),
        vg.dot(vg.from(SCATTER), {
          x: 'base',
          y: 'comparator',
          fill: 'organism',
          r: 3,
          fillOpacity: 0.7,
        }),
        vg.colorLegend({ label: 'organism' }),
        vg.xDomain([min, max]),
        vg.yDomain([min, max]),
        vg.xLabel(`${stat} (base)`),
        vg.yLabel(`${stat} (comparator)`),
        vg.width(520),
        vg.height(520),
      ),
    );
  };

  if (!data) return <div className="mosaic-error">expected JSON result</div>;

  return (
    <div className="mosaic-view compare-contrasts">
      <MosaicChart build={build} deps={[data]} />
      <div className="compare-stats">
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
