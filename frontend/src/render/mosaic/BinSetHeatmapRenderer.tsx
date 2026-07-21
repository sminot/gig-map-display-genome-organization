import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { tableFromJSON } from 'apache-arrow';
import type { RendererProps } from '../../functions/types';
import { useRegisterExport } from '../../session/exports';
import { registerArrow, type VG } from './mosaicClient';
import { MosaicChart } from './MosaicChart';
import { arrowToRecords, orderDomain, recordsToCsv } from './dataShaping';

const TABLE = 'bin_set_heatmap';
const HIGHLIGHT = 'bin_set_heatmap_sel';
const SELECT_STROKE = '#f59e0b';

interface ClusterOrder {
  binOrder: string[];
  genomeOrder: string[];
}

// Self-contained fetch for the clustering-order sidecar (kept out of api/client.ts
// to avoid collisions with the concurrent form/schema agent).
async function fetchClusterOrder(params: Record<string, unknown>): Promise<ClusterOrder> {
  const res = await fetch('/api/run/bin_set_heatmap/meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as ClusterOrder;
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
    fetchClusterOrder(params)
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
      <div style={binListStyle} role="listbox" aria-label="Select a bin">
        {binList.map((bin) => (
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
      <MosaicChart build={build} deps={[records, order, selectedBin]} />
    </div>
  );
}

const binListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  maxHeight: 96,
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
