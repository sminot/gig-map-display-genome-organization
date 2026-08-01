import { useEffect, useMemo, useState } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../figures/types';
import { runFunctionMeta } from '../../api/client';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { BinSelectorList, SELECT_STROKE } from './BinSelectorList';
import { arrowToRecords, orderDomain, recordsToCsv } from './dataShaping';

const TABLE = 'bin_set_heatmap';
const HIGHLIGHT = 'bin_set_heatmap_sel';

interface ClusterOrder {
  binOrder: string[];
  genomeOrder: string[];
}

export function BinSetHeatmapRenderer({ params, result, selectedBin, onSelectBin }: RendererProps) {
  const table = result.kind === 'arrow' ? result.table : null;
  const records = useMemo(() => (table ? arrowToRecords(table) : []), [table]);
  const [order, setOrder] = useState<ClusterOrder | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setOrderError(null);
    runFunctionMeta<ClusterOrder>(TABLE, params)
      .then((o) => {
        if (!cancelled) setOrder(o);
      })
      .catch((e) => {
        if (!cancelled) setOrderError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useRegisterExport(
    {
      json: () => records,
      csv: () => recordsToCsv(records, ['bin', 'genome', 'prop', 'present']),
    },
    [records],
  );

  const binList = useMemo(
    () => orderDomain(records.map((r) => String(r.bin)), order?.binOrder ?? []),
    [records, order],
  );

  const build = (vg: VG) => {
    const genomes = records.map((r) => String(r.genome));
    const bins = records.map((r) => String(r.bin));
    const xDomain = orderDomain(genomes, order?.genomeOrder ?? []);
    const yDomain = orderDomain(bins, order?.binOrder ?? []);
    // Outline every cell of the selected bin's row with a second cell layer.
    const selRows = selectedBin ? records.filter((r) => String(r.bin) === selectedBin) : [];
    const registrations = [registerArrow(TABLE, table!)];
    if (selRows.length) {
      const selTable = tableFromJSON(
        selRows.map((r) => ({ genome: String(r.genome), bin: String(r.bin) })),
      );
      registrations.push(registerArrow(HIGHLIGHT, selTable));
    }
    return Promise.all(registrations).then(() => {
      const marks = [vg.cell(vg.from(TABLE), { x: 'genome', y: 'bin', fill: 'prop' })];
      if (selRows.length) {
        marks.push(
          vg.cell(vg.from(HIGHLIGHT), {
            x: 'genome',
            y: 'bin',
            fill: SELECT_STROKE,
            fillOpacity: 0.2,
            stroke: SELECT_STROKE,
            strokeWidth: 1.5,
          }),
        );
      }
      return vg.plot(
        ...marks,
        vg.xDomain(xDomain),
        vg.yDomain(yDomain),
        vg.colorScheme('blues'),
        vg.colorDomain([0, 1]),
        vg.colorLegend({ label: 'prop genes detected' }),
        vg.xLabel(null),
        vg.yLabel('bin'),
        vg.xTickRotate(-90),
        vg.marginBottom(320),
        vg.marginLeft(90),
        vg.width(Math.max(360, xDomain.length * 20 + 180)),
        vg.height(Math.max(200, yDomain.length * 20 + 340)),
      );
    });
  };

  if (!table) return <div className="mosaic-error">expected tabular result</div>;
  if (orderError) return <div className="mosaic-error">clustering order failed: {orderError}</div>;
  if (!order) return <div className="mosaic-loading">loading clustering order…</div>;

  return (
    <div className="mosaic-view">
      <BinSelectorList bins={binList} selectedBin={selectedBin} onSelectBin={onSelectBin} />
      <MosaicChart build={build} deps={[records, order, selectedBin]} />
    </div>
  );
}
