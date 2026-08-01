/**
 * buildRenderData — turns state into the geometry both renderers consume.
 *
 * RenderData shape:
 *   contigs         Array<{ id, length, cumStart }>   reference contigs, longest first
 *   totalLength     number                            sum of contig lengths (angle basis)
 *   referenceGenes  Map<geneId, { contigId, qstart, qend,
 *                                 startAngle, endAngle, midAngle, pident, coverage }>
 *   genomeGenes     Map<genomeId, Map<geneId, { pident, coverage }>>
 *   visibleGenomes  string[]                          ring order, outermost first
 *   colorScale      (genomeId) => css colour          default scale
 *   annotActive     boolean                           a gene category column is set
 *   annotDisplayMode 'bars' | 'arrows'
 *   geneAnnotColors Map<geneId, css colour>           highlighted genes only
 *   genomeColors    Map<genomeId, css colour>         annotation colour or default
 *
 * Annotation colours are resolved here so neither renderer has to know the
 * annotation modules exist.
 */

import { scaleOrdinal } from 'd3';
import { genomeColorScheme } from './palettes.js';
import { getGeneAnnotationColor } from './gene-annotation.js';
import { getGenomeAnnotationColor, getGenomeSortedOrder } from './genome-annotation.js';

const TWO_PI = 2 * Math.PI;

export function buildRenderData(state) {
  const refRows = state.rows.filter((r) => r.genome === state.referenceGenome);

  // Contigs, longest first, with cumulative base offsets.
  const contigLengths = new Map();
  for (const row of refRows) {
    if (!contigLengths.has(row.qseqid)) contigLengths.set(row.qseqid, row.qlen);
  }

  let cumStart = 0;
  const contigMap = new Map();
  const contigs = [];
  for (const [id, length] of [...contigLengths.entries()].sort((a, b) => b[1] - a[1])) {
    const contig = { id, length, cumStart };
    contigMap.set(id, contig);
    contigs.push(contig);
    cumStart += length;
  }
  const totalLength = cumStart;

  // Reference genes, keeping the highest-coverage hit per gene.
  const referenceGenes = new Map();
  for (const row of refRows) {
    const contig = contigMap.get(row.qseqid);
    if (!contig) continue;

    const existing = referenceGenes.get(row.sseqid);
    if (existing && existing.coverage >= row.coverage) continue;

    const startAngle = ((contig.cumStart + row.qstart) / totalLength) * TWO_PI;
    const endAngle = ((contig.cumStart + row.qend) / totalLength) * TWO_PI;
    // Averaging is only wrong when the arc crosses the 0/2π seam.
    const midAngle = endAngle >= startAngle
      ? (startAngle + endAngle) / 2
      : ((startAngle + endAngle + TWO_PI) / 2) % TWO_PI;

    referenceGenes.set(row.sseqid, {
      contigId: row.qseqid,
      qstart: row.qstart,
      qend: row.qend,
      startAngle,
      endAngle,
      midAngle,
      pident: row.pident,
      coverage: row.coverage,
    });
  }

  // Per-genome gene presence, again keeping the highest-coverage hit.
  const genomeGenes = new Map();
  for (const row of state.rows) {
    if (row.genome === state.referenceGenome) continue;

    let geneMap = genomeGenes.get(row.genome);
    if (!geneMap) { geneMap = new Map(); genomeGenes.set(row.genome, geneMap); }

    const existing = geneMap.get(row.sseqid);
    if (!existing || row.coverage > existing.coverage) {
      geneMap.set(row.sseqid, { pident: row.pident, coverage: row.coverage });
    }
  }

  const colorScale = scaleOrdinal(genomeColorScheme(state.theme)).domain(state.allGenomes);
  const visibleGenomes = getGenomeSortedOrder(state, [...state.visibleGenomes]);

  const annotActive = !!state.geneAnnot.categoryColumn;
  const geneAnnotColors = new Map();
  if (annotActive && state.geneAnnot.selectedCategories.size > 0) {
    for (const geneId of referenceGenes.keys()) {
      const color = getGeneAnnotationColor(state, geneId);
      if (color) geneAnnotColors.set(geneId, color);
    }
  }

  const genomeColors = new Map();
  for (const genome of state.allGenomes) {
    genomeColors.set(genome, getGenomeAnnotationColor(state, genome) || colorScale(genome));
  }

  return {
    contigs,
    totalLength,
    referenceGenes,
    genomeGenes,
    visibleGenomes,
    colorScale,
    annotActive,
    annotDisplayMode: state.geneAnnot.displayMode,
    geneAnnotColors,
    genomeColors,
  };
}

export function setReferenceGenome(state, genomeId) {
  if (genomeId === state.referenceGenome) return;
  if (state.referenceGenome !== null) state.visibleGenomes.add(state.referenceGenome);
  state.visibleGenomes.delete(genomeId);
  state.referenceGenome = genomeId;
}

export function setGenomeVisible(state, genomeId, visible) {
  if (visible) state.visibleGenomes.add(genomeId);
  else state.visibleGenomes.delete(genomeId);
}

/**
 * Order genomes so neighbours share gene content, by a greedy nearest-neighbour
 * walk over Jaccard similarity of gene-presence bitsets.
 */
export function computeGeneSimilarityOrder(state) {
  const geneIndex = new Map();
  const genomeGeneSets = new Map();
  let geneCount = 0;

  for (const row of state.rows) {
    const genome = row.genome;
    if (!genome || genome === state.referenceGenome) continue;
    const gene = row.sseqid;
    if (!gene) continue;

    let idx = geneIndex.get(gene);
    if (idx === undefined) { idx = geneCount++; geneIndex.set(gene, idx); }

    let set = genomeGeneSets.get(genome);
    if (!set) { set = new Set(); genomeGeneSets.set(genome, set); }
    set.add(idx);
  }

  const genomes = [...genomeGeneSets.keys()];
  const n = genomes.length;
  if (n <= 1) return genomes;

  const words = Math.ceil(geneCount / 32) || 1;
  const vectors = genomes.map((genome) => {
    const v = new Int32Array(words);
    genomeGeneSets.get(genome).forEach((g) => { v[g >> 5] |= (1 << (g & 31)); });
    return v;
  });

  const popcount = (x) => {
    x = x >>> 0;
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return (x * 0x01010101) >>> 24;
  };

  const sizes = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let w = 0; w < words; w++) s += popcount(vectors[i][w]);
    sizes[i] = s;
  }

  const intersectSize = (a, b) => {
    let s = 0;
    for (let w = 0; w < words; w++) s += popcount(a[w] & b[w]);
    return s;
  };

  // Start from the genome with the median gene count.
  const median = [...sizes].sort((a, b) => a - b)[Math.floor(n / 2)];
  let startIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(sizes[i] - median);
    if (diff < minDiff) { minDiff = diff; startIdx = i; }
  }

  const visited = new Uint8Array(n);
  const order = [startIdx];
  visited[startIdx] = 1;

  for (let step = 1; step < n; step++) {
    const prev = order[step - 1];
    let bestNext = -1;
    let bestSim = -1;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const inter = intersectSize(vectors[prev], vectors[j]);
      const union = sizes[prev] + sizes[j] - inter;
      const sim = union > 0 ? inter / union : 0;
      if (sim > bestSim) { bestSim = sim; bestNext = j; }
    }
    order.push(bestNext);
    visited[bestNext] = 1;
  }

  return order.map((i) => genomes[i]);
}
