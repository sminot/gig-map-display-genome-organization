import { useRef } from 'react';
import type { RendererProps } from '../../figures/types';
import { arrowPoints, linearScale, niceRound, type Direction } from './geometry';
import { useSvgExport } from './useSvgExport';

interface Gene {
  gene_id: string;
  label: string;
  start: number;
  stop: number;
  dir: Direction;
  group: number;
}

interface SyntenyData {
  genes: Gene[];
  groupOffsets: number[];
  length: number;
}

const WIDTH = 1000;
const PAD_LEFT = 48;
const PAD_RIGHT = 24;
const PAD_TOP = 40;
const LANE_HEIGHT = 30;
const HEAD_LEN = 7;
const AXIS_Y = PAD_TOP + LANE_HEIGHT + 24;
const HEIGHT = AXIS_Y + 70;

const SURFACE = '#ffffff';
const AXIS = '#1a1d24';
const GRID = '#c9cfda';
const MUTED = '#6b7280';
// Categorical fills for gene groups (readable on the white surface).
const GROUP_FILLS = [
  '#2f6feb',
  '#12a150',
  '#e0691a',
  '#8b5cf6',
  '#0891b2',
  '#d6336c',
  '#b7791f',
  '#495057',
];

function fmtBp(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} Mb`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)} kb`;
  return `${Math.round(n)} bp`;
}

export function SyntenyLayout({ params, result }: RendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = result.kind === 'json' ? (result.data as SyntenyData) : null;

  useSvgExport(svgRef, () => data, [data]);

  if (!data) {
    return <p className="status">No synteny data returned.</p>;
  }
  const { genes, groupOffsets, length } = data;
  const x = linearScale(0, length, PAD_LEFT, WIDTH - PAD_RIGHT);
  const laneY = PAD_TOP;

  const barSpan = niceRound(length / 5);
  const barPx = x(barSpan) - x(0);

  return (
    <div className="svg-render" style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 8, color: 'var(--text)' }}>
        <strong>{String((params as { bin?: unknown }).bin ?? 'bin')}</strong> — {genes.length}{' '}
        genes across {groupOffsets.length} contig group
        {groupOffsets.length === 1 ? '' : 's'}, {fmtBp(length)} total
      </div>
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gene-arrow synteny map"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill={SURFACE} />

        {/* group dividers (skip the leading offset at 0) */}
        {groupOffsets.slice(1).map((offset) => (
          <line
            key={`div-${offset}`}
            x1={x(offset)}
            x2={x(offset)}
            y1={laneY - 6}
            y2={laneY + LANE_HEIGHT + 6}
            stroke={GRID}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {/* lane baseline */}
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={laneY + LANE_HEIGHT / 2}
          y2={laneY + LANE_HEIGHT / 2}
          stroke={GRID}
          strokeWidth={1}
        />

        {/* gene arrows */}
        {genes.map((g) => {
          const lo = Math.min(g.start, g.stop);
          const hi = Math.max(g.start, g.stop);
          const left = x(lo);
          const right = Math.max(x(hi), left + 1);
          return (
            <polygon
              key={g.gene_id}
              points={arrowPoints({
                left,
                right,
                dir: g.dir,
                yTop: laneY,
                height: LANE_HEIGHT,
                headLen: HEAD_LEN,
              })}
              fill={GROUP_FILLS[g.group % GROUP_FILLS.length]}
              fillOpacity={0.85}
              stroke={AXIS}
              strokeWidth={0.4}
            >
              <title>{g.label}</title>
            </polygon>
          );
        })}

        {/* genomic-coordinate axis */}
        <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={AXIS_Y} y2={AXIS_Y} stroke={AXIS} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const coord = length * f;
          return (
            <g key={`tick-${f}`}>
              <line x1={x(coord)} x2={x(coord)} y1={AXIS_Y} y2={AXIS_Y + 5} stroke={AXIS} />
              <text
                x={x(coord)}
                y={AXIS_Y + 18}
                textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                fontSize={11}
                fill={MUTED}
              >
                {fmtBp(coord)}
              </text>
            </g>
          );
        })}

        {/* scale bar */}
        <g transform={`translate(${PAD_LEFT}, ${AXIS_Y + 40})`}>
          <line x1={0} x2={barPx} y1={0} y2={0} stroke={AXIS} strokeWidth={2} />
          <line x1={0} x2={0} y1={-4} y2={4} stroke={AXIS} strokeWidth={2} />
          <line x1={barPx} x2={barPx} y1={-4} y2={4} stroke={AXIS} strokeWidth={2} />
          <text x={barPx / 2} y={16} textAnchor="middle" fontSize={11} fill={AXIS}>
            {fmtBp(barSpan)}
          </text>
        </g>
      </svg>
    </div>
  );
}
