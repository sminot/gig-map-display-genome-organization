import { useMemo } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { BinSelectorList, SELECT_STROKE } from './BinSelectorList';
import { arrowToRecords, recordsToCsv } from './dataShaping';

const TABLE = 'volcano';
const HIGHLIGHT = 'volcano_sel';
const SIG = '#2f6feb';
const NS = '#9aa2b1';
const SIG_LINE = '#d1495b';

export function VolcanoRenderer({ params, result, selectedBin, onSelectBin }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);
  const bins = useMemo(
    () => [...new Set(records.map((r) => String(r.feature)))].sort(),
    [records],
  );

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records, ['feature', 'estimate', 'neg_log10_qvalue', 'qvalue', 'mean_abund', 'significance']),
    },
    [records],
  );

  const sigThresh = Number(params.sigThresh);
  const estThresh = Number(params.estimateThresh);
  const yLine = Number.isFinite(sigThresh) && sigThresh > 0 ? -Math.log10(sigThresh) : null;
  const xLines = Number.isFinite(estThresh) && estThresh > 0 ? [estThresh, -estThresh] : [];

  const build = (vg: VG) => {
    const sel = selectedBin ? records.filter((r) => String(r.feature) === selectedBin) : [];
    const registrations = [registerArrow(TABLE, table!)];
    if (sel.length) {
      const selTable = tableFromJSON(
        sel.map((r) => ({ estimate: Number(r.estimate), neg_log10_qvalue: Number(r.neg_log10_qvalue) })),
      );
      registrations.push(registerArrow(HIGHLIGHT, selTable));
    }
    return Promise.all(registrations).then(() => {
      const marks = [];
      if (yLine !== null) marks.push(vg.ruleY([yLine], { stroke: SIG_LINE, strokeDasharray: '6,4' }));
      if (xLines.length) marks.push(vg.ruleX(xLines, { stroke: SIG_LINE, strokeDasharray: '6,4' }));
      marks.push(
        vg.dot(vg.from(TABLE), {
          x: 'estimate',
          y: 'neg_log10_qvalue',
          fill: 'significance',
          r: 'mean_abund',
          fillOpacity: 0.6,
        }),
      );
      if (sel.length) {
        marks.push(
          vg.dot(vg.from(HIGHLIGHT), {
            x: 'estimate',
            y: 'neg_log10_qvalue',
            r: 8,
            fill: 'none',
            stroke: SELECT_STROKE,
            strokeWidth: 2.5,
          }),
        );
      }
      return vg.plot(
        ...marks,
        vg.colorDomain(['n.s.', 'significant']),
        vg.colorRange([NS, SIG]),
        vg.colorLegend({ label: 'FDR' }),
        vg.rRange([2, 11]),
        vg.xLabel('effect size (Estimate) →'),
        vg.yLabel('↑ −log10(q-value)'),
        vg.width(640),
        vg.height(520),
      );
    });
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;

  return (
    <div className="mosaic-view">
      <MosaicChart build={build} deps={[records, selectedBin, sigThresh, estThresh]} />
      <BinSelectorList bins={bins} selectedBin={selectedBin} onSelectBin={onSelectBin} maxHeight={120} />
    </div>
  );
}
