import { useRef } from 'react';
import type { RendererProps } from '../../functions/types';
import { barWidth } from './geometry';
import { useSvgExport } from './useSvgExport';

interface RankRow {
  bin: string;
  n_genomes: number;
  n_genes: number;
}

interface CoreGenomeData {
  coreBin: string;
  nGenomes: number;
  nGenes: number;
  ranking: RankRow[];
}

const TOP_N = 15;
const WIDTH = 720;
const LABEL_W = 70;
const BAR_MAX = 360;
const BAR_X = LABEL_W + 12;
const ROW_H = 24;
const BAR_H = 15;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

const SURFACE = '#ffffff';
const AXIS = '#1a1d24';
const CORE_FILL = '#2f6feb';
const OTHER_FILL = '#94a3b8';
const MUTED = '#6b7280';

export function CoreGenome({ result }: RendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = result.kind === 'json' ? (result.data as CoreGenomeData) : null;

  useSvgExport(svgRef, () => data, [data]);

  if (!data) {
    return <p className="status">No core-genome data returned.</p>;
  }
  const { coreBin, nGenomes, nGenes, ranking } = data;

  const sorted = [...ranking].sort(
    (a, b) => b.n_genomes - a.n_genomes || b.n_genes - a.n_genes,
  );
  const top = sorted.slice(0, TOP_N);
  if (!top.some((r) => r.bin === coreBin)) {
    const core = sorted.find((r) => r.bin === coreBin);
    if (core) top.push(core);
  }
  const maxGenomes = sorted.length ? sorted[0].n_genomes : 0;
  const height = PAD_TOP + PAD_BOTTOM + top.length * ROW_H;

  return (
    <div className="svg-render" style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 12,
          padding: '12px 16px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--panel)',
          color: 'var(--text)',
          maxWidth: 420,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Core-genome bin</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{coreBin}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Genomes</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{nGenomes}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Genes</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{nGenes}</div>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="Bins ranked by genome prevalence"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <rect x={0} y={0} width={WIDTH} height={height} fill={SURFACE} />
        {top.map((r, i) => {
          const y = PAD_TOP + i * ROW_H;
          const w = barWidth(r.n_genomes, maxGenomes, BAR_MAX);
          const isCore = r.bin === coreBin;
          return (
            <g key={r.bin}>
              <text
                x={LABEL_W}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={isCore ? 700 : 400}
                fill={isCore ? CORE_FILL : AXIS}
              >
                {r.bin}
              </text>
              <rect
                x={BAR_X}
                y={y}
                width={w}
                height={BAR_H}
                rx={2}
                fill={isCore ? CORE_FILL : OTHER_FILL}
              >
                <title>
                  {r.bin}: {r.n_genomes} genomes, {r.n_genes} genes
                </title>
              </rect>
              <text
                x={BAR_X + w + 8}
                y={y + BAR_H / 2 + 4}
                fontSize={11}
                fill={MUTED}
              >
                {r.n_genomes} genomes · {r.n_genes} genes
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
