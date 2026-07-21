import { defineParams, datasetSelect, binSelect } from '../schema/fields';
import { PhylogenyViewerRenderer } from '../render/tree/PhylogenyViewerRenderer';
import type { FigureModule } from './types';

const params = defineParams({
  phylogenyId: datasetSelect('Phylogenies', 'phylogenies'),
  bin: binSelect('Bin', { dependsOn: 'phylogenyId' }),
});

export const phylogenyViewer: FigureModule = {
  id: 'phylogeny_viewer',
  title: 'Phylogeny Viewer',
  category: 'Phylogeny',
  description: "Interactive view of a single bin's phylogenetic tree.",
  family: 'svg',
  params,
  Renderer: PhylogenyViewerRenderer,
};
