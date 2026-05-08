/**
 * annotation.js — Gene-level annotation overlay for the Pangenome Viewer.
 *
 * Responsibilities:
 *   - File upload / drag-and-drop wiring     (initAnnotationUpload)
 *   - Gzip detection + CSV parsing           (loadGeneAnnotationFile)
 *   - Column activation and scale building   (setGeneAnnotationColumn)
 *   - Per-gene color and value lookups       (getGeneAnnotationColor, etc.)
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

  // ─── 2. loadGeneAnnotationFile ────────────────────────────────────────────────

  async function loadGeneAnnotationFile(file) {
    var errorEl = el('annotation-error');
    var labelEl = el('annotation-file-label');

    if (errorEl) {
      errorEl.hidden = true;
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
        throw new Error('Could not detect columns in the annotation file.');
      }

      var fields    = result.meta.fields;
      var idField   = fields[0];
      var dataCols  = fields.slice(1);

      // Build rawData map: geneId → row object
      var rawData = new Map();
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        var geneId = String(row[idField]);
        if (geneId) rawData.set(geneId, row);
      }

      // Commit to shared state
      GeneAnnotationState.rawData  = rawData;
      GeneAnnotationState.columns  = dataCols;

      // Reset column-level state from any previous load
      GeneAnnotationState.activeColumn = null;
      GeneAnnotationState.columnType   = null;
      GeneAnnotationState.scale        = null;
      GeneAnnotationState.domain       = [];

      // Update label
      if (labelEl) labelEl.textContent = file.name;
      GeneAnnotationState.loadedURL = null;

      // Notify the app
      if (typeof window.onGeneAnnotationLoaded === 'function') {
        window.onGeneAnnotationLoaded();
      }

    } catch (err) {
      if (errorEl) {
        errorEl.hidden      = false;
        errorEl.textContent = err.message || String(err);
      }
    }
  }

  async function loadGeneAnnotationFromURL(url) {
    var errorEl = el('annotation-error');
    var labelEl = el('annotation-file-label');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readURLAsText(url);
      // Reuse the same parsing logic via a synthetic file-like flow.
      // Build a Blob so we can delegate to the existing text-handling path.
      var result = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true, delimiter: '' });
      if (!result.meta || !result.meta.fields || result.meta.fields.length < 1)
        throw new Error('Could not detect columns in the annotation file.');
      var fields   = result.meta.fields;
      var idField  = fields[0];
      var dataCols = fields.slice(1);
      var rawData  = new Map();
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        var geneId = String(row[idField]);
        if (geneId) rawData.set(geneId, row);
      }
      GeneAnnotationState.rawData      = rawData;
      GeneAnnotationState.columns      = dataCols;
      GeneAnnotationState.activeColumn = null;
      GeneAnnotationState.columnType   = null;
      GeneAnnotationState.scale        = null;
      GeneAnnotationState.domain       = [];
      GeneAnnotationState.loadedURL    = url;
      if (labelEl) labelEl.textContent = url.split('/').pop();
      if (typeof window.onGeneAnnotationLoaded === 'function') window.onGeneAnnotationLoaded();
    } catch (err) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
    }
  }

  window.loadGeneAnnotationFile    = loadGeneAnnotationFile;
  window.loadGeneAnnotationFromURL = loadGeneAnnotationFromURL;

  // ─── 3. setGeneAnnotationColumn ───────────────────────────────────────────────

  function setGeneAnnotationColumn(colName) {
    GeneAnnotationState.activeColumn = colName;

    // Collect all non-null values for this column
    var values = [];
    GeneAnnotationState.rawData.forEach(function (row) {
      var v = row[colName];
      if (v !== null && v !== undefined && v !== '') {
        values.push(v);
      }
    });

    // Determine type: continuous if every non-null value is a finite number
    var isContinuous = values.length > 0 && values.every(function (v) {
      return typeof v === 'number' && isFinite(v);
    });

    if (isContinuous) {
      GeneAnnotationState.columnType = 'continuous';

      var min = d3.min(values);
      var max = d3.max(values);
      GeneAnnotationState.domain = [min, max];
      GeneAnnotationState.scale  = d3
        .scaleSequential(d3.interpolateViridis)
        .domain([min, max]);

    } else {
      GeneAnnotationState.columnType = 'categorical';

      // Sort unique string values for a stable legend order
      var unique = Array.from(new Set(values.map(function (v) { return String(v); }))).sort();
      GeneAnnotationState.domain = unique;
      GeneAnnotationState.scale  = d3
        .scaleOrdinal(window.getPalette(GeneAnnotationState.paletteOverride || 'Tableau10'))
        .domain(unique);
    }

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGeneAnnotationColumn = setGeneAnnotationColumn;

  // ─── 4. clearGeneAnnotationColumn / clearGeneAnnotation ─────────────────────

  // Deactivates the column (scale, domain) without discarding the loaded file data.
  function clearGeneAnnotationColumn() {
    GeneAnnotationState.activeColumn = null;
    GeneAnnotationState.columnType   = null;
    GeneAnnotationState.scale        = null;
    GeneAnnotationState.domain       = [];

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.clearGeneAnnotationColumn = clearGeneAnnotationColumn;

  function clearGeneAnnotation() {
    GeneAnnotationState.rawData      = new Map();
    GeneAnnotationState.columns      = [];
    GeneAnnotationState.activeColumn = null;
    GeneAnnotationState.columnType   = null;
    GeneAnnotationState.scale        = null;
    GeneAnnotationState.domain       = [];

    var labelEl    = el('annotation-file-label');
    var controlsEl = el('annotation-controls');

    if (labelEl)    labelEl.textContent = '';
    if (controlsEl) controlsEl.hidden   = true;

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.clearGeneAnnotation = clearGeneAnnotation;

  // ─── 5. getGeneAnnotationColor ────────────────────────────────────────────────

  function getGeneAnnotationColor(geneId) {
    if (!GeneAnnotationState.activeColumn || !GeneAnnotationState.scale) {
      return null;
    }

    var row = GeneAnnotationState.rawData.get(String(geneId));
    if (!row) return null;

    var value = row[GeneAnnotationState.activeColumn];
    if (value === null || value === undefined || value === '') return null;

    if (GeneAnnotationState.columnType === 'categorical') {
      return GeneAnnotationState.scale(String(value));
    }

    if (GeneAnnotationState.columnType === 'continuous') {
      var num = typeof value === 'number' ? value : parseFloat(value);
      if (!isFinite(num)) return null;
      return GeneAnnotationState.scale(num);
    }

    return null;
  }

  window.getGeneAnnotationColor = getGeneAnnotationColor;

  // ─── 6. getGeneAnnotationBarFraction ──────────────────────────────────────────

  function getGeneAnnotationBarFraction(geneId) {
    if (GeneAnnotationState.columnType !== 'continuous' || !GeneAnnotationState.scale) {
      return null;
    }

    var row = GeneAnnotationState.rawData.get(String(geneId));
    if (!row) return null;

    var value = row[GeneAnnotationState.activeColumn];
    if (value === null || value === undefined || value === '') return null;

    var num = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(num)) return null;

    var domain = GeneAnnotationState.domain; // [min, max]
    var min    = domain[0];
    var max    = domain[1];
    if (max === min) return 1; // avoid division by zero

    return (num - min) / (max - min);
  }

  window.getGeneAnnotationBarFraction = getGeneAnnotationBarFraction;

  // ─── 7. getGeneAnnotationValue ────────────────────────────────────────────────

  function getGeneAnnotationValue(geneId) {
    if (!GeneAnnotationState.activeColumn) return null;

    var row = GeneAnnotationState.rawData.get(String(geneId));
    if (!row) return null;

    var value = row[GeneAnnotationState.activeColumn];
    if (value === null || value === undefined || value === '') return null;

    return value;
  }

  window.getGeneAnnotationValue = getGeneAnnotationValue;

  // ─── 8. renderGeneAnnotationLegend ───────────────────────────────────────────

  function renderGeneAnnotationLegend() {
    var legendEl = el('annotation-legend');
    if (!legendEl) return;

    // Clear existing content
    legendEl.innerHTML = '';

    if (!GeneAnnotationState.activeColumn || !GeneAnnotationState.scale) {
      return;
    }

    // Title
    var title = document.createElement('div');
    title.className   = 'legend-title';
    title.textContent = GeneAnnotationState.activeColumn;
    legendEl.appendChild(title);

    if (GeneAnnotationState.columnType === 'categorical') {
      var itemsWrapper = document.createElement('div');
      itemsWrapper.className = 'legend-items';

      var domain = GeneAnnotationState.domain;
      for (var i = 0; i < domain.length; i++) {
        var val   = domain[i];
        var color = GeneAnnotationState.scale(val);

        var row = document.createElement('div');
        row.className = 'legend-item';

        var swatch = document.createElement('span');
        swatch.className            = 'legend-swatch';
        swatch.style.background     = color;
        swatch.setAttribute('aria-hidden', 'true');

        var label = document.createElement('span');
        label.className   = 'legend-label';
        label.textContent = val;

        row.appendChild(swatch);
        row.appendChild(label);
        itemsWrapper.appendChild(row);
      }

      legendEl.appendChild(itemsWrapper);

    } else if (GeneAnnotationState.columnType === 'continuous') {
      var contWrapper = document.createElement('div');
      contWrapper.className = 'legend-continuous';

      var gradBar = document.createElement('div');
      gradBar.className  = 'legend-gradient-bar';
      // Approximate viridis with known CSS stops
      gradBar.style.background =
        'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)';
      gradBar.setAttribute('aria-hidden', 'true');

      var labelsRow = document.createElement('div');
      labelsRow.className = 'legend-gradient-labels';

      var minLabel = document.createElement('span');
      minLabel.className   = 'legend-gradient-min';
      minLabel.textContent = GeneAnnotationState.domain[0];

      var maxLabel = document.createElement('span');
      maxLabel.className   = 'legend-gradient-max';
      maxLabel.textContent = GeneAnnotationState.domain[1];

      labelsRow.appendChild(minLabel);
      labelsRow.appendChild(maxLabel);

      contWrapper.appendChild(gradBar);
      contWrapper.appendChild(labelsRow);
      legendEl.appendChild(contWrapper);
    }
  }

  window.renderGeneAnnotationLegend = renderGeneAnnotationLegend;

})();
