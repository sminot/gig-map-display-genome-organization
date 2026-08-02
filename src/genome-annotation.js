/**
 * Genome-level annotation: ring colour, grouping, sort order and tooltip columns.
 * Pure state functions — the sidebar UI lives in controls.js.
 */

import { scaleOrdinal } from 'd3';
import { getPalette } from './palettes.js';
import { createGenomeAnnotationState } from './state.js';

const GENOME_ID_FIELD = 'genome_id';

export function setGenomeAnnotationData(state, { rawData, columns }, sourceUrl = null) {
  const fresh = createGenomeAnnotationState();
  fresh.rawData = rawData;
  fresh.columns = columns;
  fresh.sourceUrl = sourceUrl;
  state.genomeAnnot = fresh;
}

export const GENOME_ANNOTATION_ID_FIELD = GENOME_ID_FIELD;

export function clearGenomeAnnotation(state) {
  state.genomeAnnot = createGenomeAnnotationState();
}

function buildOrdinalScale(ga, colName) {
  if (!colName) return { scale: null, domain: [] };

  const seen = new Set();
  const values = [];
  ga.rawData.forEach((row) => {
    const v = row[colName];
    if (v === null || v === undefined || v === '') return;
    const s = String(v);
    if (!seen.has(s)) { seen.add(s); values.push(s); }
  });
  values.sort();

  return { scale: scaleOrdinal(getPalette(ga.palette)).domain(values), domain: values };
}

/** Rebuild both derived colour scales from the current palette and columns. */
export function rebuildGenomeScales(state) {
  const ga = state.genomeAnnot;
  const colour = buildOrdinalScale(ga, ga.colorColumn);
  ga.scale = colour.scale;
  ga.domain = colour.domain;
  const group = buildOrdinalScale(ga, ga.groupColumn);
  ga.groupScale = group.scale;
  ga.groupDomain = group.domain;
}

export function setGenomeColorColumn(state, colName) {
  state.genomeAnnot.colorColumn = colName || null;
  rebuildGenomeScales(state);
}

export function setGenomeGroupColumn(state, colName) {
  state.genomeAnnot.groupColumn = colName || null;
  rebuildGenomeScales(state);
}

export function setGenomeLabelColumn(state, colName) {
  state.genomeAnnot.labelColumn = colName || null;
}

export function setGenomeTooltipColumns(state, cols) {
  state.genomeAnnot.tooltipColumns = Array.isArray(cols) ? cols.slice() : [];
}

export function setGenomeSortColumn(state, colName, ascending) {
  state.genomeAnnot.sortColumn = colName || null;
  state.genomeAnnot.sortAscending = ascending !== false;
}

export function setGenomePalette(state, paletteName) {
  state.genomeAnnot.palette = paletteName;
  rebuildGenomeScales(state);
}

/** Annotation colour for a genome ring, or null to fall back to the default scale. */
export function getGenomeAnnotationColor(state, genomeId) {
  const ga = state.genomeAnnot;
  const useGroup = !!(ga.groupColumn && ga.groupScale);
  const column = useGroup ? ga.groupColumn : ga.colorColumn;
  const scale = useGroup ? ga.groupScale : ga.scale;
  if (!column || !scale) return null;

  const row = ga.rawData.get(String(genomeId));
  if (!row) return null;

  const value = row[column];
  if (value === null || value === undefined || value === '') return null;
  return scale(String(value));
}

/** The display name for a genome: its label-column value, else a shortened id. */
export function getGenomeDisplayName(state, genome) {
  const ga = state.genomeAnnot;
  if (ga.labelColumn) {
    const row = ga.rawData.get(String(genome));
    if (row) {
      const label = row[ga.labelColumn];
      if (label !== null && label !== undefined && label !== '') return String(label);
    }
  }
  return String(genome).replace(/_genomic\.fna\.gz$/, '').replace(/\.fna\.gz$/, '');
}

/**
 * Ring order for the given genomes. Group column wins, then the sort column,
 * then any custom gene-similarity order, then alphabetical.
 */
export function getGenomeSortedOrder(state, genomes) {
  const ga = state.genomeAnnot;

  if (ga.groupColumn) {
    const col = ga.groupColumn;
    return genomes.slice().sort((a, b) => {
      const rowA = ga.rawData.get(String(a));
      const rowB = ga.rawData.get(String(b));
      const gA = (rowA && rowA[col] != null) ? String(rowA[col]) : '';
      const gB = (rowB && rowB[col] != null) ? String(rowB[col]) : '';
      return gA.localeCompare(gB) || String(a).localeCompare(String(b));
    });
  }

  if (!ga.sortColumn) {
    if (state.customGenomeOrder) {
      const rank = new Map(state.customGenomeOrder.map((g, i) => [g, i]));
      return genomes.slice().sort((a, b) => {
        const hasA = rank.has(a);
        const hasB = rank.has(b);
        if (hasA && hasB) return rank.get(a) - rank.get(b);
        if (hasA) return -1;
        if (hasB) return 1;
        return String(a).localeCompare(String(b));
      });
    }
    return genomes.slice().sort();
  }

  const col = ga.sortColumn;
  const ascending = ga.sortAscending;
  return genomes.slice().sort((a, b) => {
    const rowA = ga.rawData.get(String(a));
    const rowB = ga.rawData.get(String(b));

    // Genomes missing from the annotation sort to the end, either direction.
    const hasA = rowA !== undefined && rowA[col] !== null && rowA[col] !== undefined;
    const hasB = rowB !== undefined && rowB[col] !== null && rowB[col] !== undefined;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;

    const valA = rowA[col];
    const valB = rowB[col];
    const cmp = (typeof valA === 'number' && typeof valB === 'number')
      ? valA - valB
      : String(valA).localeCompare(String(valB));
    return ascending ? cmp : -cmp;
  });
}
