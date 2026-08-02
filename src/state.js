/**
 * Instance-scoped display state.
 *
 * There are no module-level state objects in this library. Every mounted display
 * owns one object returned by `createState()`, and every module that reads or
 * writes state receives it as an argument. Two displays on one page therefore
 * share nothing.
 *
 * The `scale` / `groupScale` fields hold d3 ordinal scales, which are not
 * serializable. They are never persisted: `config.js` rebuilds them from the
 * palette name and the annotation rows, deterministically.
 */

import { createZoomState } from './zoom-state.js';

export function createGeneAnnotationState() {
  return {
    rawData: new Map(),        // geneId -> row object
    columns: [],               // annotation column names (column 2 onward)
    categoryColumn: null,
    labelColumn: null,         // shown as the gene name in the tooltip
    selectedCategories: new Set(),
    categoryValues: [],        // all values, count desc then value asc
    categoryCounts: new Map(),
    scale: null,               // derived: value -> colour
    customColors: new Map(),   // category -> hex override
    displayMode: 'bars',       // 'bars' | 'arrows'
    sourceUrl: null,
  };
}

export function createGenomeAnnotationState() {
  return {
    rawData: new Map(),        // genomeId -> row object
    columns: [],
    colorColumn: null,
    groupColumn: null,         // groups and sorts rings; overrides colorColumn for colour
    groupScale: null,          // derived
    groupDomain: [],
    labelColumn: null,
    tooltipColumns: [],
    sortColumn: null,
    sortAscending: true,
    palette: 'Tableau10',
    scale: null,               // derived
    domain: [],
    sourceUrl: null,
  };
}

export function createState() {
  return {
    rows: [],                  // one object per alignment row
    allGenomes: [],
    referenceGenome: null,
    visibleGenomes: new Set(),
    customGenomeOrder: null,   // string[] | null — greedy gene-similarity ordering
    sourceUrl: null,
    theme: 'dark',             // 'dark' | 'light'
    geneAnnot: createGeneAnnotationState(),
    genomeAnnot: createGenomeAnnotationState(),
    zoom: createZoomState(),
  };
}
