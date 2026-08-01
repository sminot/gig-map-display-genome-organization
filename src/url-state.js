/**
 * Query-param persistence for the standalone app.
 *
 * The param names are the ones earlier versions shipped, so existing shared links
 * and embed snippets keep resolving. This layer is the only place that knows about
 * them: it converts to and from GenomeDisplayConfig, and nothing else in the
 * library reads `location`.
 */

import { defaultConfig } from './config.js';

const DEFAULT_ALIGNMENT_URL = 'data/genomes.aln.csv.gz';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const RAD_PER_DEG = Math.PI / 180;

function numberParam(params, name) {
  const raw = params.get(name);
  if (raw === null) return null;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function listParam(params, name) {
  const raw = params.get(name);
  if (!raw) return null;
  const values = raw.split(',').filter(Boolean);
  return values.length > 0 ? values : null;
}

/** Build a config from a query string. Unset params fall back to the defaults. */
export function configFromUrl(search, { theme = 'dark' } = {}) {
  const params = new URLSearchParams(search);
  const config = defaultConfig();

  config.data.alignmentUrl = params.get('data') || DEFAULT_ALIGNMENT_URL;
  config.data.geneAnnotationUrl = params.get('geneAnnot') || null;
  config.data.genomeAnnotationUrl = params.get('genomeAnnot') || null;

  config.referenceGenome = params.get('ref') || null;
  // `visible` is what this version writes; `hidden` is what earlier versions wrote
  // and is still honoured so shared links and embed snippets keep resolving.
  config.visibleGenomes = listParam(params, 'visible');
  config.hiddenGenomes = listParam(params, 'hidden');

  const wedgePct = numberParam(params, 'wedge');
  if (wedgePct !== null) config.zoom.wedgeSpan = wedgePct / 100;
  const gap = numberParam(params, 'gap');
  if (gap !== null) config.zoom.wedgeGap = gap;
  const height = numberParam(params, 'wedgeHeight');
  if (height !== null) config.zoom.wedgeHeightScale = height;
  const zoomLevel = numberParam(params, 'zoomLevel');
  if (zoomLevel !== null && zoomLevel > 1) {
    config.zoom.zoomLevel = zoomLevel;
    const focusDeg = numberParam(params, 'focusAngle');
    if (focusDeg !== null) {
      const radians = focusDeg * RAD_PER_DEG;
      config.zoom.focusAngle = ((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    }
  }

  config.geneAnnotation.categoryColumn = params.get('annotCategoryCol') || null;
  config.geneAnnotation.labelColumn = params.get('annotLabelCol') || null;
  config.geneAnnotation.selectedCategories = listParam(params, 'annotSelected') || [];
  const customColors = params.get('annotCustomColors');
  if (customColors) {
    try {
      const parsed = JSON.parse(customColors);
      if (parsed && typeof parsed === 'object') {
        config.geneAnnotation.customColors = Object.fromEntries(
          Object.entries(parsed).filter(([, hex]) => typeof hex === 'string' && HEX_COLOR.test(hex)),
        );
      }
    } catch {
      // A hand-edited or truncated link should not stop the app from loading.
    }
  }

  config.genomeAnnotation.colorColumn = params.get('genomeColorCol') || null;
  config.genomeAnnotation.groupColumn = params.get('genomeGroupCol') || null;
  config.genomeAnnotation.labelColumn = params.get('genomeLabelCol') || null;
  config.genomeAnnotation.sortColumn = params.get('genomeSortCol') || null;
  config.genomeAnnotation.sortAscending = params.get('genomeSortOrder') !== 'desc';
  config.genomeAnnotation.tooltipColumns = listParam(params, 'genomeTooltipCols') || [];
  if (params.get('genomePalette')) config.genomeAnnotation.palette = params.get('genomePalette');

  config.theme = params.get('theme') === 'light' || (!params.get('theme') && theme === 'light')
    ? 'light'
    : 'dark';
  config.controlsCollapsed = params.get('sidebar') === '0';

  return config;
}

/** The query string that reproduces `config`, omitting anything at its default. */
export function urlFromConfig(config) {
  const params = new URLSearchParams();
  const defaults = defaultConfig();

  if (config.data.alignmentUrl && config.data.alignmentUrl !== DEFAULT_ALIGNMENT_URL) {
    params.set('data', config.data.alignmentUrl);
  }
  if (config.data.geneAnnotationUrl) params.set('geneAnnot', config.data.geneAnnotationUrl);
  if (config.data.genomeAnnotationUrl) params.set('genomeAnnot', config.data.genomeAnnotationUrl);

  if (config.referenceGenome) params.set('ref', config.referenceGenome);
  if (Array.isArray(config.visibleGenomes)) params.set('visible', config.visibleGenomes.join(','));

  const zoom = config.zoom;
  if (zoom.wedgeSpan !== defaults.zoom.wedgeSpan) {
    params.set('wedge', String(Math.round(zoom.wedgeSpan * 100)));
  }
  if (zoom.wedgeGap !== defaults.zoom.wedgeGap) params.set('gap', String(zoom.wedgeGap));
  if (zoom.wedgeHeightScale !== defaults.zoom.wedgeHeightScale) {
    params.set('wedgeHeight', String(zoom.wedgeHeightScale));
  }
  if (zoom.zoomLevel > 1.05) {
    params.set('zoomLevel', zoom.zoomLevel.toFixed(2));
    params.set('focusAngle', (zoom.focusAngle / RAD_PER_DEG).toFixed(2));
  }

  const gene = config.geneAnnotation;
  if (gene.categoryColumn) params.set('annotCategoryCol', gene.categoryColumn);
  if (gene.labelColumn) params.set('annotLabelCol', gene.labelColumn);
  if (gene.selectedCategories.length > 0) {
    params.set('annotSelected', gene.selectedCategories.join(','));
  }
  if (Object.keys(gene.customColors).length > 0) {
    params.set('annotCustomColors', JSON.stringify(gene.customColors));
  }

  const genome = config.genomeAnnotation;
  if (genome.colorColumn) params.set('genomeColorCol', genome.colorColumn);
  if (genome.groupColumn) params.set('genomeGroupCol', genome.groupColumn);
  if (genome.labelColumn) params.set('genomeLabelCol', genome.labelColumn);
  if (genome.sortColumn) params.set('genomeSortCol', genome.sortColumn);
  if (!genome.sortAscending) params.set('genomeSortOrder', 'desc');
  if (genome.tooltipColumns.length > 0) params.set('genomeTooltipCols', genome.tooltipColumns.join(','));
  if (genome.palette !== defaults.genomeAnnotation.palette) params.set('genomePalette', genome.palette);

  if (config.theme === 'light') params.set('theme', 'light');
  if (config.controlsCollapsed) params.set('sidebar', '0');

  return params.toString();
}
