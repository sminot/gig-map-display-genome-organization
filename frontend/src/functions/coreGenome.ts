import { defineParams, datasetSelect, number } from '../schema/fields';
import { makePlaceholder } from './PlaceholderRenderer';
import type { FunctionModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  propThreshold: number('Presence proportion threshold', {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.9,
  }),
});

export const coreGenome: FunctionModule = {
  id: 'core_genome',
  title: 'Core Genome',
  category: 'Core Genome',
  description: 'Rank bins by genome prevalence and identify the core-genome bin.',
  family: 'svg',
  params,
  Renderer: makePlaceholder('svg'),
};
