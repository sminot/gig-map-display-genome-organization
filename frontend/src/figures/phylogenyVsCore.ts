import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { Tanglegram } from '../render/svg/Tanglegram';
import type { FigureModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  phylogenyId: datasetSelect('Phylogenies', 'phylogenies'),
  bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
  coreBin: binSelect('Core bin', { dependsOn: 'pangenomeId', optional: true }),
});

export const phylogenyVsCore: FigureModule = {
  id: 'phylogeny_vs_core',
  title: 'Phylogeny vs Core',
  category: 'Phylogeny',
  description: 'Tanglegram comparing a bin tree to the core-genome tree, with concordance.',
  family: 'svg',
  params,
  Renderer: Tanglegram,
};
