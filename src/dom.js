/**
 * DOM construction for one display.
 *
 * This is the single source of truth for the markup. It used to be duplicated in
 * index.html, test/index.html and pangenome-loader.js, which is why those three
 * had drifted apart.
 *
 * Two rules keep multiple displays on one page independent:
 *   - hooks are classes, never ids, and every ref is resolved by querying inside
 *     `root` rather than `document`;
 *   - the few ids accessibility genuinely needs (label/for, aria-controls) are
 *     suffixed with a per-instance counter.
 */

import { PALETTE_NAMES } from './palettes.js';

let instanceCounter = 0;

const CHEVRON_RIGHT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>';
const CHEVRON_LEFT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>';
const ICON_MOON = '<svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN = '<svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

const NONE_OPTION = '<option value="">— none —</option>';

function sidebarMarkup(id, title) {
  const paletteOptions = PALETTE_NAMES
    .map((name) => `<option value="${name}">${name}</option>`)
    .join('');

  return `
    <button class="gmd-expand sidebar-expand-btn" aria-label="Expand sidebar" type="button" hidden>${CHEVRON_RIGHT}</button>

    <aside class="gmd-sidebar sidebar" aria-label="Controls">
      <header class="sidebar-header">
        <h1 class="app-title">${title}</h1>
        <button class="gmd-theme theme-toggle-btn" aria-label="Toggle light/dark theme" type="button">${ICON_MOON}${ICON_SUN}</button>
        <button class="gmd-collapse sidebar-collapse-btn" aria-label="Collapse sidebar" type="button">${CHEVRON_LEFT}</button>
      </header>

      <div class="gmd-loading loading-indicator" aria-live="polite" aria-busy="true" hidden>
        <span class="spinner" aria-hidden="true"></span>
        <span class="loading-text">Parsing…</span>
      </div>
      <div class="gmd-error error-message" role="alert" aria-live="assertive" hidden></div>

      <div class="gmd-controls controls-panel" hidden>

        <section class="control-section" aria-labelledby="${id('ref-heading')}">
          <h2 class="control-section-heading" id="${id('ref-heading')}">Reference Genome</h2>
          <div class="control-field">
            <div class="ref-combobox">
              <input type="text" class="gmd-ref-input select-control ref-combobox-input"
                     autocomplete="off" placeholder="Search genomes…" aria-label="Reference genome"
                     aria-autocomplete="list" aria-controls="${id('ref-list')}" aria-expanded="false">
              <ul class="gmd-ref-list ref-combobox-list" id="${id('ref-list')}" role="listbox" hidden></ul>
            </div>
          </div>
        </section>

        <section class="control-section" aria-labelledby="${id('genomes-heading')}">
          <h2 class="control-section-heading" id="${id('genomes-heading')}">Genomes</h2>
          <div class="category-search-row">
            <input type="text" class="gmd-genome-search url-load-input category-search-input"
                   placeholder="Filter genomes…" autocomplete="off" aria-label="Filter genomes">
            <button class="gmd-genome-all btn-url" type="button">All</button>
            <button class="gmd-genome-none btn-url" type="button">None</button>
          </div>
          <button class="gmd-genome-similarity btn-export btn-block" type="button">Sort by gene content</button>
          <div class="gmd-genome-toggles genome-toggles" role="group" aria-label="Toggle genomes"></div>
        </section>

        <section class="control-section" aria-labelledby="${id('annot-heading')}">
          <h2 class="control-section-heading" id="${id('annot-heading')}">Highlight Genes</h2>
          <div class="gmd-gene-annot-controls annotation-controls" hidden>
            <div class="control-row">
              <label for="${id('gene-category')}" class="control-label">Group by</label>
              <select class="gmd-gene-category select-control select-control-sm" id="${id('gene-category')}">${NONE_OPTION}</select>
            </div>
            <div class="control-row">
              <label for="${id('gene-label')}" class="control-label">Name col.</label>
              <select class="gmd-gene-label select-control select-control-sm" id="${id('gene-label')}">${NONE_OPTION}</select>
            </div>
            <div class="gmd-gene-stats annotation-stats" hidden></div>
            <div class="gmd-gene-category-section" hidden>
              <div class="category-search-row">
                <input type="text" class="gmd-gene-category-search url-load-input category-search-input"
                       placeholder="Filter categories…" aria-label="Filter categories">
                <button class="gmd-gene-select-all btn-url" type="button">All</button>
                <button class="gmd-gene-clear-all btn-url" type="button">None</button>
              </div>
              <div class="gmd-gene-category-list category-checklist"></div>
              <div class="gmd-gene-selection-stats annotation-stats"></div>
            </div>
            <button class="gmd-gene-clear btn-text-danger" type="button">Clear</button>
          </div>
          <div class="gmd-gene-legend legend-container"></div>
        </section>

        <section class="control-section" aria-labelledby="${id('genome-annot-heading')}">
          <h2 class="control-section-heading" id="${id('genome-annot-heading')}">Genome Annotation</h2>
          <div class="gmd-genome-annot-controls annotation-controls" hidden>
            <div class="control-row">
              <label for="${id('genome-color')}" class="control-label">Color by</label>
              <select class="gmd-genome-color select-control select-control-sm" id="${id('genome-color')}">${NONE_OPTION}</select>
            </div>
            <div class="control-row">
              <label for="${id('genome-group')}" class="control-label">Group by</label>
              <select class="gmd-genome-group select-control select-control-sm" id="${id('genome-group')}">${NONE_OPTION}</select>
            </div>
            <div class="control-row">
              <label for="${id('genome-label')}" class="control-label">Name col.</label>
              <select class="gmd-genome-label select-control select-control-sm" id="${id('genome-label')}">${NONE_OPTION}</select>
            </div>
            <div class="control-row">
              <label for="${id('genome-palette')}" class="control-label">Palette</label>
              <select class="gmd-genome-palette select-control select-control-sm" id="${id('genome-palette')}">${paletteOptions}</select>
            </div>
            <div class="control-row control-row-top">
              <label for="${id('genome-tooltip')}" class="control-label control-label-top">Tooltip cols.</label>
              <select class="gmd-genome-tooltip select-control select-control-sm" id="${id('genome-tooltip')}" multiple size="4"></select>
            </div>
            <div class="control-row">
              <label for="${id('genome-sort')}" class="control-label">Sort by</label>
              <select class="gmd-genome-sort select-control select-control-sm" id="${id('genome-sort')}">${NONE_OPTION}</select>
            </div>
            <div class="control-row">
              <label for="${id('genome-sort-order')}" class="control-label">Order</label>
              <select class="gmd-genome-sort-order select-control select-control-sm" id="${id('genome-sort-order')}">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            <div class="gmd-genome-stats annotation-stats" hidden></div>
            <button class="gmd-genome-clear btn-text-danger" type="button">Clear</button>
          </div>
          <div class="gmd-genome-legend legend-container"></div>
        </section>

        <section class="control-section" aria-labelledby="${id('zoom-heading')}">
          <h2 class="control-section-heading" id="${id('zoom-heading')}">Zoom</h2>
          <div class="control-row">
            <label for="${id('wedge-span')}" class="control-label">Wedge</label>
            <input type="range" class="gmd-wedge-span range-control" id="${id('wedge-span')}"
                   min="10" max="50" value="33" step="1"
                   aria-label="Zoom wedge size as percent of full circle">
            <span class="gmd-wedge-span-display range-display">33%</span>
          </div>
          <div class="control-row">
            <label for="${id('wedge-gap')}" class="control-label">Gap</label>
            <input type="range" class="gmd-wedge-gap range-control" id="${id('wedge-gap')}"
                   min="0" max="60" value="6" step="1"
                   aria-label="Gap between main circle and wedge in pixels">
            <span class="gmd-wedge-gap-display range-display">6px</span>
          </div>
          <div class="control-row">
            <label for="${id('wedge-height')}" class="control-label">Height</label>
            <input type="range" class="gmd-wedge-height range-control" id="${id('wedge-height')}"
                   min="2" max="10" value="2" step="0.1" aria-label="Wedge height scale factor">
            <span class="gmd-wedge-height-display range-display">2.0×</span>
          </div>
          <button class="gmd-reset-zoom btn-export btn-block" type="button">Reset Zoom</button>
          <p class="control-hint">Hover over the circle and scroll to zoom in. The wedge shows the zoomed region.</p>
        </section>

        <section class="control-section" aria-labelledby="${id('export-heading')}">
          <h2 class="control-section-heading" id="${id('export-heading')}">Export</h2>
          <div class="export-buttons">
            <button class="gmd-export-png btn-export" type="button">PNG</button>
            <button class="gmd-export-svg btn-export" type="button">SVG</button>
            <button class="gmd-embed btn-export" type="button">Embed</button>
          </div>
        </section>

      </div>
    </aside>`;
}

function mainMarkup() {
  return `
    <main class="gmd-main main-area" aria-label="Visualization">
      <div class="gmd-viz viz-container">
        <canvas class="gmd-canvas" aria-label="Pangenome circular visualization"></canvas>
        <svg class="gmd-overlay" aria-hidden="true"></svg>
      </div>
      <div class="gmd-zoom-info zoom-info" hidden>
        <span class="gmd-zoom-info-text"></span>
        <button class="gmd-zoom-info-close zoom-info-close" title="Exit zoom" aria-label="Exit zoom">&#x2715;</button>
      </div>
      <div class="zoom-hint">Scroll to zoom &nbsp;·&nbsp; Click &amp; drag to move</div>
      <div class="gmd-tooltip tooltip" role="tooltip" aria-hidden="true"></div>
    </main>`;
}

const REF_SELECTORS = {
  expandBtn: '.gmd-expand',
  sidebar: '.gmd-sidebar',
  themeBtn: '.gmd-theme',
  collapseBtn: '.gmd-collapse',
  loading: '.gmd-loading',
  errorMessage: '.gmd-error',
  controlsPanel: '.gmd-controls',

  refInput: '.gmd-ref-input',
  refList: '.gmd-ref-list',

  genomeSearch: '.gmd-genome-search',
  genomeSelectAll: '.gmd-genome-all',
  genomeClearAll: '.gmd-genome-none',
  genomeSimilarityBtn: '.gmd-genome-similarity',
  genomeToggles: '.gmd-genome-toggles',

  geneAnnotControls: '.gmd-gene-annot-controls',
  geneCategorySelect: '.gmd-gene-category',
  geneLabelSelect: '.gmd-gene-label',
  geneStats: '.gmd-gene-stats',
  geneCategorySection: '.gmd-gene-category-section',
  geneCategorySearch: '.gmd-gene-category-search',
  geneSelectAll: '.gmd-gene-select-all',
  geneClearAll: '.gmd-gene-clear-all',
  geneCategoryList: '.gmd-gene-category-list',
  geneSelectionStats: '.gmd-gene-selection-stats',
  geneClearBtn: '.gmd-gene-clear',
  geneLegend: '.gmd-gene-legend',

  genomeAnnotControls: '.gmd-genome-annot-controls',
  genomeColorSelect: '.gmd-genome-color',
  genomeGroupSelect: '.gmd-genome-group',
  genomeLabelSelect: '.gmd-genome-label',
  genomePaletteSelect: '.gmd-genome-palette',
  genomeTooltipSelect: '.gmd-genome-tooltip',
  genomeSortSelect: '.gmd-genome-sort',
  genomeSortOrderSelect: '.gmd-genome-sort-order',
  genomeStats: '.gmd-genome-stats',
  genomeClearBtn: '.gmd-genome-clear',
  genomeLegend: '.gmd-genome-legend',

  wedgeSpanInput: '.gmd-wedge-span',
  wedgeSpanDisplay: '.gmd-wedge-span-display',
  wedgeGapInput: '.gmd-wedge-gap',
  wedgeGapDisplay: '.gmd-wedge-gap-display',
  wedgeHeightInput: '.gmd-wedge-height',
  wedgeHeightDisplay: '.gmd-wedge-height-display',
  resetZoomBtn: '.gmd-reset-zoom',

  exportPngBtn: '.gmd-export-png',
  exportSvgBtn: '.gmd-export-svg',
  embedBtn: '.gmd-embed',

  vizContainer: '.gmd-viz',
  canvas: '.gmd-canvas',
  overlay: '.gmd-overlay',
  zoomInfo: '.gmd-zoom-info',
  zoomInfoText: '.gmd-zoom-info-text',
  zoomInfoClose: '.gmd-zoom-info-close',
  tooltip: '.gmd-tooltip',
};

/**
 * Build the layout inside `root` and return `{ refs, uid }`.
 * Refs for sidebar elements are null when `controls` is false.
 */
export function buildLayout(root, { controls = true, title = 'Pangenome Viewer' } = {}) {
  const uid = ++instanceCounter;
  const id = (name) => `gmd${uid}-${name}`;

  root.classList.add('gmd-root');
  if (!controls) root.classList.add('gmd-no-controls');
  root.innerHTML = `<div class="gmd-layout app-layout">${controls ? sidebarMarkup(id, title) : ''}${mainMarkup()}</div>`;

  const refs = { root };
  for (const [name, selector] of Object.entries(REF_SELECTORS)) {
    refs[name] = root.querySelector(selector);
  }
  return { refs, uid };
}
