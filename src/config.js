/**
 * GenomeDisplayConfig — the serializable description of a display.
 *
 * Everything in the display that affects the render is either in this config or
 * derived deterministically from it plus the data. `schema/genome-display-config.schema.json`
 * is the normative shape; `validateConfig` enforces it without pulling in a
 * schema-validator dependency, and a test asserts the two do not drift.
 *
 * The config *references* data, it does not embed it. `config.data` carries either
 * URLs (the standalone app fetches them) or rows handed over by the caller (the
 * library path — a caller whose backend already subset the alignment).
 *
 * Deliberately absent, because it is derived rather than chosen:
 *   - the d3 ordinal colour scales (rebuilt from palette + column + rows)
 *   - `zoom.displayRadiusScale` (a function of zoomLevel and wedgeHeightScale)
 *   - the canvas pixel size (the display is responsive; it follows its container)
 *
 * Deliberately absent, because it is transient input state:
 *   - `zoom.isHovering`, tooltip visibility, combobox open state, and the two
 *     sidebar filter boxes, none of which change the figure.
 */

import { ZOOM_LIMITS } from './zoom-state.js';
import { PALETTE_NAMES } from './palettes.js';
import { setGeneCategoryColumn, setGeneSelectedCategories } from './gene-annotation.js';
import { rebuildGenomeScales } from './genome-annotation.js';

export const CONFIG_VERSION = 1;

const THEMES = ['dark', 'light'];
const DISPLAY_MODES = ['bars', 'arrows'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    data: {
      alignmentUrl: null,
      geneAnnotationUrl: null,
      genomeAnnotationUrl: null,
    },
    referenceGenome: null,
    visibleGenomes: null,
    // Input-only alias: resolved against the loaded genome list when
    // `visibleGenomes` is absent. `configFromState` always writes `visibleGenomes`,
    // so a round-tripped config has exactly one canonical form.
    hiddenGenomes: null,
    genomeOrder: null,
    geneAnnotation: {
      categoryColumn: null,
      labelColumn: null,
      selectedCategories: [],
      customColors: {},
      displayMode: 'bars',
    },
    genomeAnnotation: {
      colorColumn: null,
      groupColumn: null,
      labelColumn: null,
      tooltipColumns: [],
      sortColumn: null,
      sortAscending: true,
      palette: 'Tableau10',
    },
    zoom: {
      focusAngle: 0,
      zoomLevel: 1,
      wedgeSpan: 1 / 3,
      wedgeGap: 6,
      wedgeHeightScale: 2,
    },
    theme: 'dark',
    controls: true,
    controlsCollapsed: false,
  };
}

/** The config that reproduces the display's current appearance. */
export function configFromState(state, { controls = true, controlsCollapsed = false } = {}) {
  const ga = state.geneAnnot;
  const gna = state.genomeAnnot;
  const zoom = state.zoom;

  const allVisible = state.allGenomes.filter((g) => g !== state.referenceGenome);
  const visibleUnchanged = allVisible.length === state.visibleGenomes.size
    && allVisible.every((g) => state.visibleGenomes.has(g));

  return {
    version: CONFIG_VERSION,
    data: {
      alignmentUrl: state.sourceUrl,
      geneAnnotationUrl: ga.sourceUrl,
      genomeAnnotationUrl: gna.sourceUrl,
    },
    referenceGenome: state.referenceGenome,
    visibleGenomes: visibleUnchanged ? null : [...state.visibleGenomes],
    hiddenGenomes: null,
    genomeOrder: state.customGenomeOrder ? [...state.customGenomeOrder] : null,
    geneAnnotation: {
      categoryColumn: ga.categoryColumn,
      labelColumn: ga.labelColumn,
      selectedCategories: [...ga.selectedCategories],
      customColors: Object.fromEntries(ga.customColors),
      displayMode: ga.displayMode,
    },
    genomeAnnotation: {
      colorColumn: gna.colorColumn,
      groupColumn: gna.groupColumn,
      labelColumn: gna.labelColumn,
      tooltipColumns: [...gna.tooltipColumns],
      sortColumn: gna.sortColumn,
      sortAscending: gna.sortAscending,
      palette: gna.palette,
    },
    zoom: {
      focusAngle: zoom.focusAngleTarget,
      zoomLevel: zoom.zoomLevelTarget,
      wedgeSpan: zoom.wedgeSpan,
      wedgeGap: zoom.wedgeGap,
      wedgeHeightScale: zoom.wedgeHeightScale,
    },
    theme: state.theme,
    controls,
    controlsCollapsed,
  };
}

/**
 * Apply the render-affecting parts of a config onto state.
 * The caller is responsible for having ingested the data first — this only
 * selects among genomes and columns that already exist.
 */
export function applyConfigToState(state, config) {
  const merged = { ...defaultConfig(), ...config };

  state.theme = THEMES.includes(merged.theme) ? merged.theme : 'dark';

  if (merged.referenceGenome && state.allGenomes.includes(merged.referenceGenome)) {
    state.referenceGenome = merged.referenceGenome;
  }

  const nonReference = state.allGenomes.filter((g) => g !== state.referenceGenome);
  if (Array.isArray(merged.visibleGenomes)) {
    state.visibleGenomes = new Set(merged.visibleGenomes.filter((g) => nonReference.includes(g)));
  } else if (Array.isArray(merged.hiddenGenomes)) {
    const hidden = new Set(merged.hiddenGenomes);
    state.visibleGenomes = new Set(nonReference.filter((g) => !hidden.has(g)));
  } else {
    state.visibleGenomes = new Set(nonReference);
  }

  state.customGenomeOrder = Array.isArray(merged.genomeOrder) && merged.genomeOrder.length > 0
    ? merged.genomeOrder.slice()
    : null;

  const geneConfig = { ...defaultConfig().geneAnnotation, ...(merged.geneAnnotation || {}) };
  const ga = state.geneAnnot;
  if (geneConfig.categoryColumn && ga.columns.includes(geneConfig.categoryColumn)) {
    setGeneCategoryColumn(state, geneConfig.categoryColumn);
    setGeneSelectedCategories(state, (geneConfig.selectedCategories || []).map(String));
  } else {
    setGeneCategoryColumn(state, null);
  }
  ga.labelColumn = ga.columns.includes(geneConfig.labelColumn) ? geneConfig.labelColumn : null;
  ga.displayMode = DISPLAY_MODES.includes(geneConfig.displayMode) ? geneConfig.displayMode : 'bars';
  ga.customColors = new Map(
    Object.entries(geneConfig.customColors || {}).filter(([, hex]) => HEX_COLOR.test(hex)),
  );

  const genomeConfig = { ...defaultConfig().genomeAnnotation, ...(merged.genomeAnnotation || {}) };
  const gna = state.genomeAnnot;
  const known = (col) => (col && gna.columns.includes(col) ? col : null);
  gna.colorColumn = known(genomeConfig.colorColumn);
  gna.groupColumn = known(genomeConfig.groupColumn);
  gna.labelColumn = known(genomeConfig.labelColumn);
  gna.sortColumn = known(genomeConfig.sortColumn);
  gna.sortAscending = genomeConfig.sortAscending !== false;
  gna.tooltipColumns = (genomeConfig.tooltipColumns || []).filter((c) => gna.columns.includes(c));
  gna.palette = PALETTE_NAMES.includes(genomeConfig.palette) ? genomeConfig.palette : 'Tableau10';
  rebuildGenomeScales(state);

  const zoomConfig = { ...defaultConfig().zoom, ...(merged.zoom || {}) };
  const zoom = state.zoom;
  zoom.setWedgeSpan(zoomConfig.wedgeSpan);
  zoom.setWedgeGap(zoomConfig.wedgeGap);
  zoom.setWedgeHeightScale(zoomConfig.wedgeHeightScale);
  zoom.setZoomLevel(zoomConfig.zoomLevel);
  zoom.setFocusAngle(zoomConfig.focusAngle);
  // Rehydration must reproduce the view, not animate toward it.
  zoom.snapToTargets();
}

// ── Validation ──────────────────────────────────────────────────────────────

function fail(path, message) {
  throw new Error(`GenomeDisplayConfig${path ? ` at ${path}` : ''}: ${message}`);
}

function checkNullableString(value, path) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    fail(path, 'expected a string or null');
  }
}

function checkStringArray(value, path) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    fail(path, 'expected an array of strings');
  }
}

function checkRange(value, path, [lo, hi]) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  if (value < lo || value > hi) fail(path, `expected a number in [${lo}, ${hi}], got ${value}`);
}

/**
 * Validate a config against the schema. Throws on the first problem.
 * Unknown properties are rejected, so a config written by a newer version is a
 * loud failure rather than a silently degraded render.
 */
export function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('', 'expected an object');
  }

  const template = defaultConfig();
  for (const key of Object.keys(config)) {
    if (!(key in template)) fail('', `unknown property "${key}"`);
  }

  if (config.version !== undefined) {
    if (!Number.isInteger(config.version)) fail('version', 'expected an integer');
    if (config.version > CONFIG_VERSION) {
      fail('version', `is ${config.version}, but this build understands up to ${CONFIG_VERSION}`);
    }
  }

  if (config.theme !== undefined && !THEMES.includes(config.theme)) {
    fail('theme', `expected one of ${THEMES.join(', ')}`);
  }
  for (const key of ['controls', 'controlsCollapsed']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') fail(key, 'expected a boolean');
  }

  checkNullableString(config.referenceGenome, 'referenceGenome');
  for (const key of ['visibleGenomes', 'hiddenGenomes']) {
    if (config[key] !== undefined && config[key] !== null) checkStringArray(config[key], key);
  }
  if (config.genomeOrder !== undefined && config.genomeOrder !== null) {
    checkStringArray(config.genomeOrder, 'genomeOrder');
  }

  const data = config.data;
  if (data !== undefined) {
    if (data === null || typeof data !== 'object') fail('data', 'expected an object');
    for (const key of ['alignmentUrl', 'geneAnnotationUrl', 'genomeAnnotationUrl']) {
      checkNullableString(data[key], `data.${key}`);
    }
    for (const key of ['rows', 'geneAnnotationRows', 'genomeAnnotationRows']) {
      if (data[key] !== undefined && data[key] !== null && !Array.isArray(data[key])) {
        fail(`data.${key}`, 'expected an array of row objects');
      }
    }
  }

  const gene = config.geneAnnotation;
  if (gene !== undefined) {
    if (gene === null || typeof gene !== 'object') fail('geneAnnotation', 'expected an object');
    checkNullableString(gene.categoryColumn, 'geneAnnotation.categoryColumn');
    checkNullableString(gene.labelColumn, 'geneAnnotation.labelColumn');
    checkStringArray(gene.selectedCategories, 'geneAnnotation.selectedCategories');
    if (gene.displayMode !== undefined && !DISPLAY_MODES.includes(gene.displayMode)) {
      fail('geneAnnotation.displayMode', `expected one of ${DISPLAY_MODES.join(', ')}`);
    }
    if (gene.customColors !== undefined && gene.customColors !== null) {
      if (typeof gene.customColors !== 'object') fail('geneAnnotation.customColors', 'expected an object');
      for (const [category, hex] of Object.entries(gene.customColors)) {
        if (!HEX_COLOR.test(hex)) {
          fail(`geneAnnotation.customColors["${category}"]`, `expected a #rrggbb colour, got ${hex}`);
        }
      }
    }
  }

  const genome = config.genomeAnnotation;
  if (genome !== undefined) {
    if (genome === null || typeof genome !== 'object') fail('genomeAnnotation', 'expected an object');
    for (const key of ['colorColumn', 'groupColumn', 'labelColumn', 'sortColumn']) {
      checkNullableString(genome[key], `genomeAnnotation.${key}`);
    }
    checkStringArray(genome.tooltipColumns, 'genomeAnnotation.tooltipColumns');
    if (genome.sortAscending !== undefined && typeof genome.sortAscending !== 'boolean') {
      fail('genomeAnnotation.sortAscending', 'expected a boolean');
    }
    if (genome.palette !== undefined && !PALETTE_NAMES.includes(genome.palette)) {
      fail('genomeAnnotation.palette', `expected one of ${PALETTE_NAMES.join(', ')}`);
    }
  }

  const zoom = config.zoom;
  if (zoom !== undefined) {
    if (zoom === null || typeof zoom !== 'object') fail('zoom', 'expected an object');
    checkRange(zoom.focusAngle, 'zoom.focusAngle', [0, 2 * Math.PI]);
    checkRange(zoom.zoomLevel, 'zoom.zoomLevel', ZOOM_LIMITS.zoomLevel);
    checkRange(zoom.wedgeSpan, 'zoom.wedgeSpan', ZOOM_LIMITS.wedgeSpan);
    checkRange(zoom.wedgeGap, 'zoom.wedgeGap', ZOOM_LIMITS.wedgeGap);
    checkRange(zoom.wedgeHeightScale, 'zoom.wedgeHeightScale', ZOOM_LIMITS.wedgeHeightScale);
  }

  return config;
}
