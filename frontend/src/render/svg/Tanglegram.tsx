import { useRef } from 'react';
import type { RendererProps } from '../../functions/types';
import {
  leafConnectors,
  linearScale,
  treeEdges,
  type LayoutNode,
  type Link,
} from './geometry';
import { useSvgExport } from './useSvgExport';

interface Layout {
  nodes: LayoutNode[];
  links: Link[];
  leaves: string[];
}

interface TanglegramData {
  coreBin: string;
  concordance: number | null;
  sharedLeaves: number;
  binLayout: Layout;
  coreLayout: Layout;
}

const WIDTH = 920;
const LEFT_PAD = 40;
const RIGHT_PAD = 40;
const TREE_W = 280;
const ROW_GAP = 15;
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

const SURFACE = '#ffffff';
const EDGE = '#1a1d24';
const STUB = '#c9cfda';
const CONNECTOR = '#2f6feb';
const LEAF_DOT = '#e0691a';

function maxOf(values: number[]): number {
  return values.reduce((a, b) => Math.max(a, b), 0);
}

export function Tanglegram({ params, result }: RendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = result.kind === 'json' ? (result.data as TanglegramData) : null;

  useSvgExport(svgRef, () => data, [data]);

  if (!data) {
    return <p className="status">No tanglegram data returned.</p>;
  }
  const { coreBin, concordance, sharedLeaves, binLayout, coreLayout } = data;

  const allNodes = [...binLayout.nodes, ...coreLayout.nodes];
  const maxX = maxOf(allNodes.map((n) => n.x)) || 1;
  const maxY = maxOf(allNodes.map((n) => n.y)) || 1;
  const height = PAD_TOP + PAD_BOTTOM + maxY * ROW_GAP;

  const binInnerX = LEFT_PAD + TREE_W;
  const coreInnerX = WIDTH - RIGHT_PAD - TREE_W;
  const binX = (depth: number) => LEFT_PAD + (depth / maxX) * TREE_W;
  const coreX = (depth: number) => WIDTH - RIGHT_PAD - (depth / maxX) * TREE_W;
  const yScale = linearScale(0, maxY, PAD_TOP, height - PAD_BOTTOM);

  const binEdges = treeEdges(binLayout.nodes, binLayout.links);
  const coreEdges = treeEdges(coreLayout.nodes, coreLayout.links);
  const connectors = leafConnectors(binLayout.nodes, coreLayout.nodes);
  const binLeaves = binLayout.nodes.filter((n) => n.isLeaf);
  const coreLeaves = coreLayout.nodes.filter((n) => n.isLeaf);

  // Rectangular-cladogram elbow: vertical at parent x, then horizontal to child.
  const elbow = (
    px: number,
    py: number,
    cx: number,
    cy: number,
    xf: (d: number) => number,
  ): string => `M ${xf(px)},${yScale(py)} L ${xf(px)},${yScale(cy)} L ${xf(cx)},${yScale(cy)}`;

  const concordanceText = concordance == null ? 'n/a' : concordance.toFixed(3);

  return (
    <div className="svg-render" style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 8, color: 'var(--text)' }}>
        <strong>{String((params as { bin?: unknown }).bin ?? 'bin')}</strong> vs core{' '}
        <strong>{coreBin}</strong> — Spearman concordance {concordanceText}, {sharedLeaves} shared
        leaves. Bin tree (left) vs core tree (right); lines link matching genomes.
      </div>
      <svg
        ref={svgRef}
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="Tanglegram comparing bin tree to core-genome tree"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <rect x={0} y={0} width={WIDTH} height={height} fill={SURFACE} />

        {/* connectors between shared leaves */}
        {connectors.map((c) => (
          <line
            key={`conn-${c.name}`}
            x1={binInnerX}
            y1={yScale(c.binY)}
            x2={coreInnerX}
            y2={yScale(c.coreY)}
            stroke={CONNECTOR}
            strokeWidth={1}
            strokeOpacity={0.55}
          >
            <title>{c.name}</title>
          </line>
        ))}

        {/* bin tree edges + leaf stubs */}
        {binEdges.map((e) => (
          <path
            key={`b-${e.parent}-${e.child}`}
            d={elbow(e.px, e.py, e.cx, e.cy, binX)}
            fill="none"
            stroke={EDGE}
            strokeWidth={1}
          />
        ))}
        {binLeaves.map((n) => (
          <line
            key={`bstub-${n.name}`}
            x1={binX(n.x)}
            y1={yScale(n.y)}
            x2={binInnerX}
            y2={yScale(n.y)}
            stroke={STUB}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        ))}

        {/* core tree edges + leaf stubs */}
        {coreEdges.map((e) => (
          <path
            key={`c-${e.parent}-${e.child}`}
            d={elbow(e.px, e.py, e.cx, e.cy, coreX)}
            fill="none"
            stroke={EDGE}
            strokeWidth={1}
          />
        ))}
        {coreLeaves.map((n) => (
          <line
            key={`cstub-${n.name}`}
            x1={coreX(n.x)}
            y1={yScale(n.y)}
            x2={coreInnerX}
            y2={yScale(n.y)}
            stroke={STUB}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        ))}

        {/* leaf tip markers */}
        {binLeaves.map((n) => (
          <circle key={`bdot-${n.name}`} cx={binInnerX} cy={yScale(n.y)} r={2.5} fill={LEAF_DOT}>
            <title>{n.name}</title>
          </circle>
        ))}
        {coreLeaves.map((n) => (
          <circle key={`cdot-${n.name}`} cx={coreInnerX} cy={yScale(n.y)} r={2.5} fill={LEAF_DOT}>
            <title>{n.name}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
