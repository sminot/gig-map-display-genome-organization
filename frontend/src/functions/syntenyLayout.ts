import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { makePlaceholder } from './PlaceholderRenderer';
import type { FunctionModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  bin: binSelect('Bin', { dependsOn: 'pangenomeId' }),
});

export const syntenyLayout: FunctionModule = {
  id: 'synteny_layout',
  title: 'Synteny Layout',
  category: 'Synteny',
  description: 'Gene-arrow map of a bin from the pangenome gene coordinates.',
  family: 'svg',
  params,
  Renderer: makePlaceholder('svg'),
};
