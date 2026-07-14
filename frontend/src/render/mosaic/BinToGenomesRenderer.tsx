import { useMemo, useState } from 'react';
import type { RendererProps } from '../../functions/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, domainByMetric, recordsToCsv } from './dataShaping';

const TABLE = 'bin_to_genomes';
const ABSENT = '#9aa2b1';
const PRESENT = '#2f6feb';

export function BinToGenomesRenderer({ result }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records, ['genome', 'n_genes_detected', 'prop_genes_detected', 'present']),
    },
    [records],
  );

  const build = (vg: VG) => {
    const genomeOrder = domainByMetric(records, 'genome', 'prop_genes_detected', true);
    return registerArrow(TABLE, table!).then(() =>
      vg.plot(
        vg.barX(vg.from(TABLE), {
          x: 'prop_genes_detected',
          y: 'genome',
          fill: 'present',
        }),
        vg.xDomain([0, 1]),
        vg.yDomain(genomeOrder),
        vg.colorDomain([false, true]),
        vg.colorRange([ABSENT, PRESENT]),
        vg.colorLegend({ label: 'present (prop >= 0.5)' }),
        vg.xLabel('proportion of bin genes detected'),
        vg.yLabel('genome'),
        vg.marginLeft(320),
        vg.width(760),
        vg.height(Math.max(160, genomeOrder.length * 18 + 60)),
      ),
    );
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;

  return (
    <div className="mosaic-view">
      <div className="mosaic-toolbar">
        <button
          type="button"
          className={view === 'chart' ? 'active' : ''}
          onClick={() => setView('chart')}
        >
          Chart
        </button>
        <button
          type="button"
          className={view === 'table' ? 'active' : ''}
          onClick={() => setView('table')}
        >
          Table
        </button>
      </div>
      {view === 'chart' ? (
        <MosaicChart build={build} deps={[records]} />
      ) : (
        <div className="mosaic-table-wrap">
          <table className="mosaic-table">
            <thead>
              <tr>
                <th>genome</th>
                <th>genes detected</th>
                <th>proportion</th>
                <th>present</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.genome)}</td>
                  <td>{String(r.n_genes_detected)}</td>
                  <td>{Number(r.prop_genes_detected).toFixed(3)}</td>
                  <td>{r.present ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
