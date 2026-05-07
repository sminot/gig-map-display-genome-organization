/**
 * controls.js — Event wiring and UI integration for the Pangenome Viewer.
 *
 * Responsibilities:
 *   - Boot everything on DOMContentLoaded
 *   - Implement window.onDataLoaded (called by app.js after parsing)
 *   - Implement window.onStateChanged (called by app.js after any state mutation)
 *   - Implement window.onGeneAnnotationLoaded (called by annotation.js)
 *   - Implement window.onGenomeAnnotationLoaded (called by genome-annotation.js)
 *   - Populate and keep in sync: #reference-select, #genome-toggles
 *
 * Reads from: AppState, GeneAnnotationState, GenomeAnnotationState
 * Calls:      buildRenderData, drawVisualization, setReference, toggleGenome, etc.
 */

(function () {
  'use strict';

  // ─── Module state ─────────────────────────────────────────────────────────

  // Cached d3 color scale — built once after data loads, reused for toggle dots.
  let colorScale = null;

  // ─── URL query-param state ────────────────────────────────────────────────

  function writeURLParams() {
    const params = new URLSearchParams();

    if (window.AppState && AppState.referenceGenome) {
      params.set('ref', AppState.referenceGenome);

      const hidden = AppState.allGenomes.filter(
        (g) => g !== AppState.referenceGenome && !AppState.visibleGenomes.has(g)
      );
      if (hidden.length > 0) params.set('hidden', hidden.join(','));

      if (AppState.loadedDataURL) params.set('data', AppState.loadedDataURL);
    }

    const wedgeInput = document.getElementById('wedge-span-input');
    if (wedgeInput && wedgeInput.value !== '33') params.set('wedge', wedgeInput.value);

    const gapInput = document.getElementById('wedge-gap-input');
    if (gapInput && gapInput.value !== '6') params.set('gap', gapInput.value);

    if (window.GeneAnnotationState && GeneAnnotationState.activeColumn) {
      params.set('annotCol', GeneAnnotationState.activeColumn);
    }
    if (window.GeneAnnotationState && GeneAnnotationState.loadedURL) {
      params.set('geneAnnot', GeneAnnotationState.loadedURL);
    }

    if (window.GenomeAnnotationState) {
      if (GenomeAnnotationState.colorColumn) params.set('genomeColorCol', GenomeAnnotationState.colorColumn);
      if (GenomeAnnotationState.palette && GenomeAnnotationState.palette !== 'Tableau10') {
        params.set('genomePalette', GenomeAnnotationState.palette);
      }
      if (GenomeAnnotationState.sortColumn) params.set('genomeSortCol', GenomeAnnotationState.sortColumn);
      if (!GenomeAnnotationState.sortAscending) params.set('genomeSortOrder', 'desc');
      if (GenomeAnnotationState.loadedURL) params.set('genomeAnnot', GenomeAnnotationState.loadedURL);
    }

    const str = params.toString();
    history.replaceState(null, '', str ? '?' + str : location.pathname);
  }

  function applyURLParams(scope) {
    const params = new URLSearchParams(location.search);

    if (scope === 'data') {
      const ref = params.get('ref');
      if (ref && AppState.allGenomes.includes(ref) && ref !== AppState.referenceGenome) {
        window.setReference(ref);
        document.getElementById('reference-select').value = ref;
      }

      const hiddenStr = params.get('hidden');
      if (hiddenStr) {
        const hiddenSet = new Set(hiddenStr.split(','));
        for (const g of AppState.allGenomes) {
          if (g === AppState.referenceGenome) continue;
          if (hiddenSet.has(g)) AppState.visibleGenomes.delete(g);
          else AppState.visibleGenomes.add(g);
        }
        buildGenomeToggles();
      }

      const wedgePct = parseInt(params.get('wedge'), 10);
      if (!isNaN(wedgePct) && wedgePct >= 10 && wedgePct <= 50) {
        const input   = document.getElementById('wedge-span-input');
        const display = document.getElementById('wedge-span-display');
        if (input)   input.value = wedgePct;
        if (display) display.textContent = wedgePct + '%';
        if (window.ZoomState) ZoomState.setWedgeSpan(wedgePct / 100);
      }

      const gapPx = parseInt(params.get('gap'), 10);
      if (!isNaN(gapPx) && gapPx >= 0 && gapPx <= 60) {
        const gapInput   = document.getElementById('wedge-gap-input');
        const gapDisplay = document.getElementById('wedge-gap-display');
        if (gapInput)   gapInput.value = gapPx;
        if (gapDisplay) gapDisplay.textContent = gapPx + 'px';
        if (window.ZoomState) ZoomState.setWedgeGap(gapPx);
      }

      // Pre-fill annotation URL fields from params (auto-load happens after annotations load).
      const geneAnnotUrl   = params.get('geneAnnot');
      const genomeAnnotUrl = params.get('genomeAnnot');
      if (geneAnnotUrl) {
        const inp = document.getElementById('gene-annot-url-input');
        if (inp) inp.value = geneAnnotUrl;
        window.loadGeneAnnotationFromURL(geneAnnotUrl);
      }
      if (genomeAnnotUrl) {
        const inp = document.getElementById('genome-annot-url-input');
        if (inp) inp.value = genomeAnnotUrl;
        window.loadGenomeAnnotationFromURL(genomeAnnotUrl);
      }
    }

    if (scope === 'geneAnnotation') {
      const col = params.get('annotCol');
      const sel = document.getElementById('annotation-column-select');
      if (col && sel && [...sel.options].some((o) => o.value === col)) {
        sel.value = col;
        window.setGeneAnnotationColumn(col);
        if (typeof window.renderGeneAnnotationLegend === 'function') window.renderGeneAnnotationLegend();
      }
    }

    if (scope === 'genomeAnnotation') {
      const colorCol    = params.get('genomeColorCol');
      const palette     = params.get('genomePalette');
      const sortCol     = params.get('genomeSortCol');
      const sortOrder   = params.get('genomeSortOrder');

      const colorSel    = document.getElementById('genome-color-column-select');
      const paletteSel  = document.getElementById('genome-palette-select');
      const sortColSel  = document.getElementById('genome-sort-column-select');
      const sortOrdSel  = document.getElementById('genome-sort-order-select');

      if (colorCol && colorSel && [...colorSel.options].some((o) => o.value === colorCol)) {
        colorSel.value = colorCol;
        window.setGenomeColorColumn(colorCol);
      }
      if (palette && paletteSel) {
        paletteSel.value = palette;
        window.setGenomePalette(palette);
      }
      if (sortCol && sortColSel && [...sortColSel.options].some((o) => o.value === sortCol)) {
        sortColSel.value = sortCol;
      }
      if (sortOrder && sortOrdSel) {
        sortOrdSel.value = sortOrder;
      }
      if ((sortCol || sortOrder) && window.setGenomeSortColumn) {
        const col  = sortColSel ? (sortColSel.value || null) : null;
        const asc  = sortOrdSel ? sortOrdSel.value !== 'desc' : true;
        window.setGenomeSortColumn(col, asc);
      }
      if (typeof window.renderGenomeAnnotationLegend === 'function') window.renderGenomeAnnotationLegend();
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    window.initFileUpload();
    window.initViz();
    window.initZoomInteraction();
    window.initWebGLRenderer();
    window.initAnnotationUpload();
    window.initGenomeAnnotationUpload();
    window.initExportButtons();

    // Auto-load data file from ?data= or ?baseUrl= query param.
    const initParams = new URLSearchParams(location.search);
    const initDataURL = initParams.get('data');
    const initBaseURL = initParams.get('baseUrl');
    if (initDataURL) {
      const inp = document.getElementById('data-url-input');
      if (inp) inp.value = initDataURL;
      window.loadFileFromURL(initDataURL);
    } else if (initBaseURL) {
      let base = initBaseURL;
      if (!base.endsWith('/')) base += '/';
      const dataURL = base + 'genomes.aln.csv.gz';
      const inp = document.getElementById('data-url-input');
      const baseInp = document.getElementById('base-url-input');
      const geneInp = document.getElementById('gene-annot-url-input');
      const genomeInp = document.getElementById('genome-annot-url-input');
      if (inp)       inp.value       = dataURL;
      if (baseInp)   baseInp.value   = initBaseURL;
      if (geneInp)   geneInp.value   = base + 'gene_annotations.csv';
      if (genomeInp) genomeInp.value = base + 'genome_annotations.csv';
      window.loadFileFromURL(dataURL);
    }

    // Reference genome selector
    document.getElementById('reference-select').addEventListener('change', (e) => {
      window.setReference(e.target.value);
      buildGenomeToggles();
    });

    // Gene annotation column selector
    const annotColSelect = document.getElementById('annotation-column-select');
    if (annotColSelect) {
      annotColSelect.addEventListener('change', (e) => {
        const col = e.target.value;
        if (col) {
          window.setGeneAnnotationColumn(col);
        } else {
          // Deselect column without discarding the loaded file data.
          window.clearGeneAnnotationColumn();
        }
        window.renderGeneAnnotationLegend();
      });
    }

    // Genome annotation column selectors
    const genomeColorSelect = document.getElementById('genome-color-column-select');
    if (genomeColorSelect) {
      genomeColorSelect.addEventListener('change', (e) => {
        window.setGenomeColorColumn(e.target.value || null);
        window.renderGenomeAnnotationLegend();
      });
    }

    const genomePaletteSelect = document.getElementById('genome-palette-select');
    if (genomePaletteSelect) {
      genomePaletteSelect.addEventListener('change', (e) => {
        window.setGenomePalette(e.target.value);
        window.renderGenomeAnnotationLegend();
      });
    }

    const genomeSortColSelect = document.getElementById('genome-sort-column-select');
    if (genomeSortColSelect) {
      genomeSortColSelect.addEventListener('change', () => {
        const col = genomeSortColSelect.value || null;
        const asc = document.getElementById('genome-sort-order-select').value !== 'desc';
        window.setGenomeSortColumn(col, asc);
      });
    }

    const genomeSortOrderSelect = document.getElementById('genome-sort-order-select');
    if (genomeSortOrderSelect) {
      genomeSortOrderSelect.addEventListener('change', () => {
        const col = document.getElementById('genome-sort-column-select').value || null;
        const asc = genomeSortOrderSelect.value !== 'desc';
        window.setGenomeSortColumn(col, asc);
      });
    }

    // Wedge span slider
    const wedgeSpanInput   = document.getElementById('wedge-span-input');
    const wedgeSpanDisplay = document.getElementById('wedge-span-display');
    if (wedgeSpanInput) {
      wedgeSpanInput.addEventListener('input', () => {
        const pct = parseInt(wedgeSpanInput.value, 10);
        if (wedgeSpanDisplay) wedgeSpanDisplay.textContent = pct + '%';
        if (window.ZoomState) window.ZoomState.setWedgeSpan(pct / 100);
        writeURLParams();
      });
    }

    // Gap slider
    const wedgeGapInput   = document.getElementById('wedge-gap-input');
    const wedgeGapDisplay = document.getElementById('wedge-gap-display');
    if (wedgeGapInput) {
      wedgeGapInput.addEventListener('input', () => {
        const px = parseInt(wedgeGapInput.value, 10);
        if (wedgeGapDisplay) wedgeGapDisplay.textContent = px + 'px';
        if (window.ZoomState) ZoomState.setWedgeGap(px);
        const rd = window.getLastRenderData ? window.getLastRenderData() : null;
        if (rd && typeof window.drawVisualization === 'function') window.drawVisualization(rd);
        writeURLParams();
      });
    }

    // Reset zoom button
    const resetZoomBtn = document.getElementById('reset-zoom-btn');
    if (resetZoomBtn) {
      resetZoomBtn.addEventListener('click', () => {
        if (window.ZoomState) window.ZoomState.resetZoom();
      });
    }

    // ── URL loading buttons ──────────────────────────────────────────────────

    function wireURLBtn(btnId, inputId, loader) {
      const btn = document.getElementById(btnId);
      const inp = document.getElementById(inputId);
      if (!btn || !inp) return;
      btn.addEventListener('click', () => {
        const url = inp.value.trim();
        if (url) loader(url);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const url = inp.value.trim(); if (url) loader(url); }
      });
    }

    wireURLBtn('data-url-btn',       'data-url-input',        (url) => window.loadFileFromURL(url));
    wireURLBtn('gene-annot-url-btn', 'gene-annot-url-input',  (url) => window.loadGeneAnnotationFromURL(url));
    wireURLBtn('genome-annot-url-btn','genome-annot-url-input',(url) => window.loadGenomeAnnotationFromURL(url));

    // Base URL: fill data URL field and trigger load; pre-fill annotation URL fields.
    const baseUrlBtn = document.getElementById('base-url-btn');
    const baseUrlInput = document.getElementById('base-url-input');
    if (baseUrlBtn && baseUrlInput) {
      baseUrlBtn.addEventListener('click', () => {
        let base = baseUrlInput.value.trim();
        if (!base) return;
        if (!base.endsWith('/')) base += '/';

        const dataInput = document.getElementById('data-url-input');
        const geneInput = document.getElementById('gene-annot-url-input');
        const genomeInput = document.getElementById('genome-annot-url-input');

        if (dataInput)   dataInput.value   = base + 'genomes.aln.csv.gz';
        if (geneInput)   geneInput.value   = base + 'gene_annotations.csv';
        if (genomeInput) genomeInput.value = base + 'genome_annotations.csv';

        window.loadFileFromURL(base + 'genomes.aln.csv.gz');
      });
    }
  });

  // ─── Callbacks for app.js ─────────────────────────────────────────────────

  /**
   * Called by app.js after the CSV has been parsed and AppState is populated.
   */
  window.onDataLoaded = function () {
    colorScale = d3
      .scaleOrdinal(d3.schemeTableau10.concat(d3.schemePastel1))
      .domain(AppState.allGenomes);

    // Populate reference genome selector
    const select = document.getElementById('reference-select');
    select.innerHTML = '';
    for (const genome of AppState.allGenomes) {
      const option = document.createElement('option');
      option.value = genome;
      option.textContent = shortenName(genome);
      option.title = genome;
      select.appendChild(option);
    }
    select.value = AppState.referenceGenome;

    buildGenomeToggles();

    document.getElementById('controls-panel').hidden = false;

    applyURLParams('data');
    window.onStateChanged();
  };

  /**
   * Called by app.js after any AppState mutation (reference change or toggle).
   */
  window.onStateChanged = function () {
    const renderData = window.buildRenderData();
    window.drawVisualization(renderData);
    if (typeof window.renderGeneAnnotationLegend === 'function') {
      window.renderGeneAnnotationLegend();
    }
    if (typeof window.renderGenomeAnnotationLegend === 'function') {
      window.renderGenomeAnnotationLegend();
    }
    writeURLParams();
  };

  // ─── Callbacks for annotation.js ──────────────────────────────────────────

  /**
   * Called by annotation.js after a gene annotation file is parsed.
   * Populates the column selector and shows annotation controls.
   */
  window.onGeneAnnotationLoaded = function () {
    const select     = document.getElementById('annotation-column-select');
    const controlsEl = document.getElementById('annotation-controls');
    if (!select || !controlsEl) return;

    // Rebuild options
    select.innerHTML = '<option value="">— none —</option>';
    for (const col of GeneAnnotationState.columns) {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      select.appendChild(opt);
    }
    select.value = GeneAnnotationState.activeColumn || '';

    controlsEl.hidden = false;

    // Auto-select first column if only one
    if (GeneAnnotationState.columns.length === 1) {
      select.value = GeneAnnotationState.columns[0];
      window.setGeneAnnotationColumn(GeneAnnotationState.columns[0]);
    }

    applyURLParams('geneAnnotation');
    window.renderGeneAnnotationLegend();
  };

  // ─── Callbacks for genome-annotation.js ───────────────────────────────────

  /**
   * Called by genome-annotation.js after a genome annotation file is parsed.
   */
  window.onGenomeAnnotationLoaded = function () {
    const colorSelect  = document.getElementById('genome-color-column-select');
    const sortSelect   = document.getElementById('genome-sort-column-select');
    const controlsEl   = document.getElementById('genome-annotation-controls');
    if (!colorSelect || !sortSelect || !controlsEl) return;

    // Rebuild column options for both selects
    const noneOpt = '<option value="">— none —</option>';
    colorSelect.innerHTML = noneOpt;
    sortSelect.innerHTML  = noneOpt;

    for (const col of GenomeAnnotationState.columns) {
      const mkOpt = () => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        return opt;
      };
      colorSelect.appendChild(mkOpt());
      sortSelect.appendChild(mkOpt());
    }

    colorSelect.value = GenomeAnnotationState.colorColumn || '';
    sortSelect.value  = GenomeAnnotationState.sortColumn  || '';

    document.getElementById('genome-palette-select').value =
      GenomeAnnotationState.palette || 'Tableau10';

    document.getElementById('genome-sort-order-select').value =
      GenomeAnnotationState.sortAscending ? 'asc' : 'desc';

    controlsEl.hidden = false;

    // Auto-select first column
    if (GenomeAnnotationState.columns.length === 1) {
      colorSelect.value = GenomeAnnotationState.columns[0];
      window.setGenomeColorColumn(GenomeAnnotationState.columns[0]);
    }

    applyURLParams('genomeAnnotation');
    window.renderGenomeAnnotationLegend();
  };

  // ─── DOM builders ─────────────────────────────────────────────────────────

  function buildGenomeToggles() {
    const container = document.getElementById('genome-toggles');
    container.innerHTML = '';

    const nonRefGenomes = AppState.allGenomes
      .filter((g) => g !== AppState.referenceGenome)
      .sort();

    if (nonRefGenomes.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:12px;color:var(--color-text-muted);padding:4px 0';
      empty.textContent = 'No other genomes loaded.';
      container.appendChild(empty);
      return;
    }

    // Select All / Deselect All buttons
    const bulkRow = document.createElement('div');
    bulkRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';

    const allBtn  = makeTextButton('All',  () => setBulkVisibility(nonRefGenomes, true));
    const noneBtn = makeTextButton('None', () => setBulkVisibility(nonRefGenomes, false));
    bulkRow.appendChild(allBtn);
    bulkRow.appendChild(noneBtn);
    container.appendChild(bulkRow);

    for (const genome of nonRefGenomes) {
      const color     = colorScale ? colorScale(genome) : '#888888';
      const isVisible = AppState.visibleGenomes.has(genome);

      const label = document.createElement('label');
      label.className = 'genome-toggle-label';
      label.style.setProperty('--genome-color', color);

      const checkbox = document.createElement('input');
      checkbox.type      = 'checkbox';
      checkbox.className = 'genome-toggle-checkbox';
      checkbox.checked   = isVisible;
      checkbox.addEventListener('change', () => {
        window.toggleGenome(genome, checkbox.checked);
      });

      const dot = document.createElement('span');
      dot.className = 'genome-color-dot';

      const nameSpan = document.createElement('span');
      nameSpan.className  = 'genome-name';
      nameSpan.textContent = shortenName(genome);
      nameSpan.title       = genome;

      label.appendChild(checkbox);
      label.appendChild(dot);
      label.appendChild(nameSpan);
      container.appendChild(label);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function setBulkVisibility(genomes, visible) {
    for (const g of genomes) {
      if (visible) {
        AppState.visibleGenomes.add(g);
      } else {
        AppState.visibleGenomes.delete(g);
      }
    }

    const checkboxes = document.querySelectorAll('#genome-toggles input[type="checkbox"]');
    checkboxes.forEach((cb) => { cb.checked = visible; });

    window.onStateChanged();
  }

  function makeTextButton(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'font-size:11px',
      'padding:2px 8px',
      'background:var(--color-surface)',
      'border:1px solid var(--color-border)',
      'border-radius:var(--radius-sm)',
      'color:var(--color-text-muted)',
      'cursor:pointer',
      'transition:background-color var(--transition-fast)',
    ].join(';');
    btn.addEventListener('mouseover', () => {
      btn.style.backgroundColor = 'var(--color-surface-hover)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.backgroundColor = 'var(--color-surface)';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function shortenName(genome) {
    return genome.replace(/_genomic\.fna\.gz$/, '').replace(/\.fna\.gz$/, '');
  }
})();
