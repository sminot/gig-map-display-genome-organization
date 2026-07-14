import {
  defineParams,
  datasetMultiSelect,
  statColumn,
  bool,
  number,
} from '../schema/fields';
import { CompareContrastsRenderer } from '../render/mosaic/CompareContrastsRenderer';
import type { FunctionModule } from './types';

const params = defineParams({
  baseContrastIds: datasetMultiSelect('Base contrasts', 'contrast'),
  comparatorContrastIds: datasetMultiSelect('Comparator contrasts', 'contrast'),
  stat: statColumn('Stat'),
  fdr: bool('Recompute pooled FDR', { default: true }),
  sigThresh: number('Significance threshold', { min: 0, max: 1, step: 0.01, default: 0.05 }),
  estimateThresh: number('Estimate threshold', { step: 0.01, default: 0 }),
});

export const compareContrasts: FunctionModule = {
  id: 'compare_contrasts',
  title: 'Compare Contrasts',
  category: 'Contrasts',
  description: 'Match base vs comparator association contrasts by organism and compare significance categories.',
  family: 'mosaic',
  params,
  Renderer: CompareContrastsRenderer,
};
