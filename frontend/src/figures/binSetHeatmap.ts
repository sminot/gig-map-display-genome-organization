import { defineParams, datasetSelect, binMultiSelect } from '../schema/fields';
import { BinSetHeatmapRenderer } from '../render/mosaic/BinSetHeatmapRenderer';
import type { FigureModule } from './types';

const params = defineParams({
  pangenomeId: datasetSelect('Pangenome', 'pangenome'),
  bins: binMultiSelect('Bins', { dependsOn: 'pangenomeId' }),
});

export const binSetHeatmap: FigureModule = {
  id: 'bin_set_heatmap',
  title: 'Bin Set Heatmap',
  category: 'Bins',
  description: 'Presence heatmap of a set of bins across genomes, hierarchically clustered.',
  family: 'mosaic',
  params,
  Renderer: BinSetHeatmapRenderer,
};
