import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { BinToGenomesRenderer } from '../render/mosaic/BinToGenomesRenderer';
import type { FunctionModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
});

export const binToGenomes: FunctionModule = {
  id: 'bin_to_genomes',
  title: 'Bin to Genomes',
  category: 'Bins',
  description: 'Detection of a bin across genomes: per-genome gene counts and presence/absence.',
  family: 'mosaic',
  params,
  Renderer: BinToGenomesRenderer,
};
