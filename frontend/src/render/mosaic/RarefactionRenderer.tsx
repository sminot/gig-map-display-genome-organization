import { useMemo } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, recordsToCsv, type Row } from './dataShaping';

const TABLE = 'rarefaction';

// Backend columns: n_genomes, count, mean, std, min, 25%, 50%, 75%, max
// (a pandas describe() per genome count). Rendered as a mean line with a
// min..max band. Columns with '%' are renamed to plottable identifiers.
function cleanRows(records: Row[]): Row[] {
  return records.map((r) => ({
    n_genomes: Number(r.n_genomes),
    mean: Number(r.mean),
    lo: Number(r.min),
    hi: Number(r.max),
    q25: Number(r['25%']),
    q75: Number(r['75%']),
  }));
}

export function RarefactionRenderer({ result }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records),
    },
    [records],
  );

  const build = (vg: VG) => {
    const clean = tableFromJSON(cleanRows(records));
    return registerArrow(TABLE, clean).then(() =>
      vg.plot(
        vg.areaY(vg.from(TABLE), {
          x: 'n_genomes',
          y1: 'lo',
          y2: 'hi',
          fill: '#2f6feb',
          fillOpacity: 0.12,
        }),
        vg.areaY(vg.from(TABLE), {
          x: 'n_genomes',
          y1: 'q25',
          y2: 'q75',
          fill: '#2f6feb',
          fillOpacity: 0.2,
        }),
        vg.lineY(vg.from(TABLE), { x: 'n_genomes', y: 'mean', stroke: '#2f6feb' }),
        vg.dotY(vg.from(TABLE), { x: 'n_genomes', y: 'mean', fill: '#2f6feb', r: 2 }),
        vg.xLabel('genomes sampled'),
        vg.yLabel('genes observed'),
        vg.width(700),
        vg.height(420),
      ),
    );
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;

  return (
    <div className="mosaic-view">
      <MosaicChart build={build} deps={[records]} />
    </div>
  );
}
