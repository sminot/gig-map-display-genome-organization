/**
 * pangenome-loader.js
 *
 * Single-script bootstrap for the Pangenome Viewer.
 * Include one <script> tag in an otherwise-empty HTML page and the full
 * application — styles, layout, and all JS modules — is injected and
 * initialised automatically.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/gh/sminot/gig-map-display-genome-organization@v1.0.2/pangenome-loader.js"></script>
 */
(function () {
  var VERSION = 'v1.0.3';
  var CDN     = 'https://cdn.jsdelivr.net/gh/sminot/gig-map-display-genome-organization@' + VERSION;

  // ── 1. Stylesheet ──────────────────────────────────────────────────────────
  var link  = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = CDN + '/style.css';
  document.head.appendChild(link);

  // ── 2. App HTML layout ─────────────────────────────────────────────────────
  // Injected before any scripts so the DOM is fully present when controls.js boots.
  document.body.insertAdjacentHTML('afterbegin', `
    <button id="sidebar-expand-btn" class="sidebar-expand-btn" aria-label="Expand sidebar" type="button" hidden>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <div class="app-layout">
      <aside class="sidebar" aria-label="Controls">

        <header class="sidebar-header">
          <h1 class="app-title">Pangenome Viewer</h1>
          <button id="theme-toggle-btn" class="theme-toggle-btn" aria-label="Toggle light/dark theme" type="button">
            <svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            <svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </button>
          <button id="sidebar-collapse-btn" class="sidebar-collapse-btn" aria-label="Collapse sidebar" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </header>

        <div id="loading-indicator" class="loading-indicator" aria-live="polite" aria-busy="true" hidden>
          <span class="spinner" aria-hidden="true"></span>
          <span class="loading-text">Parsing&hellip;</span>
        </div>
        <div id="error-message" class="error-message" role="alert" aria-live="assertive" hidden></div>

        <div id="controls-panel" class="controls-panel" hidden>

          <section class="control-section" aria-labelledby="ref-section-heading">
            <h2 class="control-section-heading" id="ref-section-heading">Reference Genome</h2>
            <div class="control-field">
              <div class="ref-combobox">
                <input type="text" id="reference-select-input" class="select-control ref-combobox-input"
                       autocomplete="off" placeholder="Search genomes…" aria-label="Reference genome"
                       aria-autocomplete="list" aria-controls="ref-combobox-list" aria-expanded="false">
                <ul id="ref-combobox-list" class="ref-combobox-list" role="listbox" hidden></ul>
              </div>
            </div>
          </section>

          <section class="control-section" aria-labelledby="genomes-section-heading">
            <h2 class="control-section-heading" id="genomes-section-heading">Genomes</h2>
            <div class="category-search-row">
              <input type="text" id="genome-search" class="url-load-input category-search-input" placeholder="Filter genomes…" autocomplete="off">
              <button id="genome-select-all" class="btn-url" type="button">All</button>
              <button id="genome-clear-all"  class="btn-url" type="button">None</button>
            </div>
            <button id="genome-gene-similarity-btn" class="btn-export" type="button" style="width:100%;margin-top:4px">Sort by gene content</button>
            <div id="genome-toggles" class="genome-toggles" role="group" aria-label="Toggle genomes"></div>
          </section>

          <section class="control-section" aria-labelledby="annot-section-heading">
            <h2 class="control-section-heading" id="annot-section-heading">Highlight Genes</h2>
            <div id="annotation-controls" class="annotation-controls" hidden>
              <div class="control-row">
                <label for="annotation-category-column-select" class="control-label">Group by</label>
                <select id="annotation-category-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div class="control-row">
                <label for="annotation-name-column-select" class="control-label">Name col.</label>
                <select id="annotation-name-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div id="annotation-stats" class="annotation-stats" hidden></div>
              <div id="annotation-category-section" hidden>
                <div class="category-search-row">
                  <input type="text" id="annotation-category-search" class="url-load-input category-search-input" placeholder="Filter categories…">
                  <button id="annot-select-all" class="btn-url" type="button">All</button>
                  <button id="annot-clear-all"  class="btn-url" type="button">None</button>
                </div>
                <div id="annotation-category-list" class="category-checklist"></div>
                <div id="annotation-selection-stats" class="annotation-stats"></div>
              </div>
              <button id="clear-annotation-btn" class="btn-text-danger" type="button">Clear</button>
            </div>
            <div id="annotation-legend" class="legend-container"></div>
          </section>

          <section class="control-section" aria-labelledby="genome-annot-section-heading">
            <h2 class="control-section-heading" id="genome-annot-section-heading">Genome Annotation</h2>
            <div id="genome-annotation-controls" class="annotation-controls" hidden>
              <div class="control-row">
                <label for="genome-color-column-select" class="control-label">Color by</label>
                <select id="genome-color-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div class="control-row">
                <label for="genome-group-column-select" class="control-label">Group by</label>
                <select id="genome-group-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div class="control-row">
                <label for="genome-name-column-select" class="control-label">Name col.</label>
                <select id="genome-name-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div class="control-row">
                <label for="genome-palette-select" class="control-label">Palette</label>
                <select id="genome-palette-select" class="select-control select-control-sm">
                  <option value="Tableau10">Tableau10</option><option value="Set1">Set1</option>
                  <option value="Set2">Set2</option><option value="Set3">Set3</option>
                  <option value="Pastel1">Pastel1</option><option value="Dark2">Dark2</option>
                  <option value="Paired">Paired</option><option value="Accent">Accent</option>
                </select>
              </div>
              <div class="control-row" style="align-items:flex-start">
                <label for="genome-tooltip-columns-select" class="control-label" style="padding-top:4px">Tooltip cols.</label>
                <select id="genome-tooltip-columns-select" class="select-control select-control-sm" multiple size="4"></select>
              </div>
              <div class="control-row">
                <label for="genome-sort-column-select" class="control-label">Sort by</label>
                <select id="genome-sort-column-select" class="select-control select-control-sm"><option value="">— none —</option></select>
              </div>
              <div class="control-row">
                <label for="genome-sort-order-select" class="control-label">Order</label>
                <select id="genome-sort-order-select" class="select-control select-control-sm">
                  <option value="asc">Ascending</option><option value="desc">Descending</option>
                </select>
              </div>
              <div id="genome-annotation-stats" class="annotation-stats" hidden></div>
              <button id="clear-genome-annotation-btn" class="btn-text-danger" type="button">Clear</button>
            </div>
            <div id="genome-annotation-legend" class="legend-container"></div>
          </section>

          <section class="control-section" aria-labelledby="zoom-section-heading">
            <h2 class="control-section-heading" id="zoom-section-heading">Zoom</h2>
            <div class="control-row">
              <label for="wedge-span-input" class="control-label">Wedge</label>
              <input type="range" id="wedge-span-input" class="range-control" min="10" max="50" value="33" step="1" aria-label="Zoom wedge size as percent of full circle"/>
              <span id="wedge-span-display" class="range-display">33%</span>
            </div>
            <div class="control-row">
              <label for="wedge-gap-input" class="control-label">Gap</label>
              <input type="range" id="wedge-gap-input" class="range-control" min="0" max="60" value="6" step="1" aria-label="Gap between main circle and wedge in pixels"/>
              <span id="wedge-gap-display" class="range-display">6px</span>
            </div>
            <div class="control-row">
              <label for="wedge-height-input" class="control-label">Height</label>
              <input type="range" id="wedge-height-input" class="range-control" min="2" max="10" value="2" step="0.1" aria-label="Wedge height scale factor"/>
              <span id="wedge-height-display" class="range-display">2.0×</span>
            </div>
            <button id="reset-zoom-btn" class="btn-export" type="button" style="width:100%;margin-top:4px">Reset Zoom</button>
            <p class="control-hint">Hover over the circle and scroll to zoom in. The wedge shows the zoomed region.</p>
          </section>

          <section class="control-section" aria-labelledby="export-section-heading">
            <h2 class="control-section-heading" id="export-section-heading">Export</h2>
            <div class="export-buttons">
              <button id="export-png-btn" class="btn-export" type="button">PNG</button>
              <button id="embed-copy-btn" class="btn-export" type="button">Embed</button>
            </div>
          </section>

        </div>
      </aside>

      <main class="main-area" aria-label="Visualization">
        <div id="viz-container" class="viz-container">
          <canvas id="main-canvas" aria-label="Pangenome circular visualization"></canvas>
          <svg id="overlay-svg" aria-hidden="true"></svg>
        </div>
        <div id="zoom-info" class="zoom-info" hidden>
          <span id="zoom-info-text"></span>
          <button id="zoom-info-close" class="zoom-info-close" title="Exit zoom" aria-label="Exit zoom">&#x2715;</button>
        </div>
        <div class="zoom-hint">Scroll to zoom &nbsp;·&nbsp; Click &amp; drag to move</div>
        <div id="tooltip" class="tooltip" role="tooltip" aria-hidden="true"></div>
      </main>
    </div>
  `);

  // ── 3. Load all scripts sequentially ──────────────────────────────────────
  var SCRIPTS = [
    'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
    'https://cdn.jsdelivr.net/npm/papaparse@5/papaparse.min.js',
    CDN + '/data-contract.js',
    CDN + '/app.js',
    CDN + '/genome-viz.js',
    CDN + '/zoom-state.js',
    CDN + '/webgl-renderer.js',
    CDN + '/zoom-interaction.js',
    CDN + '/annotation.js',
    CDN + '/genome-annotation.js',
    CDN + '/export.js',
    CDN + '/controls.js',
  ];

  function loadNext(i) {
    if (i >= SCRIPTS.length) return;
    var s    = document.createElement('script');
    s.src    = SCRIPTS[i];
    s.onload = function () { loadNext(i + 1); };
    s.onerror = function () {
      console.error('[pangenome-loader] Failed to load ' + SCRIPTS[i]);
      loadNext(i + 1);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
