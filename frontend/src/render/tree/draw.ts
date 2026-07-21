// Adapted from sminot/newick-viewer (MIT): src/renderer.ts.
// Reimplemented as a lean draw function rather than the upstream TreeRenderer
// class. Kept: D3 SVG rendering of branches + leaf labels/dots for both layouts,
// and scroll-zoom + drag-pan via d3.zoom. Dropped everything tied to the upstream
// app shell: tree editing / context menus, metadata tip colors, legends, search,
// tooltips, animation, dark-mode theming, and the on-canvas zoom-control buttons.

import * as d3 from 'd3';
import type { LayoutEdge, LayoutNode, LayoutType } from './types';
import { parseNewick, countLeaves } from './newick';
import { computeLayout } from './layout';

const BRANCH_COLOR = '#1b1b1b';
const BRANCH_WIDTH = 1.5;
const LEAF_LABEL_COLOR = '#1b1b1b';
const LEAF_DOT_COLOR = '#e0691a';
const LEAF_LABEL_SIZE = 12;
const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Per-leaf vertical spacing (rectangular) / angular allotment (radial) that sets
// the tree's intrinsic size before zoom.
const RECT_ROW = 16;
const RADIAL_PER_LEAF = 18;
const SCALE_EXTENT: [number, number] = [0.2, 20];

export interface TreeDrawResult {
  svg: SVGSVGElement;
  destroy: () => void;
}

/** Newick convention: underscores in leaf names display as spaces. */
function formatLeafName(name: string): string {
  return name.replace(/_/g, ' ');
}

/** Intrinsic drawing surface size, sized to the leaf count so labels don't collide. */
function surfaceSize(leafCount: number, layoutType: LayoutType): { width: number; height: number } {
  if (layoutType === 'radial') {
    const diameter = Math.max(420, leafCount * RADIAL_PER_LEAF);
    return { width: diameter, height: diameter };
  }
  return { width: 900, height: Math.max(180, leafCount * RECT_ROW + 40) };
}

function rectPath(d: LayoutEdge): string {
  return `M${d.sourceX},${d.sourceY} V${d.elbowY} H${d.targetX}`;
}

/**
 * Parse `newick`, lay it out in `layoutType`, and draw it into `container` as an
 * <svg> with scroll-zoom and drag-pan. Returns the <svg> element (for export) and
 * a destroy() that tears down listeners and clears the container.
 */
export function drawTree(
  container: HTMLElement,
  newick: string,
  layoutType: LayoutType,
): TreeDrawResult {
  const root = parseNewick(newick);
  const leafCount = countLeaves(root);
  const { width, height } = surfaceSize(leafCount, layoutType);
  const layout = computeLayout(root, layoutType, width, height);

  d3.select(container).selectAll('*').remove();

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Phylogenetic tree')
    .style('display', 'block')
    .style('max-width', '100%');

  const g = svg.append('g').attr('class', 'tree-group');

  const edgeGroup = g.append('g').attr('class', 'edges');
  if (layoutType === 'rectangular') {
    edgeGroup
      .selectAll('path.branch')
      .data(layout.edges)
      .enter()
      .append('path')
      .attr('class', 'branch')
      .attr('d', rectPath)
      .attr('fill', 'none')
      .attr('stroke', BRANCH_COLOR)
      .attr('stroke-width', BRANCH_WIDTH);
  } else {
    edgeGroup
      .selectAll('line.branch')
      .data(layout.edges)
      .enter()
      .append('line')
      .attr('class', 'branch')
      .attr('x1', (d) => d.sourceX)
      .attr('y1', (d) => d.sourceY)
      .attr('x2', (d) => d.targetX)
      .attr('y2', (d) => d.targetY)
      .attr('stroke', BRANCH_COLOR)
      .attr('stroke-width', BRANCH_WIDTH);
  }

  const leaves = layout.nodes.filter((n) => n.node.children.length === 0);
  const nodeGroup = g.append('g').attr('class', 'nodes');

  nodeGroup
    .selectAll('circle.leaf-node')
    .data(leaves)
    .enter()
    .append('circle')
    .attr('class', 'leaf-node')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', 2)
    .attr('fill', LEAF_DOT_COLOR);

  const labels = nodeGroup
    .selectAll('text.leaf-label')
    .data(leaves)
    .enter()
    .append('text')
    .attr('class', 'leaf-label')
    .attr('dy', '0.35em')
    .attr('font-size', `${LEAF_LABEL_SIZE}px`)
    .attr('font-family', FONT_FAMILY)
    .attr('font-style', 'italic')
    .attr('fill', LEAF_LABEL_COLOR)
    .text((d: LayoutNode) => formatLeafName(d.node.name));

  if (layoutType === 'rectangular') {
    labels
      .attr('x', (d) => d.x + 6)
      .attr('y', (d) => d.y)
      .attr('text-anchor', 'start');
  } else {
    const cx = width / 2;
    const cy = height / 2;
    const isLeftHalf = (d: LayoutNode) => Math.abs(Math.atan2(d.y - cy, d.x - cx)) > Math.PI / 2;
    labels
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('text-anchor', (d) => (isLeftHalf(d) ? 'end' : 'start'))
      .attr('dx', (d) => (isLeftHalf(d) ? -6 : 6))
      .attr('transform', (d) => {
        let deg = (Math.atan2(d.y - cy, d.x - cx) * 180) / Math.PI;
        if (Math.abs(deg) > 90) deg += 180;
        return `rotate(${deg},${d.x},${d.y})`;
      });
  }

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent(SCALE_EXTENT)
    .on('zoom', (event) => {
      g.attr('transform', event.transform.toString());
    });
  svg.call(zoom);

  const svgEl = svg.node() as SVGSVGElement;
  return {
    svg: svgEl,
    destroy: () => {
      svg.on('.zoom', null);
      d3.select(container).selectAll('*').remove();
    },
  };
}
