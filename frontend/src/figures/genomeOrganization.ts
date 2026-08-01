import { defineParams, datasetSelect, genomeSelect, enumSelect, statColumn, number, binMultiSelect } from '../schema/fields';
import { GenomeOrganizationRenderer } from '../render/webgl/GenomeOrganizationRenderer';
import { buildRequestBody } from '../render/webgl/renderData';
import type { FigureModule } from './types';

// NOTE vs ARCHITECTURE.md §4.1: the contract's `overlay?:{contrastId,stat,channel}`
// nested object is flattened here into three optional top-level fields so the single
// SchemaForm (flat field list) can render it. The backend/WebGL agent nests these
// back into `overlay` (documented deviation).
const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  referenceGenome: genomeSelect('Reference genome', { dependsOn: 'pangenomeId', optional: true }),
  maxGenomes: number('Max genomes displayed', { default: 50, min: 1, step: 1 }),
  sliceWidth: number('Slice width (fraction of circle)', { default: 1 / 3, min: 0.05, max: 0.9, step: 0.05 }),
  sliceHeight: number('Slice height (fraction of radius)', { default: 0.3, min: 0.1, max: 0.8, step: 0.05 }),
  colorBy: enumSelect('Color by', ['bin', 'pident', 'coverage', 'genome'], { optional: true }),
  highlightBins: binMultiSelect('Highlight bins', { dependsOn: 'pangenomeId', optional: true }),
  overlayContrastId: datasetSelect('Overlay contrast', 'contrast', { optional: true }),
  overlayStat: statColumn('Overlay stat', { optional: true }),
  overlayChannel: enumSelect('Overlay channel', ['arcColor', 'outerTrack'], { optional: true }),
});

export const genomeOrganization: FigureModule = {
  id: 'genome_organization',
  title: 'Genome Organization',
  category: 'Genome',
  description: 'Circular genome map of gene alignments, colored by bin/identity with an optional association overlay.',
  family: 'webgl',
  params,
  Renderer: GenomeOrganizationRenderer,
  // Fold flat overlay* fields into the nested `overlay` the backend expects, and
  // drop referenceGenome from the wire body (the backend treats it as a hard row
  // filter that would leave only the reference genome — see renderData.ts). The
  // reference is applied client-side for the angular layout instead.
  toRequest: buildRequestBody,
};
