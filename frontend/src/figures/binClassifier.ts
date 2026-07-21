import { defineParams, datasetSelect, text, number } from '../schema/fields';
import { BinClassifierRenderer } from '../render/mosaic/BinClassifierRenderer';
import type { FigureModule } from './types';

const params = defineParams({
  contrastId: datasetSelect('Contrast', 'contrast'),
  labelColumn: text('Label column', { default: 'disease' }),
  maxDepth: number('Max depth', { min: 1, max: 10, step: 1, default: 4 }),
  learningRate: number('Learning rate', { min: 0.001, max: 1, step: 0.01, default: 0.05 }),
  nEstimators: number('N estimators', { min: 50, max: 1000, step: 50, default: 300 }),
  cvFolds: number('CV folds', { min: 2, max: 10, step: 1, default: 5 }),
  topFeatures: number('Top features', { min: 5, max: 50, step: 5, default: 20 }),
});

export const binClassifier: FigureModule = {
  id: 'bin_classifier',
  title: 'Bin Classifier',
  category: 'Contrasts',
  description: "XGBoost classifier predicting a binary label from a contrast's bin abundances.",
  family: 'mosaic',
  params,
  Renderer: BinClassifierRenderer,
};
