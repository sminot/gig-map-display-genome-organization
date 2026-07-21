import { defineParams, datasetSelect, number } from '../schema/fields';
import { CoreGenome } from '../render/svg/CoreGenome';
import type { FigureModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  propThreshold: number('Presence proportion threshold', {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.9,
  }),
});

export const coreGenome: FigureModule = {
  id: 'core_genome',
  title: 'Core Genome',
  category: 'Core Genome',
  description: 'Rank bins by genome prevalence and identify the core-genome bin.',
  family: 'svg',
  params,
  Renderer: CoreGenome,
};
