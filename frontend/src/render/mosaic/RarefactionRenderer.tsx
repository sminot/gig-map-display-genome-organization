import { useMemo } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, recordsToCsv, type Row } from './dataShaping';

const TABLE = 'rarefaction';
const ACCENT = '#2f6feb';

// Backend columns: pangenome (label), n_genomes, count, mean, std, min, 25%, 50%,
// 75%, max (a pandas describe() per genome count, per pangenome). Rendered as a
// mean line per pangenome; the min..max and IQR bands are shown only for a single
// pangenome (they overlap into mud when several are drawn together).
function cleanRows(records: Row[]): Row[] {
  return records.map((r) => ({
    pangenome: String(r.pangenome ?? ''),
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
  const multiple = useMemo(
    () => new Set(records.map((r) => String(r.pangenome))).size > 1,
    [records],
  );

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records),
    },
    [records],
  );

  const build = (vg: VG) => {
    const clean = tableFromJSON(cleanRows(records));
    return registerArrow(TABLE, clean).then(() => {
      const marks = [];
      if (!multiple) {
        marks.push(
          vg.areaY(vg.from(TABLE), { x: 'n_genomes', y1: 'lo', y2: 'hi', fill: ACCENT, fillOpacity: 0.12 }),
          vg.areaY(vg.from(TABLE), { x: 'n_genomes', y1: 'q25', y2: 'q75', fill: ACCENT, fillOpacity: 0.2 }),
        );
      }
      // One coloured line/point series per pangenome when several are selected.
      const colorBy = multiple ? 'pangenome' : ACCENT;
      marks.push(
        vg.lineY(vg.from(TABLE), { x: 'n_genomes', y: 'mean', stroke: colorBy }),
        vg.dotY(vg.from(TABLE), { x: 'n_genomes', y: 'mean', fill: colorBy, r: 2 }),
      );
      const opts = [
        ...marks,
        vg.xLabel('genomes sampled'),
        vg.yLabel('genes observed'),
        vg.width(700),
        vg.height(420),
      ];
      if (multiple) opts.push(vg.colorLegend({ label: 'pangenome' }));
      return vg.plot(...opts);
    });
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;

  return (
    <div className="mosaic-view">
      <MosaicChart build={build} deps={[records, multiple]} />
    </div>
  );
}
