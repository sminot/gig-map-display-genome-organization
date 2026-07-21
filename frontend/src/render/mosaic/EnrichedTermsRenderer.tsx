import { useMemo, useState } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, domainByMetric, recordsToCsv, type Row } from './dataShaping';

const TABLE = 'enriched_terms';
const SIG_Q = 0.05;
const NS = '#9aa2b1';
const SIG = '#2f6feb';
// x position of the FDR line: -log10(0.05).
const SIG_LINE = -Math.log10(SIG_Q);

function significance(r: Row): string {
  return Number(r.qvalue) < SIG_Q ? `q < ${SIG_Q}` : 'n.s.';
}

export function EnrichedTermsRenderer({ result }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useRegisterExport(
    {
      json: () => records,
      csv: () =>
        recordsToCsv(records, [
          'term', 'genes_in_bin', 'genes_total', 'bin_size', 'odds_ratio', 'pvalue', 'qvalue',
        ]),
    },
    [records],
  );

  const build = (vg: VG) => {
    const order = domainByMetric(records, 'term', 'neg_log10_qvalue', true);
    const chartTable = tableFromJSON(
      records.map((r) => ({
        term: String(r.term),
        neg_log10_qvalue: Number(r.neg_log10_qvalue),
        significance: significance(r),
      })),
    );
    return registerArrow(TABLE, chartTable).then(() =>
      vg.plot(
        vg.barX(vg.from(TABLE), { x: 'neg_log10_qvalue', y: 'term', fill: 'significance' }),
        vg.ruleX([SIG_LINE], { stroke: '#6b7280', strokeDasharray: '4,4' }),
        vg.yDomain(order),
        vg.colorDomain([`q < ${SIG_Q}`, 'n.s.']),
        vg.colorRange([SIG, NS]),
        vg.colorLegend({ label: 'FDR' }),
        vg.xLabel('enrichment  −log10(q-value)'),
        vg.yLabel('term'),
        vg.marginLeft(140),
        vg.width(760),
        vg.height(Math.max(160, order.length * 20 + 60)),
      ),
    );
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;

  return (
    <div className="mosaic-view">
      <div className="mosaic-toolbar">
        <button type="button" className={view === 'chart' ? 'active' : ''} onClick={() => setView('chart')}>
          Chart
        </button>
        <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
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
                <th>term</th>
                <th>genes in bin</th>
                <th>genes total</th>
                <th>odds ratio</th>
                <th>p-value</th>
                <th>q-value</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.term)}</td>
                  <td>{`${r.genes_in_bin} / ${r.bin_size}`}</td>
                  <td>{String(r.genes_total)}</td>
                  <td>{Number(r.odds_ratio).toFixed(2)}</td>
                  <td>{Number(r.pvalue).toExponential(2)}</td>
                  <td>{Number(r.qvalue).toExponential(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
