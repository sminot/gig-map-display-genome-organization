import { defineParams, datasetSelect, number } from '../schema/fields';
import { VolcanoRenderer } from '../render/mosaic/VolcanoRenderer';
import type { FigureModule } from './types';

export const volcano: FigureModule = {
  id: 'volcano',
  title: 'Volcano',
  category: 'Contrasts',
  description: 'Per-bin association effect size vs. significance for a single contrast.',
  family: 'mosaic',
  params: defineParams({
    contrastId: datasetSelect('Contrast', 'contrast'),
    sigThresh: number('Significance (q) threshold', { min: 0, max: 1, step: 0.01, default: 0.05 }),
    estimateThresh: number('Effect-size threshold', { min: 0, step: 0.01, default: 0.25 }),
  }),
  Renderer: VolcanoRenderer,
};
