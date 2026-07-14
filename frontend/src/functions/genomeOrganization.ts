import { defineParams, datasetSelect, genomeSelect, enumSelect, statColumn } from '../schema/fields';
import { GenomeOrganizationRenderer } from '../render/webgl/GenomeOrganizationRenderer';
import { buildRequestBody } from '../render/webgl/renderData';
import type { FunctionModule } from './types';

// NOTE vs ARCHITECTURE.md §4.1: the contract's `overlay?:{contrastId,stat,channel}`
// nested object is flattened here into three optional top-level fields so the single
// SchemaForm (flat field list) can render it. The backend/WebGL agent nests these
// back into `overlay` (documented deviation).
const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  referenceGenome: genomeSelect('Reference genome', { dependsOn: 'pangenomeId', optional: true }),
  colorBy: enumSelect('Color by', ['bin', 'pident', 'coverage', 'genome'], { optional: true }),
  overlayContrastId: datasetSelect('Overlay contrast', 'contrast', { optional: true }),
  overlayStat: statColumn('Overlay stat', { optional: true }),
  overlayChannel: enumSelect('Overlay channel', ['arcColor', 'outerTrack'], { optional: true }),
});

export const genomeOrganization: FunctionModule = {
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
