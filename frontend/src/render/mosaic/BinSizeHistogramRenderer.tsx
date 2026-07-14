import { useMemo } from 'react';
import type { RendererProps } from '../../functions/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, domainByMetric, recordsToCsv } from './dataShaping';

const TABLE = 'bin_size_histogram';

// Backend columns: bin_size (numeric bucket position), count (number of bins in
// the bucket), bin_names (human-readable gene-count range, e.g. "5 - 6").
export function BinSizeHistogramRenderer({ result }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records, ['bin_names', 'bin_size', 'count']),
    },
    [records],
  );

  const build = (vg: VG) => {
    const xDomain = domainByMetric(records, 'bin_names', 'bin_size', false);
    return registerArrow(TABLE, table!).then(() =>
      vg.plot(
        vg.barY(vg.from(TABLE), { x: 'bin_names', y: 'count', fill: '#2f6feb' }),
        vg.xDomain(xDomain),
        vg.xLabel('genes per bin'),
        vg.yLabel('number of bins'),
        vg.xTickRotate(-45),
        vg.marginBottom(90),
        vg.width(760),
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
