// Pure geometry + data-shaping for the circular genome-organization plot,
// ported from the legacy app.js `buildRenderData`, genome-viz.js ring layout and
// webgl-renderer.js wedge geometry. No DOM/GPU here so it is unit-testable.
//
// Angle convention (matches d3.arc and the legacy shader): 0 rad = 12 o'clock,
// increasing clockwise. Screen position of angle θ at radius r about (cx,cy) is
// x = cx + r*sin(θ), y = cy - r*cos(θ).

import type { GenomeOrganizationMeta } from '../../api/client';

const TWO_PI = 2 * Math.PI;

export type Rgba = [number, number, number, number];

export interface AlignmentRow {
  gene: string;
  contig: string;
  genome: string;
  qstart: number;
  qend: number;
  qlen: number;
  pident: number;
  coverage: number;
  bin: string;
}

export interface Contig {
  contig: string;
  len: number;
  cumStart: number;
}

export interface ReferenceGene {
  gene: string;
  contig: string;
  qstart: number;
  qend: number;
  bin: string;
  pident: number;
  coverage: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
}

export interface GenomeHit {
  pident: number;
  coverage: number;
  bin: string;
}

export type ColorBy = 'genome' | 'bin' | 'pident' | 'coverage';

export interface RenderData {
  reference: string;
  contigs: Contig[];
  totalLength: number;
  /** gene id -> reference-frame gene (defines the angular axis). */
  referenceGenes: Map<string, ReferenceGene>;
  /** genome -> (gene id -> hit) for every non-reference genome. */
  genomeGenes: Map<string, Map<string, GenomeHit>>;
  /** non-reference genomes, in ring order (inner = index 0). */
  visibleGenomes: string[];
  colorBy: ColorBy;
  binIndex: Map<string, number>;
  genomeIndex: Map<string, number>;
  overlayByBin?: Map<string, number>;
  overlayChannel?: 'arcColor' | 'outerTrack';
  /** max |stat| across overlaid bins, for centering the diverging scale. */
  overlayAbsMax: number;
}

// ── Request shaping ─────────────────────────────────────────────────────────
//
// The single SchemaForm produces flat fields. The backend Params expects a
// nested `overlay` object, and treats `referenceGenome` as a hard row filter
// (it drops every other genome, which would leave no rings). So the reference
// is applied client-side only and is NOT sent on the wire; the flat overlay*
// fields are folded into `overlay` (omitted entirely when no contrast is set).
export function buildRequestBody(params: Record<string, unknown>): Record<string, unknown> {
  const {
    referenceGenome: _referenceGenome,
    overlayContrastId,
    overlayStat,
    overlayChannel,
    ...rest
  } = params;
  const body: Record<string, unknown> = { ...rest };
  if (typeof overlayContrastId === 'string' && overlayContrastId !== '') {
    const overlay: Record<string, unknown> = { contrastId: overlayContrastId };
    if (typeof overlayStat === 'string' && overlayStat !== '') overlay.stat = overlayStat;
    if (typeof overlayChannel === 'string' && overlayChannel !== '') overlay.channel = overlayChannel;
    body.overlay = overlay;
  }
  return body;
}

// ── Arrow adapter ───────────────────────────────────────────────────────────

interface ArrowVector {
  get(i: number): unknown;
}
interface ArrowTableLike {
  numRows: number;
  getChild(name: string): ArrowVector | null;
}

export function arrowToAlignmentRows(table: ArrowTableLike): AlignmentRow[] {
  const col = (name: string): ArrowVector => {
    const c = table.getChild(name);
    if (!c) throw new Error(`genome_organization table missing column '${name}'`);
    return c;
  };
  const gene = col('gene');
  const contig = col('contig');
  const genome = col('genome');
  const qstart = col('qstart');
  const qend = col('qend');
  const qlen = col('qlen');
  const pident = col('pident');
  const coverage = col('coverage');
  const bin = col('bin');
  const rows: AlignmentRow[] = new Array(table.numRows);
  for (let i = 0; i < table.numRows; i++) {
    rows[i] = {
      gene: String(gene.get(i)),
      contig: String(contig.get(i)),
      genome: String(genome.get(i)),
      qstart: Number(qstart.get(i)),
      qend: Number(qend.get(i)),
      qlen: Number(qlen.get(i)),
      pident: Number(pident.get(i)),
      coverage: Number(coverage.get(i)),
      bin: String(bin.get(i)),
    };
  }
  return rows;
}

// ── Data shaping ────────────────────────────────────────────────────────────

export function angleFor(cumPos: number, totalLength: number): number {
  if (totalLength <= 0) return 0;
  return (cumPos / totalLength) * TWO_PI;
}

export function buildRenderData(
  rows: AlignmentRow[],
  meta: GenomeOrganizationMeta,
  params: Record<string, unknown>,
): RenderData {
  const paramRef = typeof params.referenceGenome === 'string' ? params.referenceGenome : '';
  const reference = paramRef !== '' ? paramRef : (meta.genomes[0] ?? '');

  const refRows = rows.filter((r) => r.genome === reference);

  // Contigs: unique reference contig -> length, longest first, laid end to end.
  const lenByContig = new Map<string, number>();
  for (const r of refRows) {
    if (!lenByContig.has(r.contig)) lenByContig.set(r.contig, r.qlen);
  }
  const contigs: Contig[] = [];
  const contigByName = new Map<string, Contig>();
  let cumStart = 0;
  for (const [contig, len] of [...lenByContig.entries()].sort((a, b) => b[1] - a[1])) {
    const c: Contig = { contig, len, cumStart };
    contigs.push(c);
    contigByName.set(contig, c);
    cumStart += len;
  }
  const totalLength = cumStart;

  // Reference genes: keep the highest-coverage hit per gene; map to angles.
  const referenceGenes = new Map<string, ReferenceGene>();
  for (const r of refRows) {
    const contig = contigByName.get(r.contig);
    if (!contig) continue;
    const existing = referenceGenes.get(r.gene);
    if (existing && existing.coverage >= r.coverage) continue;
    const startAngle = angleFor(contig.cumStart + r.qstart, totalLength);
    const endAngle = angleFor(contig.cumStart + r.qend, totalLength);
    const midAngle =
      endAngle >= startAngle
        ? (startAngle + endAngle) / 2
        : ((startAngle + endAngle + TWO_PI) / 2) % TWO_PI;
    referenceGenes.set(r.gene, {
      gene: r.gene,
      contig: r.contig,
      qstart: r.qstart,
      qend: r.qend,
      bin: r.bin,
      pident: r.pident,
      coverage: r.coverage,
      startAngle,
      endAngle,
      midAngle,
    });
  }

  // Per-genome presence: highest-coverage hit per gene per non-reference genome.
  const genomeGenes = new Map<string, Map<string, GenomeHit>>();
  for (const r of rows) {
    if (r.genome === reference) continue;
    let m = genomeGenes.get(r.genome);
    if (!m) {
      m = new Map<string, GenomeHit>();
      genomeGenes.set(r.genome, m);
    }
    const existing = m.get(r.gene);
    if (!existing || r.coverage > existing.coverage) {
      m.set(r.gene, { pident: r.pident, coverage: r.coverage, bin: r.bin });
    }
  }

  const visibleGenomes = meta.genomes.filter((g) => g !== reference).sort();
  const genomeIndex = new Map(visibleGenomes.map((g, i) => [g, i]));
  const binIndex = new Map(meta.bins.map((b, i) => [b, i]));

  const colorByRaw = typeof params.colorBy === 'string' ? params.colorBy : '';
  const colorBy: ColorBy =
    colorByRaw === 'bin' || colorByRaw === 'pident' || colorByRaw === 'coverage'
      ? colorByRaw
      : 'genome';

  let overlayByBin: Map<string, number> | undefined;
  let overlayAbsMax = 0;
  if (meta.overlayByBin) {
    overlayByBin = new Map(Object.entries(meta.overlayByBin));
    overlayAbsMax = robustAbsMax([...overlayByBin.values()]);
  }

  return {
    reference,
    contigs,
    totalLength,
    referenceGenes,
    genomeGenes,
    visibleGenomes,
    colorBy,
    binIndex,
    genomeIndex,
    overlayByBin,
    overlayChannel: meta.overlayChannel,
    overlayAbsMax,
  };
}

// ── Ring layout ─────────────────────────────────────────────────────────────

export interface BaseLayout {
  cx: number;
  cy: number;
  numGenomes: number;
  referenceRingInner: number;
  referenceRingOuter: number;
  outerTrackInner: number;
  outerTrackOuter: number;
  genomeRingStart: number;
  geneRingWidth: number;
  hasOuterTrack: boolean;
}

const REFERENCE_RING_WIDTH = 18;
const OUTER_TRACK_GAP = 4;
const OUTER_TRACK_WIDTH = 20;
const MAX_GENE_RING_WIDTH = 20;

// Base (unzoomed) full-circle layout — ported from genome-viz.js drawVisualization.
export function computeBaseLayout(
  canvasW: number,
  canvasH: number,
  numGenomes: number,
  opts: { scale?: number; hasOuterTrack?: boolean } = {},
): BaseLayout {
  const scale = opts.scale ?? 1;
  const hasOuterTrack = !!opts.hasOuterTrack;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const outerRadius = Math.min(cx, cy) * 0.92 * scale;
  const referenceRingOuter = outerRadius;
  const referenceRingInner = outerRadius - REFERENCE_RING_WIDTH;
  const outerTrackInner = hasOuterTrack ? referenceRingOuter + OUTER_TRACK_GAP : referenceRingOuter;
  const outerTrackOuter = hasOuterTrack ? outerTrackInner + OUTER_TRACK_WIDTH : referenceRingOuter;
  const n = Math.max(1, numGenomes);
  const geneRingWidth = Math.min((outerRadius - REFERENCE_RING_WIDTH - 20) / n, MAX_GENE_RING_WIDTH);
  return {
    cx,
    cy,
    numGenomes,
    referenceRingInner,
    referenceRingOuter,
    outerTrackInner,
    outerTrackOuter,
    genomeRingStart: referenceRingInner,
    geneRingWidth,
    hasOuterTrack,
  };
}

// Radial bounds of the i-th genome ring in the base layout (ring 0 outermost,
// filling inward), matching genome-viz.js genomeRingBounds.
export function baseGenomeRingBounds(layout: BaseLayout, i: number): { inner: number; outer: number } {
  const outer = layout.genomeRingStart - i * layout.geneRingWidth - 2;
  const inner = outer - layout.geneRingWidth + 2;
  return { inner, outer };
}

export interface WedgeLayout {
  cx: number;
  cy: number;
  numGenomes: number;
  outerRadius: number;
  blowInner: number;
  blowOuter: number;
  genW: number;
  outerTrackWidth: number;
  hasOuterTrack: boolean;
}

// Zoomed wedge layout — ported from webgl-renderer.js computeRingGeometry.
export function computeWedgeLayout(
  canvasW: number,
  canvasH: number,
  numGenomes: number,
  opts: { scale?: number; wedgeGap?: number; hasOuterTrack?: boolean } = {},
): WedgeLayout {
  const scale = opts.scale ?? 1;
  const wedgeGap = opts.wedgeGap ?? 6;
  const hasOuterTrack = !!opts.hasOuterTrack;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const R = Math.min(cx, cy);
  const outerRadius = R * 0.92 * scale;
  const blowInner = outerRadius + wedgeGap;
  const blowOuter = R * 0.97;
  const available = Math.max(0, blowOuter - blowInner);
  const outerTrackWidth = hasOuterTrack ? Math.min(12, available * 0.25) : 0;
  const genW = numGenomes > 0 ? (available - outerTrackWidth) / numGenomes : 0;
  return { cx, cy, numGenomes, outerRadius, blowInner, blowOuter, genW, outerTrackWidth, hasOuterTrack };
}

export function wedgeGenomeRingBounds(layout: WedgeLayout, i: number): { inner: number; outer: number } {
  const inner = layout.blowInner + i * layout.genW;
  const outer = inner + layout.genW - 1;
  return { inner, outer };
}

export function wedgeOuterTrackBounds(layout: WedgeLayout): { inner: number; outer: number } {
  const inner = layout.blowInner + layout.numGenomes * layout.genW;
  return { inner, outer: inner + layout.outerTrackWidth };
}

// ── Colors ──────────────────────────────────────────────────────────────────

// Tableau-10, as float RGB.
const ORDINAL_PALETTE: Rgba[] = [
  [0.31, 0.48, 0.65, 1], [1.0, 0.5, 0.05, 1], [0.17, 0.63, 0.17, 1],
  [0.84, 0.15, 0.16, 1], [0.58, 0.4, 0.74, 1], [0.55, 0.34, 0.29, 1],
  [0.89, 0.47, 0.76, 1], [0.5, 0.5, 0.5, 1], [0.74, 0.74, 0.13, 1],
  [0.09, 0.75, 0.81, 1],
];

export const REFERENCE_RING_COLOR: Rgba = [0.388, 0.4, 0.945, 1]; // indigo #6366f1

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function ordinalColor(index: number): Rgba {
  if (index < 0) return [0.5, 0.5, 0.5, 1];
  return ORDINAL_PALETTE[index % ORDINAL_PALETTE.length];
}

// Fade an arc's alpha so a selected bin's arcs stand out against the rest.
const DIMMED_ALPHA = 0.12;
function dimmed(color: Rgba): Rgba {
  return [color[0], color[1], color[2], color[3] * DIMMED_ALPHA];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Sequential ramp (light grey -> teal) for pident/coverage in [0,1].
export function sequentialColor(t: number): Rgba {
  const k = clamp(t, 0, 1);
  return [lerp(0.85, 0.05, k), lerp(0.87, 0.5, k), lerp(0.88, 0.6, k), 1];
}

const DIVERGING_LOW: Rgba = [0.19, 0.51, 0.74, 1]; // blue (negative)
const DIVERGING_MID: Rgba = [0.97, 0.97, 0.97, 1]; // white (zero)
const DIVERGING_HIGH: Rgba = [0.84, 0.19, 0.15, 1]; // red (positive)

// Saturation extent for the overlay: the 95th percentile of |stat| rather than
// the raw max, so a single outlier bin doesn't collapse every other bin onto the
// white midpoint. Uses numpy-style linear interpolation between order statistics.
export function robustAbsMax(values: number[], percentile = 0.95): number {
  const abs = values
    .map(Math.abs)
    .filter((a) => Number.isFinite(a))
    .sort((x, y) => x - y);
  if (abs.length === 0) return 0;
  if (abs.length === 1) return abs[0];
  const rank = percentile * (abs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi ? abs[lo] : abs[lo] + (rank - lo) * (abs[hi] - abs[lo]);
}

// Diverging blue-white-red centered at 0; `absMax` sets the saturation extent.
export function divergingColor(value: number, absMax: number): Rgba {
  if (!(absMax > 0) || !Number.isFinite(value)) return DIVERGING_MID;
  const t = clamp(value / absMax, -1, 1);
  if (t < 0) {
    const k = -t;
    return [
      lerp(DIVERGING_MID[0], DIVERGING_LOW[0], k),
      lerp(DIVERGING_MID[1], DIVERGING_LOW[1], k),
      lerp(DIVERGING_MID[2], DIVERGING_LOW[2], k),
      1,
    ];
  }
  return [
    lerp(DIVERGING_MID[0], DIVERGING_HIGH[0], t),
    lerp(DIVERGING_MID[1], DIVERGING_HIGH[1], t),
    lerp(DIVERGING_MID[2], DIVERGING_HIGH[2], t),
    1,
  ];
}

// Color of one genome-ring arc for gene `gene` in genome `genome`.
export function arcColorFor(rd: RenderData, gene: ReferenceGene, genome: string, hit: GenomeHit): Rgba {
  if (rd.overlayByBin && rd.overlayChannel === 'arcColor') {
    const v = rd.overlayByBin.get(gene.bin);
    return divergingColor(v ?? 0, rd.overlayAbsMax);
  }
  switch (rd.colorBy) {
    case 'bin':
      return ordinalColor(rd.binIndex.get(hit.bin) ?? -1);
    case 'pident':
      return sequentialColor(hit.pident / 100);
    case 'coverage':
      return sequentialColor(hit.coverage / 100);
    default:
      return ordinalColor(rd.genomeIndex.get(genome) ?? -1);
  }
}

// ── Instance buffer ─────────────────────────────────────────────────────────
//
// One arc instance = 8 floats [geoStart, geoEnd, rInner, rOuter, r,g,b,a],
// consumed by the ported WebGL2 arc shader. Reverse-strand genes (endAngle <=
// startAngle) are dropped, exactly as the legacy renderer did.

export const ARC_STRIDE = 8;

interface ArcSink {
  push(geoStart: number, geoEnd: number, rInner: number, rOuter: number, color: Rgba): void;
}

function ringBoundsFor(
  mode: 'base' | 'wedge',
  base: BaseLayout,
  wedge: WedgeLayout,
  i: number,
): { inner: number; outer: number } {
  return mode === 'base' ? baseGenomeRingBounds(base, i) : wedgeGenomeRingBounds(wedge, i);
}

// Builds the arc instances for one layer. Base mode also draws the reference
// contig ring; both modes draw genome rings and (when overlay=outerTrack) an
// outer heat ring keyed by each gene's bin stat. When `selectedBin` is set,
// arcs whose gene belongs to another bin are drawn dimmed so the selection reads.
export function buildArcInstances(
  rd: RenderData,
  base: BaseLayout,
  wedge: WedgeLayout,
  mode: 'base' | 'wedge',
  selectedBin?: string | null,
): Float32Array {
  const values: number[] = [];
  const sink: ArcSink = {
    push(geoStart, geoEnd, rInner, rOuter, color) {
      if (geoEnd <= geoStart) return;
      values.push(geoStart, geoEnd, rInner, rOuter, color[0], color[1], color[2], color[3]);
    },
  };

  // Reference contig ring (base layer only), one arc per contig with a small gap.
  if (mode === 'base') {
    const gap = (1.5 * Math.PI) / 180;
    for (const c of rd.contigs) {
      const start = angleFor(c.cumStart, rd.totalLength);
      const end = angleFor(c.cumStart + c.len, rd.totalLength) - gap;
      sink.push(start, end, base.referenceRingInner, base.referenceRingOuter, REFERENCE_RING_COLOR);
    }
  }

  // Genome rings.
  rd.visibleGenomes.forEach((genome, i) => {
    const geneMap = rd.genomeGenes.get(genome);
    if (!geneMap) return;
    const { inner, outer } = ringBoundsFor(mode, base, wedge, i);
    for (const gene of rd.referenceGenes.values()) {
      const hit = geneMap.get(gene.gene);
      if (!hit) continue;
      const color = arcColorFor(rd, gene, genome, hit);
      sink.push(
        gene.startAngle,
        gene.endAngle,
        inner,
        outer,
        selectedBin && gene.bin !== selectedBin ? dimmed(color) : color,
      );
    }
  });

  // Outer-track overlay: per-gene heat keyed by the gene's bin stat.
  if (rd.overlayByBin && rd.overlayChannel === 'outerTrack') {
    const bounds =
      mode === 'base'
        ? { inner: base.outerTrackInner, outer: base.outerTrackOuter }
        : wedgeOuterTrackBounds(wedge);
    if (bounds.outer > bounds.inner) {
      for (const gene of rd.referenceGenes.values()) {
        const v = rd.overlayByBin.get(gene.bin);
        if (v === undefined) continue;
        const color = divergingColor(v, rd.overlayAbsMax);
        sink.push(
          gene.startAngle,
          gene.endAngle,
          bounds.inner,
          bounds.outer,
          selectedBin && gene.bin !== selectedBin ? dimmed(color) : color,
        );
      }
    }
  }

  return new Float32Array(values);
}
