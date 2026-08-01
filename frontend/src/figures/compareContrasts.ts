import {
  defineParams,
  datasetMultiSelect,
  enumSelect,
  bool,
  number,
} from '../schema/fields';
import { CompareContrastsRenderer } from '../render/mosaic/CompareContrastsRenderer';
import type { FigureModule } from './types';

const params = defineParams({
  baseContrastIds: datasetMultiSelect('Base contrasts', 'contrast'),
  comparatorContrastIds: datasetMultiSelect('Comparator contrasts', 'contrast'),
  // p/q-value are plotted as the signed -log10 transform; Estimate is the raw effect size.
  value: enumSelect('Value', ['q-value', 'p-value', 'Estimate'], { default: 'q-value' }),
  fdr: bool('Recompute pooled FDR', { default: true }),
  sigThresh: number('Significance threshold', { min: 0, max: 1, step: 0.01, default: 0.05 }),
  estimateThresh: number('Estimate threshold', { step: 0.01, default: 0 }),
});

export const compareContrasts: FigureModule = {
  id: 'compare_contrasts',
  title: 'Compare Contrasts',
  category: 'Contrasts',
  description: 'Match base vs comparator association contrasts by organism and compare significance categories.',
  family: 'mosaic',
  params,
  Renderer: CompareContrastsRenderer,
};
