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
  function _buildOrdinalScale(colName) {
    if (!colName) return { scale: null, domain: [] };
    var seen = new Set(), values = [];
    GenomeAnnotationState.rawData.forEach(function(row) {
      var v = row[colName];
      if (v !== null && v !== undefined && v !== '') {
        var s = String(v);
        if (!seen.has(s)) { seen.add(s); values.push(s); }
      }
    });
    values.sort();
    return {
      scale:  d3.scaleOrdinal(window.getPalette(GenomeAnnotationState.palette)).domain(values),
      domain: values,
    };
  }

  function rebuildColorScale() {
    var r = _buildOrdinalScale(GenomeAnnotationState.colorColumn);
    GenomeAnnotationState.scale  = r.scale;
    GenomeAnnotationState.domain = r.domain;
  }

  function rebuildGroupScale() {
    var r = _buildOrdinalScale(GenomeAnnotationState.groupColumn);
    GenomeAnnotationState.groupScale  = r.scale;
    GenomeAnnotationState.groupDomain = r.domain;
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

  // ─── 2. loadGenomeAnnotationFile / loadGenomeAnnotationFromURL ───────────────

  function _applyGenomeAnnotationText(text, label, loadedURL) {
    var result = Papa.parse(text, {
      header:         true,
      dynamicTyping:  true,
      skipEmptyLines: true,
      delimiter:      '',
      transform:      function (v) { return typeof v === 'string' ? v.trim() : v; },
    });

    if (!result.meta || !result.meta.fields || result.meta.fields.length < 1) {
      throw new Error('Could not detect columns in the genome annotation file.');
    }

    var fields   = result.meta.fields;
    var idField  = fields.indexOf('genome_id') !== -1 ? 'genome_id' : fields[0];
    var dataCols = fields.filter(function(f) { return f !== idField; });

    var rawData = new Map();
    for (var i = 0; i < result.data.length; i++) {
      var row      = result.data[i];
      var rawId    = row[idField];
      if (rawId === null || rawId === undefined) continue;
      var genomeId = String(rawId).trim();
      if (!genomeId) continue;
      rawData.set(genomeId, row);
    }

    GenomeAnnotationState.rawData       = rawData;
    GenomeAnnotationState.columns       = dataCols;
    GenomeAnnotationState.colorColumn   = null;
    GenomeAnnotationState.groupColumn   = null;
    GenomeAnnotationState.groupScale    = null;
    GenomeAnnotationState.groupDomain   = [];
    GenomeAnnotationState.labelColumn    = null;
    GenomeAnnotationState.tooltipColumns = [];
    GenomeAnnotationState.sortColumn     = null;
    GenomeAnnotationState.sortAscending  = true;
    GenomeAnnotationState.scale          = null;
    GenomeAnnotationState.domain         = [];
    GenomeAnnotationState.loadedURL      = loadedURL;

    var labelEl = el('genome-annotation-file-label');
    if (labelEl) labelEl.textContent = label;

    if (typeof window.onGenomeAnnotationLoaded === 'function') {
      window.onGenomeAnnotationLoaded();
    }
  }

  async function loadGenomeAnnotationFile(file) {
    var errorEl = el('genome-annotation-error');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readFileAsText(file);
      _applyGenomeAnnotationText(text, file.name, null);
    } catch (err) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
    }
  }

  async function loadGenomeAnnotationFromURL(url, silent) {
    var errorEl = el('genome-annotation-error');
    if (!silent && errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    try {
      var text = await window.readURLAsText(url);
      _applyGenomeAnnotationText(text, url.split('/').pop(), url);
    } catch (err) {
      if (!silent && errorEl) { errorEl.hidden = false; errorEl.textContent = err.message || String(err); }
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

  // ─── 4. setGenomeGroupColumn ─────────────────────────────────────────────────

  function setGenomeGroupColumn(colName) {
    GenomeAnnotationState.groupColumn = colName || null;
    rebuildGroupScale();
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGenomeGroupColumn = setGenomeGroupColumn;

  // ─── 5. setGenomeLabelColumn ─────────────────────────────────────────────────

  function setGenomeLabelColumn(colName) {
    GenomeAnnotationState.labelColumn = colName || null;
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGenomeLabelColumn = setGenomeLabelColumn;

  // ─── 6. setGenomeTooltipColumns ──────────────────────────────────────────────

  function setGenomeTooltipColumns(cols) {
    GenomeAnnotationState.tooltipColumns = Array.isArray(cols) ? cols.slice() : [];
    if (typeof window.onStateChanged === 'function') window.onStateChanged();
  }

  window.setGenomeTooltipColumns = setGenomeTooltipColumns;

  // ─── 7. setGenomeSortColumn ───────────────────────────────────────────────────

  function setGenomeSortColumn(colName, ascending) {
    GenomeAnnotationState.sortColumn    = colName;
    GenomeAnnotationState.sortAscending = ascending !== false; // default true

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGenomeSortColumn = setGenomeSortColumn;

  // ─── 7. setGenomePalette ──────────────────────────────────────────────────────

  function setGenomePalette(paletteName) {
    GenomeAnnotationState.palette = paletteName;

    // Rebuild scale only if a color column is already active
    if (GenomeAnnotationState.colorColumn) {
      rebuildColorScale();
    }
    if (GenomeAnnotationState.groupColumn) { rebuildGroupScale(); }

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.setGenomePalette = setGenomePalette;

  // ─── 8. clearGenomeAnnotation ─────────────────────────────────────────────────

  function clearGenomeAnnotation() {
    GenomeAnnotationState.rawData       = new Map();
    GenomeAnnotationState.columns       = [];
    GenomeAnnotationState.colorColumn   = null;
    GenomeAnnotationState.groupColumn   = null;
    GenomeAnnotationState.groupScale    = null;
    GenomeAnnotationState.groupDomain   = [];
    GenomeAnnotationState.labelColumn    = null;
    GenomeAnnotationState.tooltipColumns = [];
    GenomeAnnotationState.sortColumn     = null;
    GenomeAnnotationState.sortAscending  = true;
    GenomeAnnotationState.palette        = 'Tableau10';
    GenomeAnnotationState.scale         = null;
    GenomeAnnotationState.domain        = [];
    GenomeAnnotationState.loadedURL     = null;

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  window.clearGenomeAnnotation = clearGenomeAnnotation;

  // ─── 9. getGenomeAnnotationColor ─────────────────────────────────────────────

  function getGenomeAnnotationColor(genomeId) {
    if (GenomeAnnotationState.groupColumn && GenomeAnnotationState.groupScale) {
      var row = GenomeAnnotationState.rawData.get(String(genomeId));
      if (!row) return null;
      var val = row[GenomeAnnotationState.groupColumn];
      if (val === null || val === undefined || val === '') return null;
      return GenomeAnnotationState.groupScale(String(val));
    }
    if (!GenomeAnnotationState.colorColumn || !GenomeAnnotationState.scale) return null;
    var row = GenomeAnnotationState.rawData.get(String(genomeId));
    if (!row) return null;
    var value = row[GenomeAnnotationState.colorColumn];
    if (value === null || value === undefined || value === '') return null;
    return GenomeAnnotationState.scale(String(value));
  }

  window.getGenomeAnnotationColor = getGenomeAnnotationColor;

  // ─── 10. getGenomeSortedOrder ────────────────────────────────────────────────

  function getGenomeSortedOrder(genomes) {
    var groupCol = GenomeAnnotationState.groupColumn;
    if (groupCol) {
      // groupColumn always wins — falls through to existing group-sort code below
      var rawData = GenomeAnnotationState.rawData;
      return genomes.slice().sort(function(a, b) {
        var rowA = rawData.get(String(a));
        var rowB = rawData.get(String(b));
        var gA = (rowA && rowA[groupCol] != null) ? String(rowA[groupCol]) : '';
        var gB = (rowB && rowB[groupCol] != null) ? String(rowB[groupCol]) : '';
        var cmp = gA.localeCompare(gB);
        return cmp !== 0 ? cmp : String(a).localeCompare(String(b));
      });
    }
    if (!GenomeAnnotationState.sortColumn) {
      if (window.AppState && AppState.customGenomeOrder) {
        var orderMap = new Map();
        AppState.customGenomeOrder.forEach(function(g, i) { orderMap.set(g, i); });
        return genomes.slice().sort(function(a, b) {
          var hasA = orderMap.has(a), hasB = orderMap.has(b);
          if (hasA && hasB) return orderMap.get(a) - orderMap.get(b);
          if (hasA) return -1;
          if (hasB) return 1;
          return String(a).localeCompare(String(b));
        });
      }
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

  // ─── 11. renderGenomeAnnotationLegend ────────────────────────────────────────

  function renderGenomeAnnotationLegend() {
    var legendEl = el('genome-annotation-legend');
    if (!legendEl) return;

    legendEl.innerHTML = '';

    var useGroup    = !!(GenomeAnnotationState.groupColumn && GenomeAnnotationState.groupScale);
    var legendCol   = useGroup ? GenomeAnnotationState.groupColumn  : GenomeAnnotationState.colorColumn;
    var legendScale = useGroup ? GenomeAnnotationState.groupScale   : GenomeAnnotationState.scale;
    var legendDomain = useGroup ? GenomeAnnotationState.groupDomain : GenomeAnnotationState.domain;

    if (!legendCol || !legendScale) { legendEl.innerHTML = ''; return; }

    var title = document.createElement('div');
    title.className   = 'legend-title';
    title.textContent = legendCol;
    legendEl.appendChild(title);

    var itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'legend-items';

    for (var i = 0; i < legendDomain.length; i++) {
      var val   = legendDomain[i];
      var color = legendScale(val);

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
