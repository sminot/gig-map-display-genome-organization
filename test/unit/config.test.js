import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createState } from '../../src/state.js';
import { setAlignmentRows, annotationRowsToMap } from '../../src/data.js';
import { setGeneAnnotationData } from '../../src/gene-annotation.js';
import { setGenomeAnnotationData } from '../../src/genome-annotation.js';
import {
  CONFIG_VERSION, defaultConfig, configFromState, applyConfigToState, validateConfig,
} from '../../src/config.js';
import { alignmentRows, geneAnnotationRows, genomeAnnotationRows } from './fixtures.js';

const SCHEMA_PATH = new URL('../../schema/genome-display-config.schema.json', import.meta.url);

function loadedState() {
  const state = createState();
  setAlignmentRows(state, alignmentRows(), 'data/genomes.aln.csv.gz');
  setGeneAnnotationData(state, annotationRowsToMap(geneAnnotationRows()), 'data/genes.annot.csv.gz');
  setGenomeAnnotationData(
    state,
    annotationRowsToMap(genomeAnnotationRows(), null, 'genome_id'),
    'data/genomes.annot.csv.gz',
  );
  return state;
}

test('the JSON Schema and defaultConfig() describe the same properties', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    Object.keys(defaultConfig()).sort(),
    'schema/genome-display-config.schema.json has drifted from defaultConfig()',
  );
});

test('the JSON Schema nested objects match the config they describe', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const template = defaultConfig();
  for (const key of ['data', 'geneAnnotation', 'genomeAnnotation', 'zoom']) {
    const schemaKeys = Object.keys(schema.properties[key].properties).sort();
    const configKeys = Object.keys(template[key]).sort();
    // `data` carries row arrays that configFromState never writes out.
    const expected = key === 'data'
      ? [...configKeys, 'geneAnnotationRows', 'genomeAnnotationRows', 'rows'].sort()
      : configKeys;
    assert.deepEqual(schemaKeys, expected, `schema.${key} has drifted`);
  }
});

test('a full config round-trips through state unchanged', () => {
  const config = {
    ...defaultConfig(),
    data: {
      alignmentUrl: 'data/genomes.aln.csv.gz',
      geneAnnotationUrl: 'data/genes.annot.csv.gz',
      genomeAnnotationUrl: 'data/genomes.annot.csv.gz',
    },
    referenceGenome: 'genome_b',
    visibleGenomes: ['genome_c'],
    genomeOrder: ['genome_c', 'genome_a'],
    geneAnnotation: {
      categoryColumn: 'bin',
      labelColumn: 'name',
      selectedCategories: ['Bin 1', 'Bin 2'],
      customColors: { 'Bin 2': '#ff0000' },
      displayMode: 'arrows',
    },
    genomeAnnotation: {
      colorColumn: 'source',
      groupColumn: null,
      labelColumn: 'source',
      tooltipColumns: ['depth'],
      sortColumn: 'depth',
      sortAscending: false,
      palette: 'Set2',
    },
    zoom: {
      focusAngle: 1.25, zoomLevel: 6.5, wedgeSpan: 0.42, wedgeGap: 21, wedgeHeightScale: 4.5,
    },
    theme: 'light',
  };

  const state = loadedState();
  applyConfigToState(state, config);
  assert.deepEqual(configFromState(state, { controls: true, controlsCollapsed: false }), config);
});

test('applying a config twice is idempotent', () => {
  const state = loadedState();
  const config = {
    referenceGenome: 'genome_c',
    geneAnnotation: { categoryColumn: 'bin', selectedCategories: ['Bin 3'] },
    zoom: { zoomLevel: 3 },
  };
  applyConfigToState(state, config);
  const first = configFromState(state);
  applyConfigToState(state, first);
  assert.deepEqual(configFromState(state), first);
});

test('applying zoom snaps the animation so a rehydrated view is not mid-transition', () => {
  const state = loadedState();
  applyConfigToState(state, { zoom: { zoomLevel: 9, focusAngle: 2 } });
  assert.equal(state.zoom.zoomLevel, 9);
  assert.equal(state.zoom.focusAngle, 2);
  assert.equal(state.zoom.zoomLevelTarget, 9);
});

test('hiddenGenomes resolves to the complement of the loaded genome list', () => {
  const state = loadedState();
  applyConfigToState(state, { referenceGenome: 'genome_a', hiddenGenomes: ['genome_b'] });
  assert.deepEqual([...state.visibleGenomes], ['genome_c']);
  // configFromState always writes the canonical form.
  assert.deepEqual(configFromState(state).visibleGenomes, ['genome_c']);
  assert.equal(configFromState(state).hiddenGenomes, null);
});

test('visibleGenomes wins over hiddenGenomes', () => {
  const state = loadedState();
  applyConfigToState(state, {
    referenceGenome: 'genome_a',
    visibleGenomes: ['genome_b'],
    hiddenGenomes: ['genome_b'],
  });
  assert.deepEqual([...state.visibleGenomes], ['genome_b']);
});

test('columns and genomes absent from the data are dropped, not applied blindly', () => {
  const state = loadedState();
  applyConfigToState(state, {
    referenceGenome: 'no_such_genome',
    geneAnnotation: { categoryColumn: 'no_such_column', selectedCategories: ['x'] },
    genomeAnnotation: { colorColumn: 'no_such_column', tooltipColumns: ['depth', 'nope'] },
  });
  assert.equal(state.referenceGenome, 'genome_a', 'falls back to the first genome');
  assert.equal(state.geneAnnot.categoryColumn, null);
  assert.equal(state.genomeAnnot.colorColumn, null);
  assert.deepEqual(state.genomeAnnot.tooltipColumns, ['depth']);
});

test('category colour assignment does not depend on the order rows arrived in', () => {
  const forward = createState();
  setAlignmentRows(forward, alignmentRows());
  setGeneAnnotationData(forward, annotationRowsToMap(geneAnnotationRows()));
  applyConfigToState(forward, { geneAnnotation: { categoryColumn: 'bin' } });

  const reversed = createState();
  setAlignmentRows(reversed, alignmentRows());
  setGeneAnnotationData(reversed, annotationRowsToMap(geneAnnotationRows().reverse()));
  applyConfigToState(reversed, { geneAnnotation: { categoryColumn: 'bin' } });

  assert.deepEqual(forward.geneAnnot.categoryValues, reversed.geneAnnot.categoryValues);
  for (const value of forward.geneAnnot.categoryValues) {
    assert.equal(forward.geneAnnot.scale(value), reversed.geneAnnot.scale(value));
  }
});

test('validateConfig rejects unknown properties', () => {
  assert.throws(() => validateConfig({ nope: 1 }), /unknown property "nope"/);
});

test('validateConfig rejects a config from a newer version', () => {
  assert.throws(
    () => validateConfig({ version: CONFIG_VERSION + 1 }),
    /understands up to/,
  );
});

test('validateConfig rejects out-of-range zoom and bad enums', () => {
  assert.throws(() => validateConfig({ zoom: { zoomLevel: 500 } }), /zoom\.zoomLevel/);
  assert.throws(() => validateConfig({ zoom: { wedgeSpan: 0 } }), /zoom\.wedgeSpan/);
  assert.throws(() => validateConfig({ theme: 'sepia' }), /theme/);
  assert.throws(() => validateConfig({ genomeAnnotation: { palette: 'Nope' } }), /palette/);
  assert.throws(
    () => validateConfig({ geneAnnotation: { customColors: { 'Bin 1': 'red' } } }),
    /#rrggbb/,
  );
});

test('validateConfig accepts the default config and a config with injected rows', () => {
  assert.doesNotThrow(() => validateConfig(defaultConfig()));
  assert.doesNotThrow(() => validateConfig({ data: { rows: alignmentRows() } }));
});
