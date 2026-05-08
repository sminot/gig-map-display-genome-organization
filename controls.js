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

    const heightInput = document.getElementById('wedge-height-input');
    if (heightInput && parseFloat(heightInput.value) !== 2.0) params.set('wedgeHeight', heightInput.value);

    if (window.ZoomState && ZoomState._targetZoomLevel > 1.05) {
      params.set('zoomLevel', ZoomState._targetZoomLevel.toFixed(2));
      const fa = ZoomState._targetFocusAngle !== undefined ? ZoomState._targetFocusAngle : ZoomState.focusAngle;
      params.set('focusAngle', (fa * 180 / Math.PI).toFixed(2));
    }

    if (window.GeneAnnotationState) {
      if (GeneAnnotationState.loadedURL) params.set('geneAnnot', GeneAnnotationState.loadedURL);
      if (GeneAnnotationState.categoryColumn) params.set('annotCategoryCol', GeneAnnotationState.categoryColumn);
      if (GeneAnnotationState.labelColumn) params.set('annotLabelCol', GeneAnnotationState.labelColumn);
      if (GeneAnnotationState.selectedCategories && GeneAnnotationState.selectedCategories.size > 0) {
        params.set('annotSelected', Array.from(GeneAnnotationState.selectedCategories).join(','));
      }
      if (GeneAnnotationState.displayMode && GeneAnnotationState.displayMode !== 'bars') {
        params.set('annotDisplayMode', GeneAnnotationState.displayMode);
      }
    }

    if (window.GenomeAnnotationState) {
      if (GenomeAnnotationState.loadedURL) params.set('genomeAnnot', GenomeAnnotationState.loadedURL);
      if (GenomeAnnotationState.colorColumn) params.set('genomeColorCol', GenomeAnnotationState.colorColumn);
      if (GenomeAnnotationState.groupColumn) params.set('genomeGroupCol', GenomeAnnotationState.groupColumn);
      if (GenomeAnnotationState.labelColumn) params.set('genomeLabelCol', GenomeAnnotationState.labelColumn);
      if (GenomeAnnotationState.palette && GenomeAnnotationState.palette !== 'Tableau10') {
        params.set('genomePalette', GenomeAnnotationState.palette);
      }
      if (GenomeAnnotationState.sortColumn) params.set('genomeSortCol', GenomeAnnotationState.sortColumn);
      if (!GenomeAnnotationState.sortAscending) params.set('genomeSortOrder', 'desc');
    }

    const str = params.toString();
    history.replaceState(null, '', str ? '?' + str : location.pathname);
  }

  window.writeURLParams = writeURLParams;

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

      const heightScale = parseFloat(params.get('wedgeHeight'));
      if (!isNaN(heightScale) && heightScale >= 2 && heightScale <= 10) {
        const hInput   = document.getElementById('wedge-height-input');
        const hDisplay = document.getElementById('wedge-height-display');
        if (hInput)   hInput.value = heightScale;
        if (hDisplay) hDisplay.textContent = heightScale.toFixed(1) + '×';
        if (window.ZoomState) ZoomState.setWedgeHeightScale(heightScale);
      }

      const zoomLevelParam = parseFloat(params.get('zoomLevel'));
      if (!isNaN(zoomLevelParam) && zoomLevelParam > 1 && window.ZoomState) {
        ZoomState.setZoomLevel(zoomLevelParam);
        const focusAngleDeg = parseFloat(params.get('focusAngle'));
        if (!isNaN(focusAngleDeg)) {
          ZoomState.setFocusAngle(focusAngleDeg * Math.PI / 180);
        }
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
      const catCol = params.get('annotCategoryCol');
      const catSel = document.getElementById('annotation-category-column-select');
      if (catCol && catSel && [...catSel.options].some(o => o.value === catCol)) {
        catSel.value = catCol;
        window.setGeneAnnotationCategoryColumn(catCol);
      }
      const labelCol = params.get('annotLabelCol');
      const labelSel = document.getElementById('annotation-name-column-select');
      if (labelCol && labelSel && [...labelSel.options].some(o => o.value === labelCol)) {
        labelSel.value = labelCol;
        if (window.GeneAnnotationState) GeneAnnotationState.labelColumn = labelCol;
      }
      const selectedStr = params.get('annotSelected');
      if (selectedStr) {
        const arr = selectedStr.split(',').filter(Boolean);
        window.setGeneAnnotationSelectedCategories(arr);
      }
      const displayMode = params.get('annotDisplayMode');
      if (displayMode && typeof window.setGeneAnnotationDisplayMode === 'function') {
        window.setGeneAnnotationDisplayMode(displayMode);
        const barsBtn   = document.getElementById('annot-mode-bars');
        const arrowsBtn = document.getElementById('annot-mode-arrows');
        if (barsBtn)   barsBtn.classList.toggle('active', displayMode !== 'arrows');
        if (arrowsBtn) arrowsBtn.classList.toggle('active', displayMode === 'arrows');
      }
    }

    if (scope === 'genomeAnnotation') {
      const colorCol    = params.get('genomeColorCol');
      const labelCol    = params.get('genomeLabelCol');
      const palette     = params.get('genomePalette');
      const sortCol     = params.get('genomeSortCol');
      const sortOrder   = params.get('genomeSortOrder');

      const colorSel    = document.getElementById('genome-color-column-select');
      const labelSel    = document.getElementById('genome-name-column-select');
      const paletteSel  = document.getElementById('genome-palette-select');
      const sortColSel  = document.getElementById('genome-sort-column-select');
      const sortOrdSel  = document.getElementById('genome-sort-order-select');

      if (colorCol && colorSel && [...colorSel.options].some((o) => o.value === colorCol)) {
        colorSel.value = colorCol;
        window.setGenomeColorColumn(colorCol);
      }
      if (labelCol && labelSel && [...labelSel.options].some((o) => o.value === labelCol)) {
        labelSel.value = labelCol;
        if (window.setGenomeLabelColumn) window.setGenomeLabelColumn(labelCol);
      }
      const groupCol = params.get('genomeGroupCol');
      const groupSel = document.getElementById('genome-group-column-select');
      if (groupCol && groupSel && [...groupSel.options].some(o => o.value === groupCol)) {
        groupSel.value = groupCol;
        if (window.setGenomeGroupColumn) window.setGenomeGroupColumn(groupCol);
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

  // ─── Annotation helpers ────────────────────────────────────────────────────

  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function buildCategoryList() {
    const listEl   = document.getElementById('annotation-category-list');
    const searchEl = document.getElementById('annotation-category-search');
    if (!listEl) return;
    const filter = searchEl ? searchEl.value.toLowerCase() : '';
    listEl.innerHTML = '';
    if (!GeneAnnotationState.categoryColumn) return;

    const values = GeneAnnotationState.categoryValues;
    for (const val of values) {
      if (filter && !val.toLowerCase().includes(filter)) continue;
      const count = GeneAnnotationState.categoryCounts.get(val) || 0;
      const color = GeneAnnotationState.scale ? GeneAnnotationState.scale(val) : '#888';
      const checked = GeneAnnotationState.selectedCategories.has(val);

      const item = document.createElement('label');
      item.className = 'category-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'category-checkbox';
      cb.value = val;
      cb.checked = checked;
      cb.addEventListener('change', () => {
        window.toggleGeneAnnotationCategory(val, cb.checked);
        buildCategoryList();
        writeURLParams();
      });

      const swatch = document.createElement('span');
      swatch.className = 'category-swatch';
      swatch.style.background = color;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-name';
      nameSpan.textContent = val;

      const countSpan = document.createElement('span');
      countSpan.className = 'category-count';
      countSpan.textContent = '(' + count + ')';

      item.appendChild(cb);
      item.appendChild(swatch);
      item.appendChild(nameSpan);
      item.appendChild(countSpan);
      listEl.appendChild(item);
    }
  }

  function updateAnnotationStats(renderData) {
    const statsEl = document.getElementById('annotation-stats');
    const selStatsEl = document.getElementById('annotation-selection-stats');
    if (!statsEl || !GeneAnnotationState.categoryColumn) return;

    const metaTotal = GeneAnnotationState.rawData.size;
    const refGenes  = renderData && renderData.referenceGenes ? renderData.referenceGenes : null;
    const refTotal  = refGenes ? refGenes.size : 0;
    const refName   = window.AppState && AppState.referenceGenome ? AppState.referenceGenome : 'reference';

    let inRef = 0;
    if (refGenes) {
      for (const geneId of GeneAnnotationState.rawData.keys()) {
        if (refGenes.has(geneId)) inRef++;
      }
    }
    const notFound = metaTotal - inRef;
    const pct = metaTotal > 0 ? ((inRef / metaTotal) * 100).toFixed(1) : '0.0';

    let html = `Out of ${metaTotal.toLocaleString()} genes in metadata, ${pct}% (${inRef.toLocaleString()}) are present in ${escapeHtml(refName)}.`;
    if (notFound > 0) html += ` ${notFound.toLocaleString()} gene${notFound === 1 ? '' : 's'} not found in alignments.`;
    statsEl.innerHTML = html;
    statsEl.hidden = false;

    if (selStatsEl) {
      const selCount = GeneAnnotationState.selectedCategories.size > 0
        ? (() => {
            let n = 0;
            if (refGenes) {
              for (const [geneId, row] of GeneAnnotationState.rawData) {
                if (!refGenes.has(geneId)) continue;
                const val = row[GeneAnnotationState.categoryColumn];
                if (val !== null && val !== undefined && val !== '' && GeneAnnotationState.selectedCategories.has(String(val))) n++;
              }
            }
            return n;
          })()
        : 0;
      let totalSelected = 0;
      for (const [geneId, row] of GeneAnnotationState.rawData) {
        const val = row[GeneAnnotationState.categoryColumn];
        if (val !== null && val !== undefined && val !== '' && GeneAnnotationState.selectedCategories.has(String(val))) totalSelected++;
      }
      selStatsEl.textContent = GeneAnnotationState.selectedCategories.size > 0
        ? `${selCount.toLocaleString()} / ${totalSelected.toLocaleString()} selected genes present in alignments.`
        : '';
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

    // Apply gap / wedge-span URL params immediately so the UI is correct before data loads.
    {
      const earlyParams = new URLSearchParams(location.search);
      const earlyGap = parseInt(earlyParams.get('gap'), 10);
      if (!isNaN(earlyGap) && earlyGap >= 0 && earlyGap <= 60) {
        const gapInput   = document.getElementById('wedge-gap-input');
        const gapDisplay = document.getElementById('wedge-gap-display');
        if (gapInput)   gapInput.value = earlyGap;
        if (gapDisplay) gapDisplay.textContent = earlyGap + 'px';
        if (window.ZoomState) ZoomState.setWedgeGap(earlyGap);
      }
      const earlyWedge = parseInt(earlyParams.get('wedge'), 10);
      if (!isNaN(earlyWedge) && earlyWedge >= 10 && earlyWedge <= 50) {
        const wedgeInput   = document.getElementById('wedge-span-input');
        const wedgeDisplay = document.getElementById('wedge-span-display');
        if (wedgeInput)   wedgeInput.value = earlyWedge;
        if (wedgeDisplay) wedgeDisplay.textContent = earlyWedge + '%';
        if (window.ZoomState) ZoomState.setWedgeSpan(earlyWedge / 100);
      }
      const earlyHeight = parseFloat(earlyParams.get('wedgeHeight'));
      if (!isNaN(earlyHeight) && earlyHeight >= 2 && earlyHeight <= 10) {
        const hInput   = document.getElementById('wedge-height-input');
        const hDisplay = document.getElementById('wedge-height-display');
        if (hInput)   hInput.value = earlyHeight;
        if (hDisplay) hDisplay.textContent = earlyHeight.toFixed(1) + '×';
        if (window.ZoomState) ZoomState.setWedgeHeightScale(earlyHeight);
      }

      const earlyZoomLevel = parseFloat(earlyParams.get('zoomLevel'));
      if (!isNaN(earlyZoomLevel) && earlyZoomLevel > 1 && window.ZoomState) {
        ZoomState.setZoomLevel(earlyZoomLevel);
        const earlyFocusAngle = parseFloat(earlyParams.get('focusAngle'));
        if (!isNaN(earlyFocusAngle)) {
          ZoomState.setFocusAngle(earlyFocusAngle * Math.PI / 180);
        }
      }
    }

    // Auto-load data file from ?data= query param.
    const initParams = new URLSearchParams(location.search);
    const initDataURL = initParams.get('data');
    if (initDataURL) {
      const inp = document.getElementById('data-url-input');
      if (inp) inp.value = initDataURL;
      window.loadFileFromURL(initDataURL);
    }

    // Reference genome selector
    document.getElementById('reference-select').addEventListener('change', (e) => {
      window.setReference(e.target.value);
      buildGenomeToggles();
    });

    // Gene annotation — Category column select
    const annotCatColSelect = document.getElementById('annotation-category-column-select');
    if (annotCatColSelect) {
      annotCatColSelect.addEventListener('change', (e) => {
        window.setGeneAnnotationCategoryColumn(e.target.value || null);
        writeURLParams();
      });
    }

    // Gene annotation — Category search filter
    const annotSearch = document.getElementById('annotation-category-search');
    if (annotSearch) {
      annotSearch.addEventListener('input', () => buildCategoryList());
    }

    // Gene annotation — Select All / Clear All buttons
    const annotSelectAll = document.getElementById('annot-select-all');
    if (annotSelectAll) {
      annotSelectAll.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#annotation-category-list .category-checkbox');
        const vals = Array.from(checkboxes).map(cb => cb.value);
        window.setGeneAnnotationSelectedCategories([
          ...GeneAnnotationState.selectedCategories,
          ...vals
        ]);
        buildCategoryList();
        writeURLParams();
      });
    }
    const annotClearAll = document.getElementById('annot-clear-all');
    if (annotClearAll) {
      annotClearAll.addEventListener('click', () => {
        window.setGeneAnnotationSelectedCategories([]);
        buildCategoryList();
        writeURLParams();
      });
    }

    // Gene annotation — Display mode buttons
    const annotModeBars   = document.getElementById('annot-mode-bars');
    const annotModeArrows = document.getElementById('annot-mode-arrows');
    if (annotModeBars) {
      annotModeBars.addEventListener('click', () => {
        window.setGeneAnnotationDisplayMode('bars');
        annotModeBars.classList.add('active');
        if (annotModeArrows) annotModeArrows.classList.remove('active');
        writeURLParams();
      });
    }
    if (annotModeArrows) {
      annotModeArrows.addEventListener('click', () => {
        window.setGeneAnnotationDisplayMode('arrows');
        annotModeArrows.classList.add('active');
        if (annotModeBars) annotModeBars.classList.remove('active');
        writeURLParams();
      });
    }

    // Gene annotation — Name column select
    const annotNameColSelect = document.getElementById('annotation-name-column-select');
    if (annotNameColSelect) {
      annotNameColSelect.addEventListener('change', (e) => {
        if (window.GeneAnnotationState) GeneAnnotationState.labelColumn = e.target.value || null;
        writeURLParams();
        if (typeof window.onStateChanged === 'function') window.onStateChanged();
      });
    }

    // Genome annotation — Name column select
    const genomeNameColSelect = document.getElementById('genome-name-column-select');
    if (genomeNameColSelect) {
      genomeNameColSelect.addEventListener('change', (e) => {
        if (window.setGenomeLabelColumn) window.setGenomeLabelColumn(e.target.value || null);
        writeURLParams();
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

    const genomeGroupColSelect = document.getElementById('genome-group-column-select');
    if (genomeGroupColSelect) {
      genomeGroupColSelect.addEventListener('change', (e) => {
        if (window.setGenomeGroupColumn) window.setGenomeGroupColumn(e.target.value || null);
        writeURLParams();
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
        if (typeof window.markWebGLDirty === 'function') window.markWebGLDirty();
        const rd = window.getLastRenderData ? window.getLastRenderData() : null;
        if (rd && typeof window.drawVisualization === 'function') window.drawVisualization(rd);
        writeURLParams();
      });
    }

    // Wedge height slider
    const wedgeHeightInput   = document.getElementById('wedge-height-input');
    const wedgeHeightDisplay = document.getElementById('wedge-height-display');
    if (wedgeHeightInput) {
      wedgeHeightInput.addEventListener('input', () => {
        const scale = parseFloat(wedgeHeightInput.value);
        if (wedgeHeightDisplay) wedgeHeightDisplay.textContent = scale.toFixed(1) + '×';
        if (window.ZoomState) ZoomState.setWedgeHeightScale(scale);
        if (typeof window.markWebGLDirty === 'function') window.markWebGLDirty();
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

    // Auto-derive annotation URLs from data URL when no annotation is already loaded/specified.
    if (AppState.loadedDataURL) {
      const urlParams = new URLSearchParams(location.search);
      if (!urlParams.get('geneAnnot') && !GeneAnnotationState.loadedURL) {
        const autoGeneUrl = AppState.loadedDataURL.replace('.genomes.aln.csv.gz', '.genes.annot.csv.gz');
        if (autoGeneUrl !== AppState.loadedDataURL && /^https?:\/\//i.test(autoGeneUrl)) {
          const inp = document.getElementById('gene-annot-url-input');
          if (inp && !inp.value.trim()) inp.value = autoGeneUrl;
          window.loadGeneAnnotationFromURL(autoGeneUrl, true);
        }
      }
      if (!urlParams.get('genomeAnnot') && !GenomeAnnotationState.loadedURL) {
        const autoGenomeUrl = AppState.loadedDataURL.replace('.genomes.aln.csv.gz', '.genomes.annot.csv.gz');
        if (autoGenomeUrl !== AppState.loadedDataURL && /^https?:\/\//i.test(autoGenomeUrl)) {
          const inp = document.getElementById('genome-annot-url-input');
          if (inp && !inp.value.trim()) inp.value = autoGenomeUrl;
          window.loadGenomeAnnotationFromURL(autoGenomeUrl, true);
        }
      }
    }

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
    updateAnnotationStats(renderData);
    writeURLParams();
  };

  // ─── Callbacks for annotation.js ──────────────────────────────────────────

  /**
   * Called by annotation.js after a gene annotation file is parsed.
   * Populates the column selector and shows annotation controls.
   */
  window.onGeneAnnotationLoaded = function () {
    const colSelect  = document.getElementById('annotation-category-column-select');
    const nameSelect = document.getElementById('annotation-name-column-select');
    const controlsEl = document.getElementById('annotation-controls');
    if (!colSelect || !controlsEl) return;

    const noneOpt = '<option value="">— none —</option>';
    colSelect.innerHTML  = noneOpt;
    if (nameSelect) nameSelect.innerHTML = noneOpt;

    for (const col of GeneAnnotationState.columns) {
      const mkOpt = () => {
        const opt = document.createElement('option');
        opt.value = col; opt.textContent = col;
        return opt;
      };
      colSelect.appendChild(mkOpt());
      if (nameSelect) nameSelect.appendChild(mkOpt());
    }
    colSelect.value = GeneAnnotationState.categoryColumn || '';
    if (nameSelect) nameSelect.value = GeneAnnotationState.labelColumn || '';

    // Reset search input
    const filterInp = document.getElementById('annotation-category-search');
    if (filterInp) filterInp.value = '';

    controlsEl.hidden = false;

    applyURLParams('geneAnnotation');
    updateAnnotationStats(window.buildRenderData ? window.buildRenderData() : null);
    window.renderGeneAnnotationLegend();
    writeURLParams();
  };

  /**
   * Called by annotation.js after category column changes.
   */
  window.onGeneAnnotationColumnChanged = function () {
    buildCategoryList();
    const statsEl = document.getElementById('annotation-stats');
    if (statsEl) statsEl.hidden = !GeneAnnotationState.categoryColumn;
    const catSection = document.getElementById('annotation-category-section');
    if (catSection) catSection.hidden = !GeneAnnotationState.categoryColumn;
    const modeEl = document.getElementById('annotation-display-mode');
    if (modeEl) modeEl.hidden = !GeneAnnotationState.categoryColumn;
  };

  // ─── Callbacks for genome-annotation.js ───────────────────────────────────

  /**
   * Called by genome-annotation.js after a genome annotation file is parsed.
   */
  window.onGenomeAnnotationLoaded = function () {
    const colorSelect  = document.getElementById('genome-color-column-select');
    const nameSelect   = document.getElementById('genome-name-column-select');
    const sortSelect   = document.getElementById('genome-sort-column-select');
    const groupSelect  = document.getElementById('genome-group-column-select');
    const controlsEl   = document.getElementById('genome-annotation-controls');
    if (!colorSelect || !sortSelect || !controlsEl) return;

    // Rebuild column options for all selects
    const noneOpt = '<option value="">— none —</option>';
    colorSelect.innerHTML = noneOpt;
    sortSelect.innerHTML  = noneOpt;
    if (nameSelect) nameSelect.innerHTML = noneOpt;
    if (groupSelect) groupSelect.innerHTML = noneOpt;

    for (const col of GenomeAnnotationState.columns) {
      const mkOpt = () => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        return opt;
      };
      colorSelect.appendChild(mkOpt());
      sortSelect.appendChild(mkOpt());
      if (nameSelect) nameSelect.appendChild(mkOpt());
      if (groupSelect) groupSelect.appendChild(mkOpt());
    }

    colorSelect.value = GenomeAnnotationState.colorColumn || '';
    sortSelect.value  = GenomeAnnotationState.sortColumn  || '';
    if (nameSelect) nameSelect.value = GenomeAnnotationState.labelColumn || '';
    if (groupSelect) groupSelect.value = GenomeAnnotationState.groupColumn || '';

    document.getElementById('genome-palette-select').value =
      GenomeAnnotationState.palette || 'Tableau10';

    document.getElementById('genome-sort-order-select').value =
      GenomeAnnotationState.sortAscending ? 'asc' : 'desc';

    controlsEl.hidden = false;

    // Auto-select first column for color if only one column
    if (GenomeAnnotationState.columns.length === 1) {
      colorSelect.value = GenomeAnnotationState.columns[0];
      window.setGenomeColorColumn(GenomeAnnotationState.columns[0]);
    }

    applyURLParams('genomeAnnotation');
    window.renderGenomeAnnotationLegend();
    writeURLParams();
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
