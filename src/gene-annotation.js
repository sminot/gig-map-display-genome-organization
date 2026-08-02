/**
 * Gene-level annotation: which genes are highlighted, and in what colour.
 * Pure state functions — the sidebar UI lives in controls.js.
 */

import { scaleOrdinal } from 'd3';
import { getPalette } from './palettes.js';
import { createGeneAnnotationState } from './state.js';

export function setGeneAnnotationData(state, { rawData, columns }, sourceUrl = null) {
  const fresh = createGeneAnnotationState();
  fresh.rawData = rawData;
  fresh.columns = columns;
  fresh.sourceUrl = sourceUrl;
  state.geneAnnot = fresh;
}

export function clearGeneAnnotation(state) {
  state.geneAnnot = createGeneAnnotationState();
}

/**
 * Activate a category column and derive its values, counts and colour scale.
 *
 * Values are ordered by descending count and then ascending value. The value
 * tie-break is what makes a colour assignment reproducible from a stored config:
 * without it the order would depend on the order rows arrived in.
 */
export function setGeneCategoryColumn(state, colName) {
  const ga = state.geneAnnot;
  ga.categoryColumn = colName || null;
  ga.selectedCategories = new Set();

  if (!ga.categoryColumn) {
    ga.categoryValues = [];
    ga.categoryCounts = new Map();
    ga.scale = null;
    return;
  }

  const counts = new Map();
  ga.rawData.forEach((row) => {
    const v = row[colName];
    if (v === null || v === undefined || v === '') return;
    const s = String(v);
    counts.set(s, (counts.get(s) || 0) + 1);
  });

  const values = [...counts.keys()].sort(
    (a, b) => (counts.get(b) - counts.get(a)) || a.localeCompare(b),
  );

  ga.categoryValues = values;
  ga.categoryCounts = counts;
  ga.scale = scaleOrdinal(getPalette('Tableau10')).domain(values);
}

export function setGeneSelectedCategories(state, values) {
  state.geneAnnot.selectedCategories = new Set(values || []);
}

export function toggleGeneCategory(state, value, selected) {
  const set = state.geneAnnot.selectedCategories;
  if (selected) set.add(String(value));
  else set.delete(String(value));
}

export function setGeneCustomColor(state, category, hex) {
  state.geneAnnot.customColors.set(category, hex);
}

/** The highlight colour for a gene, or null when it is not highlighted. */
export function getGeneAnnotationColor(state, geneId) {
  const ga = state.geneAnnot;
  if (!ga.categoryColumn || !ga.scale || ga.selectedCategories.size === 0) return null;

  const row = ga.rawData.get(String(geneId));
  if (!row) return null;

  const value = row[ga.categoryColumn];
  if (value === null || value === undefined || value === '') return null;

  const key = String(value);
  if (!ga.selectedCategories.has(key)) return null;

  return ga.customColors.get(key) || ga.scale(key);
}
