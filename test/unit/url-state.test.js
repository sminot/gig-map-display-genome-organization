import { test } from 'node:test';
import assert from 'node:assert/strict';

import { configFromUrl, urlFromConfig } from '../../src/url-state.js';
import { defaultConfig, validateConfig } from '../../src/config.js';

test('an empty query string yields a valid default config pointed at data/', () => {
  const config = configFromUrl('');
  assert.doesNotThrow(() => validateConfig(config));
  assert.equal(config.data.alignmentUrl, 'data/genomes.aln.csv.gz');
  assert.deepEqual(config.zoom, defaultConfig().zoom);
});

test('a config round-trips through the query string', () => {
  const config = configFromUrl(
    '?data=data/x.genomes.aln.csv.gz&ref=genome_b&visible=genome_a,genome_c'
    + '&wedge=45&gap=20&wedgeHeight=4.5&zoomLevel=6.50&focusAngle=90.00'
    + '&annotCategoryCol=bin&annotLabelCol=name&annotSelected=Bin+1,Bin+2'
    + '&annotCustomColors=%7B%22Bin+2%22%3A%22%23ff0000%22%7D'
    + '&genomeColorCol=source&genomeLabelCol=source&genomeSortCol=depth&genomeSortOrder=desc'
    + '&genomeTooltipCols=depth&genomePalette=Set2&theme=light&sidebar=0',
  );
  assert.doesNotThrow(() => validateConfig(config));

  const reparsed = configFromUrl(`?${urlFromConfig(config)}`);
  // hiddenGenomes is input-only; the writer emits the canonical `visible` form.
  assert.deepEqual({ ...reparsed, hiddenGenomes: null }, { ...config, hiddenGenomes: null });
});

test('legacy ?hidden= links still resolve', () => {
  const config = configFromUrl('?ref=genome_a&hidden=genome_b');
  assert.deepEqual(config.hiddenGenomes, ['genome_b']);
  assert.equal(config.visibleGenomes, null);
});

test('the query string omits values that are already the default', () => {
  const query = urlFromConfig(configFromUrl(''));
  assert.equal(query, '');
});

test('a malformed annotCustomColors value does not stop the config from loading', () => {
  const config = configFromUrl('?annotCustomColors=%7Bnot-json');
  assert.deepEqual(config.geneAnnotation.customColors, {});
});

test('non-hex custom colours are discarded', () => {
  const config = configFromUrl('?annotCustomColors=%7B%22a%22%3A%22red%22%2C%22b%22%3A%22%2300ff00%22%7D');
  assert.deepEqual(config.geneAnnotation.customColors, { b: '#00ff00' });
});

test('focusAngle is normalised into [0, 2pi) so it satisfies the schema', () => {
  const config = configFromUrl('?zoomLevel=4&focusAngle=-90');
  assert.ok(config.zoom.focusAngle >= 0 && config.zoom.focusAngle < 2 * Math.PI);
  assert.doesNotThrow(() => validateConfig(config));
});

test('zoomLevel of 1 or less leaves the wedge hidden', () => {
  assert.equal(configFromUrl('?zoomLevel=1').zoom.zoomLevel, 1);
  assert.equal(configFromUrl('?zoomLevel=0.5').zoom.zoomLevel, 1);
});
