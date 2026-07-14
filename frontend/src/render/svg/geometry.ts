// Pure geometry helpers for the SVG renderers (synteny arrows, tanglegram,
// core-genome ranking). No React/DOM here so they can be unit-tested directly.

export type Direction = 'fwd' | 'rev';

export interface LayoutNode {
  name: string;
  x: number;
  y: number;
  isLeaf: boolean;
}

export interface Link {
  parent: string;
  child: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Linear map from [domainMin, domainMax] onto [rangeMin, rangeMax]. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const span = domainMax - domainMin;
  if (span === 0) return () => rangeMin;
  const k = (rangeMax - rangeMin) / span;
  return (value) => rangeMin + (value - domainMin) * k;
}

interface ArrowOpts {
  left: number; // pixel x of the lower genomic coordinate
  right: number; // pixel x of the higher genomic coordinate
  dir: Direction;
  yTop: number;
  height: number;
  headLen: number; // desired arrowhead length in px (clamped to the gene width)
}

/**
 * SVG polygon `points` for a gene arrow. Body spans [left, right]; the arrowhead
 * points right for "fwd" and left for "rev". headLen is clamped so a short gene
 * degrades to a pure triangle rather than inverting.
 */
export function arrowPoints({ left, right, dir, yTop, height, headLen }: ArrowOpts): string {
  const head = Math.min(headLen, Math.max(right - left, 0));
  const yMid = yTop + height / 2;
  const yBot = yTop + height;
  const pts =
    dir === 'fwd'
      ? [
          [left, yTop],
          [right - head, yTop],
          [right, yMid],
          [right - head, yBot],
          [left, yBot],
        ]
      : [
          [right, yTop],
          [left + head, yTop],
          [left, yMid],
          [left + head, yBot],
          [right, yBot],
        ];
  return pts.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' ');
}

/**
 * Bar length for a ranked value against the largest value in the ranking.
 * Clamps to [0, maxWidth]; a non-positive maxValue yields 0.
 */
export function barWidth(value: number, maxValue: number, maxWidth: number): number {
  if (maxValue <= 0 || value <= 0) return 0;
  return (Math.min(value, maxValue) / maxValue) * maxWidth;
}

export interface LeafConnection {
  name: string;
  binY: number;
  coreY: number;
}

/**
 * Tanglegram leaf matching: leaves present as a leaf in BOTH layouts, matched by
 * node.name, in the order they appear in the bin layout. Each carries its
 * vertical (y) position in each tree so a connector can be drawn between them.
 */
export function leafConnectors(
  binNodes: LayoutNode[],
  coreNodes: LayoutNode[],
): LeafConnection[] {
  const coreLeafY = new Map<string, number>();
  for (const n of coreNodes) {
    if (n.isLeaf) coreLeafY.set(n.name, n.y);
  }
  const out: LeafConnection[] = [];
  for (const n of binNodes) {
    if (n.isLeaf && coreLeafY.has(n.name)) {
      out.push({ name: n.name, binY: n.y, coreY: coreLeafY.get(n.name)! });
    }
  }
  return out;
}

export interface TreeEdge {
  parent: string;
  child: string;
  px: number;
  py: number;
  cx: number;
  cy: number;
}

/** Resolve each parent->child link to the (x,y) of both endpoints by node name. */
export function treeEdges(nodes: LayoutNode[], links: Link[]): TreeEdge[] {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  return links.map(({ parent, child }) => {
    const p = byName.get(parent);
    const c = byName.get(child);
    if (!p || !c) {
      throw new Error(`tree link references unknown node: ${parent} -> ${child}`);
    }
    return { parent, child, px: p.x, py: p.y, cx: c.x, cy: c.y };
  });
}

/** Largest 1/2/5 * 10^k value not exceeding x (for a scale-bar tick). */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const base = 10 ** exp;
  const frac = x / base;
  const mult = frac >= 5 ? 5 : frac >= 2 ? 2 : 1;
  return mult * base;
}
