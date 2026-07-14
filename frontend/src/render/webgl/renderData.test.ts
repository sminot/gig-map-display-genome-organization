import { describe, it, expect } from 'vitest';
import { tableFromArrays } from 'apache-arrow';
import type { GenomeOrganizationMeta } from '../../api/client';
import {
  ARC_STRIDE,
  angleFor,
  arrowToAlignmentRows,
  baseGenomeRingBounds,
  buildArcInstances,
  buildRenderData,
  buildRequestBody,
  computeBaseLayout,
  computeWedgeLayout,
  divergingColor,
  ordinalColor,
  sequentialColor,
  wedgeGenomeRingBounds,
  wedgeOuterTrackBounds,
  type AlignmentRow,
} from './renderData';

// Three genomes (gA reference, gB, gC), one contig each in the reference of
// length 1000, two forward genes and one reverse-strand gene.
const rows: AlignmentRow[] = [
  { gene: 'g1', contig: 'c1', genome: 'gA', qstart: 0, qend: 500, qlen: 1000, pident: 100, coverage: 100, bin: 'Bin 1' },
  { gene: 'g2', contig: 'c1', genome: 'gA', qstart: 500, qend: 1000, qlen: 1000, pident: 90, coverage: 80, bin: 'Bin 2' },
  { gene: 'gRev', contig: 'c1', genome: 'gA', qstart: 900, qend: 700, qlen: 1000, pident: 88, coverage: 70, bin: 'Bin 2' },
  { gene: 'g1', contig: 'x', genome: 'gB', qstart: 10, qend: 60, qlen: 500, pident: 95, coverage: 99, bin: 'Bin 1' },
  { gene: 'g2', contig: 'x', genome: 'gB', qstart: 70, qend: 120, qlen: 500, pident: 70, coverage: 60, bin: 'Bin 2' },
  { gene: 'g1', contig: 'y', genome: 'gC', qstart: 5, qend: 55, qlen: 400, pident: 85, coverage: 50, bin: 'Bin 1' },
];

const meta: GenomeOrganizationMeta = {
  genomes: ['gA', 'gB', 'gC'],
  contigs: [],
  bins: ['Bin 1', 'Bin 2', 'Bin 3'],
  colorBy: null,
};

describe('buildRequestBody', () => {
  it('drops referenceGenome from the wire body (backend would filter to one genome)', () => {
    const body = buildRequestBody({ pangenomeId: 'p1', referenceGenome: 'gA', colorBy: 'bin' });
    expect(body).toEqual({ pangenomeId: 'p1', colorBy: 'bin' });
    expect('referenceGenome' in body).toBe(false);
  });

  it('folds flat overlay* fields into a nested overlay object', () => {
    const body = buildRequestBody({
      pangenomeId: 'p1',
      overlayContrastId: 'ctr',
      overlayStat: 'Estimate',
      overlayChannel: 'outerTrack',
    });
    expect(body.overlay).toEqual({ contrastId: 'ctr', stat: 'Estimate', channel: 'outerTrack' });
  });

  it('omits overlay entirely when no contrast is chosen', () => {
    const body = buildRequestBody({ pangenomeId: 'p1', overlayStat: 'Estimate', overlayChannel: 'arcColor' });
    expect('overlay' in body).toBe(false);
  });
});

describe('angleFor', () => {
  it('maps position onto [0, 2π) proportionally', () => {
    expect(angleFor(0, 1000)).toBe(0);
    expect(angleFor(250, 1000)).toBeCloseTo(Math.PI / 2);
    expect(angleFor(500, 1000)).toBeCloseTo(Math.PI);
    expect(angleFor(10, 0)).toBe(0);
  });
});

describe('buildRenderData', () => {
  it('picks reference, lays out contigs, and maps reference-gene angles', () => {
    const rd = buildRenderData(rows, meta, { referenceGenome: 'gA' });
    expect(rd.reference).toBe('gA');
    expect(rd.totalLength).toBe(1000);
    expect(rd.contigs).toHaveLength(1);
    // g1 spans [0,500] -> [0, π]; g2 spans [500,1000] -> [π, 2π].
    expect(rd.referenceGenes.get('g1')!.startAngle).toBeCloseTo(0);
    expect(rd.referenceGenes.get('g1')!.endAngle).toBeCloseTo(Math.PI);
    expect(rd.referenceGenes.get('g2')!.endAngle).toBeCloseTo(2 * Math.PI);
    // Reverse-strand gene is kept in the map but has endAngle <= startAngle.
    const rev = rd.referenceGenes.get('gRev')!;
    expect(rev.endAngle).toBeLessThanOrEqual(rev.startAngle);
  });

  it('builds per-genome presence for non-reference genomes only', () => {
    const rd = buildRenderData(rows, meta, { referenceGenome: 'gA' });
    expect(rd.visibleGenomes).toEqual(['gB', 'gC']);
    expect(rd.genomeGenes.has('gA')).toBe(false);
    expect(rd.genomeGenes.get('gB')!.get('g1')!.pident).toBe(95);
    expect(rd.genomeGenes.get('gC')!.has('g2')).toBe(false);
  });

  it('defaults the reference to the first meta genome and colorBy to genome', () => {
    const rd = buildRenderData(rows, meta, {});
    expect(rd.reference).toBe('gA');
    expect(rd.colorBy).toBe('genome');
  });

  it('captures overlay-by-bin and the diverging absMax', () => {
    const rd = buildRenderData(rows, { ...meta, overlayByBin: { 'Bin 1': -3, 'Bin 2': 1.5 }, overlayChannel: 'arcColor' }, { referenceGenome: 'gA' });
    expect(rd.overlayChannel).toBe('arcColor');
    expect(rd.overlayAbsMax).toBe(3);
    expect(rd.overlayByBin!.get('Bin 1')).toBe(-3);
  });
});

describe('arrowToAlignmentRows', () => {
  it('reads the alignment columns out of an Arrow table', () => {
    const table = tableFromArrays({
      gene: ['g1', 'g2'],
      contig: ['c1', 'c1'],
      genome: ['gA', 'gA'],
      qstart: Int32Array.from([0, 500]),
      qend: Int32Array.from([500, 1000]),
      qlen: Int32Array.from([1000, 1000]),
      pident: Float64Array.from([100, 90]),
      coverage: Float64Array.from([100, 80]),
      bin: ['Bin 1', 'Bin 2'],
    });
    const parsed = arrowToAlignmentRows(table as never);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toMatchObject({ gene: 'g2', qstart: 500, qend: 1000, pident: 90, bin: 'Bin 2' });
  });
});

describe('ring layout', () => {
  it('nests base genome rings inward from the reference ring', () => {
    const layout = computeBaseLayout(800, 800, 4);
    expect(layout.referenceRingOuter).toBeGreaterThan(layout.referenceRingInner);
    const r0 = baseGenomeRingBounds(layout, 0);
    const r1 = baseGenomeRingBounds(layout, 1);
    expect(r0.outer).toBeLessThanOrEqual(layout.referenceRingInner);
    expect(r1.outer).toBeLessThan(r0.outer); // ring 1 sits inside ring 0
    expect(r0.outer).toBeGreaterThan(r0.inner);
  });

  it('expands the wedge outward and partitions it evenly across genomes', () => {
    const layout = computeWedgeLayout(800, 800, 4, { scale: 1 });
    expect(layout.blowInner).toBeGreaterThan(layout.outerRadius);
    expect(layout.blowOuter).toBeCloseTo(Math.min(400, 400) * 0.97);
    const w0 = wedgeGenomeRingBounds(layout, 0);
    const w3 = wedgeGenomeRingBounds(layout, 3);
    expect(w0.inner).toBeCloseTo(layout.blowInner);
    expect(w3.inner).toBeGreaterThan(w0.inner); // outer rings farther from center
    expect(layout.genW).toBeGreaterThan(0);
  });

  it('reserves an outer-track band only when overlay=outerTrack', () => {
    const plain = computeWedgeLayout(800, 800, 4, { hasOuterTrack: false });
    expect(plain.outerTrackWidth).toBe(0);
    const withTrack = computeWedgeLayout(800, 800, 4, { hasOuterTrack: true });
    expect(withTrack.outerTrackWidth).toBeGreaterThan(0);
    const band = wedgeOuterTrackBounds(withTrack);
    expect(band.outer).toBeGreaterThan(band.inner);
  });
});

describe('colors', () => {
  it('ordinalColor cycles through the palette and greys unknown indices', () => {
    expect(ordinalColor(0)).not.toEqual(ordinalColor(1));
    expect(ordinalColor(10)).toEqual(ordinalColor(0));
    expect(ordinalColor(-1)).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it('sequentialColor moves from light to saturated', () => {
    const lo = sequentialColor(0);
    const hi = sequentialColor(1);
    expect(lo[0]).toBeGreaterThan(hi[0]);
  });

  it('divergingColor is white at 0, blue for negative, red for positive', () => {
    expect(divergingColor(0, 3)).toEqual([0.97, 0.97, 0.97, 1]);
    const neg = divergingColor(-3, 3);
    const pos = divergingColor(3, 3);
    expect(neg[2]).toBeGreaterThan(neg[0]); // blue: more blue than red
    expect(pos[0]).toBeGreaterThan(pos[2]); // red: more red than blue
    expect(divergingColor(5, 0)).toEqual([0.97, 0.97, 0.97, 1]); // no data -> white
  });
});

describe('buildArcInstances', () => {
  const rd = buildRenderData(rows, meta, { referenceGenome: 'gA' });
  const base = computeBaseLayout(800, 800, rd.visibleGenomes.length);
  const wedge = computeWedgeLayout(800, 800, rd.visibleGenomes.length);

  it('emits reference-ring + genome-ring arcs and drops reverse-strand genes', () => {
    const buf = buildArcInstances(rd, base, wedge, 'base');
    expect(buf.length % ARC_STRIDE).toBe(0);
    const instances = buf.length / ARC_STRIDE;
    // 1 reference contig arc + gB{g1,g2} + gC{g1} = 4 arcs. gRev is reverse-strand.
    expect(instances).toBe(4);
    // No emitted arc has endAngle <= startAngle.
    for (let i = 0; i < instances; i++) {
      const geoStart = buf[i * ARC_STRIDE];
      const geoEnd = buf[i * ARC_STRIDE + 1];
      expect(geoEnd).toBeGreaterThan(geoStart);
    }
  });

  it('omits the reference ring in wedge mode', () => {
    const wedgeBuf = buildArcInstances(rd, base, wedge, 'wedge');
    // gB{g1,g2} + gC{g1} = 3 genome arcs, no reference contig arc.
    expect(wedgeBuf.length / ARC_STRIDE).toBe(3);
  });

  it('adds an outer-track arc per gene with a bin stat when overlay=outerTrack', () => {
    const rdOverlay = buildRenderData(
      rows,
      { ...meta, overlayByBin: { 'Bin 1': 2, 'Bin 2': -1 }, overlayChannel: 'outerTrack' },
      { referenceGenome: 'gA' },
    );
    const b = computeBaseLayout(800, 800, rdOverlay.visibleGenomes.length, { hasOuterTrack: true });
    const w = computeWedgeLayout(800, 800, rdOverlay.visibleGenomes.length, { hasOuterTrack: true });
    const buf = buildArcInstances(rdOverlay, b, w, 'base');
    // 4 base arcs as before + one outer-track arc for each forward reference gene
    // that has a bin stat (g1 -> Bin 1, g2 -> Bin 2) = 6.
    expect(buf.length / ARC_STRIDE).toBe(6);
  });
});
