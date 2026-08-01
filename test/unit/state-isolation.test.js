/**
 * Instance isolation at the state layer.
 *
 * Before the de-globalization, `AppState`, `GeneAnnotationState` and
 * `GenomeAnnotationState` were script-scope singletons that every module read and
 * wrote through `window`. Two displays on one page shared them and corrupted each
 * other. These tests pin the property that made that impossible: nothing in this
 * library holds mutable state at module scope.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../../src/state.js';
import { setAlignmentRows, annotationRowsToMap } from '../../src/data.js';
import { setGeneAnnotationData, setGeneCategoryColumn, setGeneSelectedCategories } from '../../src/gene-annotation.js';
import { setGenomeAnnotationData, setGenomePalette, getGenomeSortedOrder } from '../../src/genome-annotation.js';
import { buildRenderData, setReferenceGenome, setGenomeVisible } from '../../src/render-data.js';
import { alignmentRows, geneAnnotationRows, genomeAnnotationRows } from './fixtures.js';

function loaded() {
  const state = createState();
  setAlignmentRows(state, alignmentRows());
  setGeneAnnotationData(state, annotationRowsToMap(geneAnnotationRows()));
  setGenomeAnnotationData(state, annotationRowsToMap(genomeAnnotationRows(), null, 'genome_id'));
  return state;
}

test('two states share no object identity', () => {
  const a = createState();
  const b = createState();

  assert.notEqual(a, b);
  for (const key of ['rows', 'allGenomes', 'visibleGenomes', 'geneAnnot', 'genomeAnnot', 'zoom']) {
    assert.notEqual(a[key], b[key], `state.${key} is shared between instances`);
  }
  for (const key of ['rawData', 'columns', 'selectedCategories', 'categoryCounts', 'customColors']) {
    assert.notEqual(a.geneAnnot[key], b.geneAnnot[key], `geneAnnot.${key} is shared`);
  }
  for (const key of ['rawData', 'columns', 'tooltipColumns', 'domain', 'groupDomain']) {
    assert.notEqual(a.genomeAnnot[key], b.genomeAnnot[key], `genomeAnnot.${key} is shared`);
  }
});

test('mutating one instance leaves the other untouched', () => {
  const a = loaded();
  const b = loaded();

  setReferenceGenome(a, 'genome_c');
  setGenomeVisible(a, 'genome_a', false);
  setGeneCategoryColumn(a, 'bin');
  setGeneSelectedCategories(a, ['Bin 1']);
  setGenomePalette(a, 'Set1');
  a.zoom.setZoomLevel(12);
  a.zoom.setFocusAngle(3);
  a.theme = 'light';
  a.customGenomeOrder = ['genome_c', 'genome_a'];

  assert.equal(b.referenceGenome, 'genome_a');
  assert.deepEqual([...b.visibleGenomes].sort(), ['genome_b', 'genome_c']);
  assert.equal(b.geneAnnot.categoryColumn, null);
  assert.equal(b.geneAnnot.selectedCategories.size, 0);
  assert.equal(b.genomeAnnot.palette, 'Tableau10');
  assert.equal(b.zoom.zoomLevelTarget, 1);
  assert.equal(b.zoom.focusAngleTarget, 0);
  assert.equal(b.theme, 'dark');
  assert.equal(b.customGenomeOrder, null);
});

test('each instance renders from its own state', () => {
  const a = loaded();
  const b = loaded();

  setReferenceGenome(a, 'genome_c');
  setGenomeVisible(a, 'genome_a', false);
  setGeneCategoryColumn(a, 'bin');
  setGeneSelectedCategories(a, ['Bin 1']);

  const renderA = buildRenderData(a);
  const renderB = buildRenderData(b);

  assert.deepEqual(renderA.visibleGenomes, ['genome_b']);
  assert.deepEqual(renderB.visibleGenomes, ['genome_b', 'genome_c']);
  assert.equal(renderA.annotActive, true);
  assert.equal(renderB.annotActive, false);
  assert.ok(renderA.geneAnnotColors.size > 0);
  assert.equal(renderB.geneAnnotColors.size, 0);

  // genome_c has no gene4, so its reference set differs from genome_a's.
  assert.equal(renderA.referenceGenes.has('gene4'), false);
  assert.equal(renderB.referenceGenes.has('gene4'), true);
});

test('zoom state is per instance, including the animation targets', () => {
  const a = createState();
  const b = createState();

  a.zoom.setZoomLevel(20);
  a.zoom.setWedgeSpan(0.5);
  a.zoom.setWedgeGap(40);
  a.zoom.setHovering(true);
  a.zoom.tick(1000);

  assert.ok(a.zoom.zoomLevel > 1);
  assert.equal(b.zoom.zoomLevel, 1);
  assert.equal(b.zoom.wedgeSpan, 1 / 3);
  assert.equal(b.zoom.wedgeGap, 6);
  assert.equal(b.zoom.isHovering, false);
});

test('genome sort order is driven by the instance, not a shared setting', () => {
  const a = loaded();
  const b = loaded();
  const genomes = ['genome_a', 'genome_b', 'genome_c'];

  a.genomeAnnot.sortColumn = 'depth';
  a.genomeAnnot.sortAscending = true;
  assert.deepEqual(getGenomeSortedOrder(a, genomes), ['genome_b', 'genome_c', 'genome_a']);
  assert.deepEqual(getGenomeSortedOrder(b, genomes), ['genome_a', 'genome_b', 'genome_c']);

  a.genomeAnnot.sortAscending = false;
  assert.deepEqual(getGenomeSortedOrder(a, genomes), ['genome_a', 'genome_c', 'genome_b']);
});
