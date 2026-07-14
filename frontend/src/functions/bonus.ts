import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { makePlaceholder } from './PlaceholderRenderer';
import type { FunctionModule } from './types';

// Bonus functions (ARCHITECTURE.md §4). Same registry pattern; exposed if the
// backend implements them. Placeholder renderers until Wave-2.

export const rarefaction: FunctionModule = {
  id: 'rarefaction',
  title: 'Rarefaction Curve',
  category: 'Summary',
  description: 'Pangenome accumulation curve as genomes are added.',
  family: 'mosaic',
  params: defineParams({ pangenomeId: datasetSelect('Pangenome', 'pangenome') }),
  Renderer: makePlaceholder('mosaic'),
};

export const binSizeHistogram: FunctionModule = {
  id: 'bin_size_histogram',
  title: 'Bin Size Histogram',
  category: 'Summary',
  description: 'Distribution of gene counts per bin.',
  family: 'mosaic',
  params: defineParams({ pangenomeId: datasetSelect('Pangenome', 'pangenome') }),
  Renderer: makePlaceholder('mosaic'),
};

export const enrichedTerms: FunctionModule = {
  id: 'enriched_terms',
  title: 'Enriched Terms',
  category: 'Bins',
  description: "Fisher-test functional term enrichment for a bin's genes.",
  family: 'mosaic',
  params: defineParams({
    pangenomeId: datasetSelect('Pangenome', 'pangenome'),
    bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
  }),
  Renderer: makePlaceholder('mosaic'),
};

export const binStats: FunctionModule = {
  id: 'bin_stats',
  title: 'Bin Stats',
  category: 'Bins',
  description: 'Association statistics (AUC / odds-ratio / logistic) for a bin against a contrast.',
  family: 'mosaic',
  params: defineParams({
    pangenomeId: datasetSelect('Pangenome', 'pangenome'),
    contrastId: datasetSelect('Contrast', 'contrast'),
    bin: binSelect('Bin', { dependsOn: 'pangenomeId', optional: true }),
  }),
  Renderer: makePlaceholder('mosaic'),
};
