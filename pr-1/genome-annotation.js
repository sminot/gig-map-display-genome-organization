/**
 * genome-annotation.js — Genome-level annotation overlay for the Pangenome Viewer.
 *
 * Responsibilities:
 *   - File upload / drag-and-drop wiring          (initGenomeAnnotationUpload)
 *   - Gzip detection + CSV parsing                (loadGenomeAnnotationFile)
 *   - Color column + sort column activation       (setGenomeColorColumn, setGenomeSortColumn)
 *   - Palette selection                           (setGenomePalette)
 *   - Per-genome color lookup                     (getGenomeAnnotationColor)
 *   - Sort-order computation                      (getGenomeSortedOrder)
 *   - Legend rendering                            (renderGenomeAnnotationLegend)
 *
 * Depends on:
 *   - data-contract.js  (GenomeAnnotationState declared there)
 *   - Papa.parse        (PapaParse global)
 *   - d3                (D3 global)
 *
 * All public symbols are attached to `window`.
 */

(function () {
  'use strict';

  // ─── Expose the shared singleton globally ────────────────────────────────────
  // GenomeAnnotationState is declared in data-contract.js which is loaded first.
  window.GenomeAnnotationState = GenomeAnnotationState;

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  // Unlike app.js's el(), this never throws — callers guard against null.
  function el(id) {
    return document.getElementById(id);
  }

  /**
   * Rebuild the color scale from the current colorColumn and palette.
   * Called whenever either changes.
   */
  function rebuildColorScale() {
    var colName = GenomeAnnotationState.colorColumn;
    if (!colName) {
      GenomeAnnotationState.scale  = null;
      GenomeAnnotationState.domain = [];
      return;
    }

    // Collect unique values for the active color column
    var seen   = new Set();
    var values = [];
    GenomeAnnotationState.rawData.forEach(function (row) {
      var v = row[colName];
      if (v !== null && v !== undefined && v !== '') {
        var s = String(v);
        if (!seen.has(s)) {
          seen.add(s);
          values.push(s);
        }
      }
    });
    values.sort();

    GenomeAnnotationState.domain = values;
    GenomeAnnotationState.scale  = d3
      .scaleOrdinal(window.getPalette(GenomeAnnotationState.palette))
      .domain(values);
  }

  // ─── 1. initGenomeAnnotationUpload ───────────────────────────────────────────

  function initGenomeAnnotationUpload() {
    var dropZone  = el('genome-annotation-drop-zone');
    var fileInput = el('genome-annotation-file-input');
    var clearBtn  = el('clear-genome-annotation-btn');

    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });

      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drag-over');
      });

      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file) window.loadGenomeAnnotationFile(file);
      });

      dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (fileInput) fileInput.click();
        }
      });

      dropZone.addEventListener('click', function () {
        if (fileInput) fileInput.click();
      });

      if (fileInput) {
        fileInput.addEventListener('click', function (e) {
          e.stopPropagation();
        });
      }
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files[0];
        if (file) window.loadGenomeAnnotationFile(file);
        fileInput.value = '';
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        window.clearGenomeAnnotation();
      });
    }
  }

  window.initGenomeAnnotationUpload = initGenomeAnnotationUpload;

  // ─── 2. loadGenomeAnnotationFile ─────────────────────────────────────────────

  async function loadGenomeAnnotationFile(file) {
    var errorEl = el('genome-annotation-error');
    var labelEl = el('genome-annotation-file-label');

    if (errorEl) {
      errorEl.hidden      = true;
      errorEl.textContent = '';
    }

    try {
      var text = await window.readFileAsText(file);

      var result = Papa.parse(text, {
        header:         true,
        dynamicTyping:  true,
        skipEmptyLines: true,
        delimiter:      '',
      });

      if (!result.meta || !result.meta.fields || result.meta.fields.length < 1) {
        throw new Error('Could not detect columns in the genome annotation file.');
      }

      var fields   = result.meta.fields;
      var idField  = fields[0];
      var dataCols = fields.slice(1);

      // Build rawData map: genomeId → row object
      var rawData = new Map();
      for (var i = 0; i < result.data.length; i++) {
        var row      = result.data[i];
        var genomeId = String(row[idField]);
        if (genomeId) rawData.set(genomeId, row);
      }

      // Commit to shared state
      GenomeAnnotationState.rawData  = rawData;
      GenomeAnnotationState.columns  = dataCols;

      // Reset column-level state from any previous load
      GenomeAnnotationState.colorColumn   = null;
      GenomeAnnotationState.sortColumn    = null;
      GenomeAnnotationState.sortAscending = true;
      GenomeAnnotationState.scale         = null;
      GenomeAnnotationState.domain        = [];

      // Update label
      if (labelEl) labelEl.textContent = file.name;
      GenomeAnnotationState.loadedURL = null;

      // Notify the app
      if (typeof window.onGenomeAnnotationLoaded === 'function') {
        window.onGenomeAnnotationLoaded();
      }

    } catch (err) {
      if (errorEl) {
        errorEl.hidden      = false;
        errorEl.textContent = err.message || String(err);
      }
    }
  }

  async function loadGenomeAnnotationFromURL(url) {
    var errorEl = el('genome-annotation-error');
    var labelEl = el('genome-annotation-file-label');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readURLAsText(url);
      var result = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true, delimiter: '' });
      if (!result.meta || !result.meta.fields || result.meta.fields.length < 1)
        throw new Error('Could not detect columns in the genome annotation file.');
      var fields   = result.meta.fields;
      var idField  = fields[0];
      var dataCols = fields.slice(1);
      var rawData  = new Map();
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        var genomeId = String(row[idField]);
        if (genomeId) rawData.set(genomeId, row);
      }
      GenomeAnnotationState.rawData       = rawData;
      GenomeAnnotationState.columns       = dataCols;
      GenomeAnnotationState.colorColumn   = null;
      GenomeAnnotationState.sortColumn    = null;
      GenomeAnnotationState.sortAscending = true;
      GenomeAnnotationState.scale         = null;
      GenomeAnnotationState.domain        = [];
      GenomeAnnotationState.loadedURL     = url;
      if (labelEl) labelEl.textContent = url.split('/').pop();
      if (typeof window.onGenomeAnnotationLoaded === 'function') window.onGenomeAnnotationLoaded();
    } catch (err) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
    }
  }

  window.loadGenomeAnnotationFile    = loadGenomeAnnotationFile;
  window.loadGenomeAnnotationFromURL = loadGenomeAnnotationFromURL;

  // ─── 3. setGenomeColorColumn ──────────────────────────────────────────────────

  function setGenomeColorColumn(colName) {
    GenomeAnnotationState.colorColumn = colName;
    rebuildColorScale();

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGenomeColorColumn = setGenomeColorColumn;

  // ─── 4. setGenomeSortColumn ───────────────────────────────────────────────────

  function setGenomeSortColumn(colName, ascending) {
    GenomeAnnotationState.sortColumn    = colName;
    GenomeAnnotationState.sortAscending = ascending !== false; // default true

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGenomeSortColumn = setGenomeSortColumn;

  // ─── 5. setGenomePalette ──────────────────────────────────────────────────────

  function setGenomePalette(paletteName) {
    GenomeAnnotationState.palette = paletteName;

    // Rebuild scale only if a color column is already active
    if (GenomeAnnotationState.colorColumn) {
      rebuildColorScale();
    }

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGenomePalette = setGenomePalette;

  // ─── 6. clearGenomeAnnotation ─────────────────────────────────────────────────

  function clearGenomeAnnotation() {
    GenomeAnnotationState.rawData       = new Map();
    GenomeAnnotationState.columns       = [];
    GenomeAnnotationState.colorColumn   = null;
    GenomeAnnotationState.sortColumn    = null;
    GenomeAnnotationState.sortAscending = true;
    GenomeAnnotationState.palette       = 'Tableau10';
    GenomeAnnotationState.scale         = null;
    GenomeAnnotationState.domain        = [];

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.clearGenomeAnnotation = clearGenomeAnnotation;

  // ─── 7. getGenomeAnnotationColor ─────────────────────────────────────────────

  function getGenomeAnnotationColor(genomeId) {
    if (!GenomeAnnotationState.colorColumn || !GenomeAnnotationState.scale) {
      return null;
    }

    var row = GenomeAnnotationState.rawData.get(String(genomeId));
    if (!row) return null;

    var value = row[GenomeAnnotationState.colorColumn];
    if (value === null || value === undefined || value === '') return null;

    return GenomeAnnotationState.scale(String(value));
  }

  window.getGenomeAnnotationColor = getGenomeAnnotationColor;

  // ─── 8. getGenomeSortedOrder ──────────────────────────────────────────────────

  function getGenomeSortedOrder(genomes) {
    if (!GenomeAnnotationState.sortColumn) {
      // No sort column set — return alphabetical order (matching app.js default)
      return genomes.slice().sort();
    }

    var col       = GenomeAnnotationState.sortColumn;
    var ascending = GenomeAnnotationState.sortAscending;
    var rawData   = GenomeAnnotationState.rawData;

    return genomes.slice().sort(function (a, b) {
      var rowA = rawData.get(String(a));
      var rowB = rawData.get(String(b));

      // Genomes missing from annotation data sort to the end
      var hasA = rowA !== undefined && rowA[col] !== null && rowA[col] !== undefined;
      var hasB = rowB !== undefined && rowB[col] !== null && rowB[col] !== undefined;

      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;

      var valA = rowA[col];
      var valB = rowB[col];

      var cmp;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB));
      }

      return ascending ? cmp : -cmp;
    });
  }

  window.getGenomeSortedOrder = getGenomeSortedOrder;

  // ─── 9. renderGenomeAnnotationLegend ─────────────────────────────────────────

  function renderGenomeAnnotationLegend() {
    var legendEl = el('genome-annotation-legend');
    if (!legendEl) return;

    // Clear existing content
    legendEl.innerHTML = '';

    if (!GenomeAnnotationState.colorColumn || !GenomeAnnotationState.scale) {
      return;
    }

    // Title
    var title = document.createElement('div');
    title.className   = 'legend-title';
    title.textContent = GenomeAnnotationState.colorColumn;
    legendEl.appendChild(title);

    var itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'legend-items';

    var domain = GenomeAnnotationState.domain;
    for (var i = 0; i < domain.length; i++) {
      var val   = domain[i];
      var color = GenomeAnnotationState.scale(val);

      var row = document.createElement('div');
      row.className = 'legend-item';

      var swatch = document.createElement('span');
      swatch.className        = 'legend-swatch';
      swatch.style.background = color;
      swatch.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className   = 'legend-label';
      label.textContent = val;

      row.appendChild(swatch);
      row.appendChild(label);
      itemsWrapper.appendChild(row);
    }

    legendEl.appendChild(itemsWrapper);
  }

  window.renderGenomeAnnotationLegend = renderGenomeAnnotationLegend;

})();
