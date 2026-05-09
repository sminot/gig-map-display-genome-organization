/**
 * annotation.js — Gene-level annotation overlay for the Pangenome Viewer.
 *
 * Responsibilities:
 *   - File upload / drag-and-drop wiring     (initAnnotationUpload)
 *   - Gzip detection + CSV parsing           (loadGeneAnnotationFile)
 *   - Category column selection              (setGeneAnnotationCategoryColumn)
 *   - Per-gene color lookups                 (getGeneAnnotationColor)
 *   - Legend rendering                       (renderGeneAnnotationLegend)
 *
 * Depends on:
 *   - data-contract.js  (GeneAnnotationState declared there)
 *   - Papa.parse        (PapaParse global)
 *   - d3                (D3 global)
 *
 * All public symbols are attached to `window`.
 */

(function () {
  'use strict';

  // ─── Expose the shared singleton globally ────────────────────────────────────
  // GeneAnnotationState is declared in data-contract.js which is loaded first.
  window.GeneAnnotationState = GeneAnnotationState;

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  // Unlike app.js's el(), this never throws — callers guard against null.
  function el(id) {
    return document.getElementById(id);
  }

  // ─── 1. initAnnotationUpload ──────────────────────────────────────────────────

  function initAnnotationUpload() {
    var dropZone  = el('annotation-drop-zone');
    var fileInput = el('annotation-file-input');
    var clearBtn  = el('clear-annotation-btn');

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
        if (file) window.loadGeneAnnotationFile(file);
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

      // fileInput covers the drop zone (position:absolute;inset:0), so a direct
      // click on the zone hits the input natively. Stop propagation to prevent
      // the click from also bubbling up and triggering fileInput.click() again.
      if (fileInput) {
        fileInput.addEventListener('click', function (e) {
          e.stopPropagation();
        });
      }
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files[0];
        if (file) window.loadGeneAnnotationFile(file);
        fileInput.value = '';
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        window.clearGeneAnnotation();
      });
    }
  }

  window.initAnnotationUpload = initAnnotationUpload;

  // ─── 2. loadGeneAnnotationFile / loadGeneAnnotationFromURL ───────────────────

  function _applyGeneAnnotationText(text, label, loadedURL) {
    var result = Papa.parse(text, {
      header:         true,
      dynamicTyping:  true,
      skipEmptyLines: true,
      delimiter:      '',
      // Trim whitespace from every cell so " 0.5" is seen as 0.5, not a string.
      transform:      function (v) { return typeof v === 'string' ? v.trim() : v; },
    });

    if (!result.meta || !result.meta.fields || result.meta.fields.length < 1) {
      throw new Error('Could not detect columns in the annotation file.');
    }

    var fields   = result.meta.fields;
    var idField  = fields[0];
    var dataCols = fields.slice(1);

    var rawData = new Map();
    for (var i = 0; i < result.data.length; i++) {
      var row    = result.data[i];
      var rawId  = row[idField];
      if (rawId === null || rawId === undefined) continue;
      var geneId = String(rawId).trim();
      if (!geneId) continue;
      rawData.set(geneId, row);
    }

    GeneAnnotationState.rawData            = rawData;
    GeneAnnotationState.columns            = dataCols;
    GeneAnnotationState.categoryColumn     = null;
    GeneAnnotationState.labelColumn        = null;
    GeneAnnotationState.selectedCategories = new Set();
    GeneAnnotationState.categoryValues     = [];
    GeneAnnotationState.categoryCounts     = new Map();
    GeneAnnotationState.scale              = null;
    GeneAnnotationState.customColors       = new Map();
    GeneAnnotationState.displayMode        = 'bars';
    GeneAnnotationState.loadedURL          = loadedURL;

    var labelEl = el('annotation-file-label');
    if (labelEl) labelEl.textContent = label;

    if (typeof window.onGeneAnnotationLoaded === 'function') {
      window.onGeneAnnotationLoaded();
    }
  }

  async function loadGeneAnnotationFile(file) {
    var errorEl = el('annotation-error');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readFileAsText(file);
      _applyGeneAnnotationText(text, file.name, null);
    } catch (err) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
    }
  }

  async function loadGeneAnnotationFromURL(url, silent) {
    var errorEl = el('annotation-error');
    if (!silent && errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readURLAsText(url);
      _applyGeneAnnotationText(text, url.split('/').pop(), url);
    } catch (err) {
      if (!silent && errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
    }
  }

  window.loadGeneAnnotationFile    = loadGeneAnnotationFile;
  window.loadGeneAnnotationFromURL = loadGeneAnnotationFromURL;

  // ─── 3. setGeneAnnotationCategoryColumn ──────────────────────────────────────

  function setGeneAnnotationCategoryColumn(colName) {
    GeneAnnotationState.categoryColumn = colName || null;
    GeneAnnotationState.selectedCategories = new Set();
    if (colName) {
      var counts = new Map();
      GeneAnnotationState.rawData.forEach(function(row) {
        var v = row[colName];
        if (v === null || v === undefined || v === '') return;
        var s = String(v);
        counts.set(s, (counts.get(s) || 0) + 1);
      });
      var values = Array.from(counts.keys()).sort(function(a, b) {
        return (counts.get(b) || 0) - (counts.get(a) || 0);
      });
      GeneAnnotationState.categoryValues = values;
      GeneAnnotationState.categoryCounts = counts;
      GeneAnnotationState.scale = d3.scaleOrdinal(window.getPalette('Tableau10')).domain(values);
    } else {
      GeneAnnotationState.categoryValues = [];
      GeneAnnotationState.categoryCounts = new Map();
      GeneAnnotationState.scale = null;
    }
    if (typeof window.onGeneAnnotationColumnChanged === 'function') window.onGeneAnnotationColumnChanged();
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGeneAnnotationCategoryColumn = setGeneAnnotationCategoryColumn;

  // ─── 4. setGeneAnnotationSelectedCategories ──────────────────────────────────

  function setGeneAnnotationSelectedCategories(arr) {
    GeneAnnotationState.selectedCategories = new Set(arr || []);
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGeneAnnotationSelectedCategories = setGeneAnnotationSelectedCategories;

  // ─── 5. toggleGeneAnnotationCategory ─────────────────────────────────────────

  function toggleGeneAnnotationCategory(val, checked) {
    if (checked) GeneAnnotationState.selectedCategories.add(String(val));
    else GeneAnnotationState.selectedCategories.delete(String(val));
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.toggleGeneAnnotationCategory = toggleGeneAnnotationCategory;

  // ─── 6. getGeneAnnotationColor ───────────────────────────────────────────────

  function getGeneAnnotationColor(geneId) {
    if (!GeneAnnotationState.categoryColumn || !GeneAnnotationState.scale) return null;
    if (GeneAnnotationState.selectedCategories.size === 0) return null;
    var row = GeneAnnotationState.rawData.get(String(geneId));
    if (!row) return null;
    var val = row[GeneAnnotationState.categoryColumn];
    if (val === null || val === undefined || val === '') return null;
    var s = String(val);
    if (!GeneAnnotationState.selectedCategories.has(s)) return null;
    return GeneAnnotationState.customColors.get(s) || GeneAnnotationState.scale(s);
  }

  function setGeneAnnotationCustomColor(category, hex) {
    GeneAnnotationState.customColors.set(category, hex);
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGeneAnnotationCustomColor = setGeneAnnotationCustomColor;

  window.getGeneAnnotationColor = getGeneAnnotationColor;

  // ─── 8. clearGeneAnnotation ──────────────────────────────────────────────────

  function clearGeneAnnotation() {
    GeneAnnotationState.rawData            = new Map();
    GeneAnnotationState.columns            = [];
    GeneAnnotationState.categoryColumn     = null;
    GeneAnnotationState.labelColumn        = null;
    GeneAnnotationState.selectedCategories = new Set();
    GeneAnnotationState.categoryValues     = [];
    GeneAnnotationState.categoryCounts     = new Map();
    GeneAnnotationState.scale              = null;
    GeneAnnotationState.customColors       = new Map();
    GeneAnnotationState.loadedURL          = null;

    var labelEl    = el('annotation-file-label');
    var controlsEl = el('annotation-controls');

    if (labelEl)    labelEl.textContent = '';
    if (controlsEl) controlsEl.hidden   = true;

    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.clearGeneAnnotation = clearGeneAnnotation;

  // ─── 9. renderGeneAnnotationLegend ───────────────────────────────────────────

  function renderGeneAnnotationLegend() {
    var legendEl = el('annotation-legend');
    if (!legendEl) return;

    // Clear existing content
    legendEl.innerHTML = '';

    if (!GeneAnnotationState.categoryColumn || !GeneAnnotationState.scale) {
      return;
    }

    if (GeneAnnotationState.selectedCategories.size === 0) {
      return;
    }

    // Title
    var title = document.createElement('div');
    title.className   = 'legend-title';
    title.textContent = GeneAnnotationState.categoryColumn;
    legendEl.appendChild(title);

    var itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'legend-items';

    // Only show selected categories, in sorted order
    var sortedSelected = Array.from(GeneAnnotationState.selectedCategories).sort();
    for (var i = 0; i < sortedSelected.length; i++) {
      var val   = sortedSelected[i];
      var color = GeneAnnotationState.customColors.get(val) || GeneAnnotationState.scale(val);

      var rowEl = document.createElement('div');
      rowEl.className = 'legend-item';

      var swatch = document.createElement('span');
      swatch.className            = 'legend-swatch';
      swatch.style.background     = color;
      swatch.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className   = 'legend-label';
      label.textContent = val;

      rowEl.appendChild(swatch);
      rowEl.appendChild(label);
      itemsWrapper.appendChild(rowEl);
    }

    legendEl.appendChild(itemsWrapper);
  }

  window.renderGeneAnnotationLegend = renderGeneAnnotationLegend;

})();
