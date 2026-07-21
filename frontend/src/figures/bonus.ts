import { defineParams, datasetSelect, binSelect, text } from '../schema/fields';
import { RarefactionRenderer } from '../render/mosaic/RarefactionRenderer';
import { BinSizeHistogramRenderer } from '../render/mosaic/BinSizeHistogramRenderer';
import { BinStatsRenderer } from '../render/mosaic/BinStatsRenderer';
import { EnrichedTermsRenderer } from '../render/mosaic/EnrichedTermsRenderer';
import type { FigureModule } from './types';

// Bonus functions (ARCHITECTURE.md §4). Same registry pattern; each is exposed
// only because the backend implements it.

export const rarefaction: FigureModule = {
  id: 'rarefaction',
  title: 'Rarefaction Curve',
  category: 'Summary',
  description: 'Pangenome accumulation curve as genomes are added.',
  family: 'mosaic',
  params: defineParams({ pangenomeId: datasetSelect('Pangenome', 'pangenome') }),
  Renderer: RarefactionRenderer,
};

export const binSizeHistogram: FigureModule = {
  id: 'bin_size_histogram',
  title: 'Bin Size Histogram',
  category: 'Summary',
  description: 'Distribution of gene counts per bin.',
  family: 'mosaic',
  params: defineParams({ pangenomeId: datasetSelect('Pangenome', 'pangenome') }),
  Renderer: BinSizeHistogramRenderer,
};

export const enrichedTerms: FigureModule = {
  id: 'enriched_terms',
  title: 'Enriched Terms',
  category: 'Bins',
  description: "Fisher-test enrichment of product-name terms among a bin's genes.",
  family: 'mosaic',
  params: defineParams({
    pangenomeId: datasetSelect('Pangenome', 'pangenome'),
    bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
  }),
  Renderer: EnrichedTermsRenderer,
};

export const binStats: FigureModule = {
  id: 'bin_stats',
  title: 'Bin Stats',
  category: 'Bins',
  description: 'Association statistics (AUC / odds-ratio / logistic) for a bin against a contrast.',
  family: 'mosaic',
  params: defineParams({
    // pangenomeId sources the bin dropdown; the backend Params model ignores it.
    pangenomeId: datasetSelect('Pangenome', 'pangenome'),
    contrastId: datasetSelect('Contrast', 'contrast'),
    bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
    metadataCol: text('Metadata column', { default: 'disease' }),
    refGroup: text('Reference group', { default: '0' }),
    compGroup: text('Comparison group', { default: '1' }),
  }),
  Renderer: BinStatsRenderer,
};
