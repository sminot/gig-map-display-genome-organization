import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { SyntenyLayout } from '../render/svg/SyntenyLayout';
import type { FigureModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
});

export const syntenyLayout: FigureModule = {
  id: 'synteny_layout',
  title: 'Synteny Layout',
  category: 'Synteny',
  description: 'Gene-arrow map of a bin from the pangenome gene coordinates.',
  family: 'svg',
  params,
  Renderer: SyntenyLayout,
};
