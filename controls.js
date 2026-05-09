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

  // Snapshot of the URL the page was loaded with. applyURLParams always reads
  // from this so that writeURLParams → history.replaceState calls (which happen
  // before async annotation loads complete) cannot erase params that haven't
  // been applied yet.
  const initialURLSearch = location.search;

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
      if (GeneAnnotationState.customColors && GeneAnnotationState.customColors.size > 0) {
        const colorObj = {};
        GeneAnnotationState.customColors.forEach((hex, cat) => { colorObj[cat] = hex; });
        params.set('annotCustomColors', JSON.stringify(colorObj));
      }
    }

    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) params.set('sidebar', '0');

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
      if (GenomeAnnotationState.tooltipColumns && GenomeAnnotationState.tooltipColumns.length > 0) {
        params.set('genomeTooltipCols', GenomeAnnotationState.tooltipColumns.join(','));
      }
    }

    const str = params.toString();
    history.replaceState(null, '', str ? '?' + str : location.pathname);
  }

  window.writeURLParams = writeURLParams;

  function applyURLParams(scope) {
    const params = new URLSearchParams(initialURLSearch);

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
      const customColorsStr = params.get('annotCustomColors');
      if (customColorsStr) {
        try {
          const colorObj = JSON.parse(customColorsStr);
          if (colorObj && typeof colorObj === 'object') {
            Object.entries(colorObj).forEach(([cat, hex]) => {
              if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
                GeneAnnotationState.customColors.set(cat, hex);
              }
            });
            buildCategoryList();
          }
        } catch (e) { /* ignore malformed */ }
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
      const tooltipColsStr = params.get('genomeTooltipCols');
      if (tooltipColsStr) {
        const validCols = tooltipColsStr.split(',').filter(Boolean)
          .filter((c) => GenomeAnnotationState.columns.includes(c));
        if (validCols.length > 0) {
          if (window.setGenomeTooltipColumns) window.setGenomeTooltipColumns(validCols);
          const tooltipSel = document.getElementById('genome-tooltip-columns-select');
          if (tooltipSel) {
            for (const opt of tooltipSel.options) {
              opt.selected = validCols.includes(opt.value);
            }
          }
        }
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

    // Count, per category, how many genes appear in the current reference genome.
    const rd = window.getLastRenderData ? window.getLastRenderData() : null;
    const refGenes = rd && rd.referenceGenes ? rd.referenceGenes : null;
    const refCounts = new Map();
    if (refGenes) {
      for (const [geneId, row] of GeneAnnotationState.rawData) {
        if (!refGenes.has(geneId)) continue;
        const v = row[GeneAnnotationState.categoryColumn];
        if (v === null || v === undefined || v === '') continue;
        const s = String(v);
        refCounts.set(s, (refCounts.get(s) || 0) + 1);
      }
    }

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

      const effectiveColor = (GeneAnnotationState.customColors && GeneAnnotationState.customColors.get(val)) || color;
      const swatch = document.createElement('input');
      swatch.type = 'color';
      swatch.className = 'category-swatch';
      swatch.value = effectiveColor;
      swatch.title = 'Click to change color';
      swatch.addEventListener('change', (e) => {
        e.stopPropagation();
        window.setGeneAnnotationCustomColor(val, e.target.value);
        buildCategoryList();
      });
      swatch.addEventListener('click', (e) => e.stopPropagation());

      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-name';
      nameSpan.textContent = val;

      const countSpan = document.createElement('span');
      countSpan.className = 'category-count';
      if (refGenes) {
        const refCount = refCounts.get(val) || 0;
        countSpan.textContent = '(' + refCount + ' / ' + count + ')';
        countSpan.title = refCount + ' in reference / ' + count + ' total';
      } else {
        countSpan.textContent = '(' + count + ')';
      }

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

  function updateZoomInfo() {
    const infoEl = document.getElementById('zoom-info');
    const textEl = document.getElementById('zoom-info-text');
    if (!infoEl || !textEl) return;

    const zs = window.ZoomState;
    const rd = window.getLastRenderData ? window.getLastRenderData() : null;

    if (!zs || zs.zoomLevel <= 1.05 || !rd || !rd.totalLength) {
      infoEl.hidden = true;
      return;
    }

    const totalLen  = rd.totalLength;
    const halfSpan  = zs.wedgeSpan * Math.PI / zs.zoomLevel;
    let startAngle  = (zs.focusAngle - halfSpan + 4 * Math.PI) % (2 * Math.PI);
    let endAngle    = (zs.focusAngle + halfSpan + 4 * Math.PI) % (2 * Math.PI);

    const startBp = Math.max(0, Math.round(startAngle / (2 * Math.PI) * totalLen));
    const endBp   = Math.round(endAngle   / (2 * Math.PI) * totalLen);
    const spanBp  = Math.round(halfSpan * 2 / (2 * Math.PI) * totalLen);

    function fmt(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(2) + ' Mbp';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + ' kbp';
      return n + ' bp';
    }

    textEl.textContent = fmt(startBp) + ' – ' + fmt(endBp) + ' (' + fmt(spanBp) + ' shown)';
    infoEl.hidden = false;
  }

  window.updateZoomInfo = updateZoomInfo;

  function updateGenomeAnnotationStats() {
    const statsEl = document.getElementById('genome-annotation-stats');
    if (!statsEl) return;
    if (!GenomeAnnotationState.rawData || GenomeAnnotationState.rawData.size === 0) {
      statsEl.hidden = true;
      return;
    }
    const allGenomes  = AppState.allGenomes || [];
    const metaTotal   = GenomeAnnotationState.rawData.size;
    const found       = allGenomes.filter((g) => GenomeAnnotationState.rawData.has(String(g))).length;
    const pct         = metaTotal > 0 ? ((found / metaTotal) * 100).toFixed(1) : '0.0';
    const notInData   = metaTotal - found;
    let html = `${pct}% (${found.toLocaleString()} / ${metaTotal.toLocaleString()}) of metadata genomes found in alignment data.`;
    if (notInData > 0) html += ` ${notInData.toLocaleString()} not found.`;
    statsEl.innerHTML = html;
    statsEl.hidden = false;
  }

  // ─── Drop zone visibility sync ────────────────────────────────────────────

  function syncDropZoneVisibility() {
    const alignUrl = document.getElementById('data-url-input');
    const dzMain   = document.getElementById('drop-zone');
    if (alignUrl && dzMain) dzMain.hidden = alignUrl.value.trim().length > 0;

    const geneUrl = document.getElementById('gene-annot-url-input');
    const dzGene  = document.getElementById('annotation-drop-zone');
    if (geneUrl && dzGene) dzGene.hidden = geneUrl.value.trim().length > 0;

    const genomeUrl = document.getElementById('genome-annot-url-input');
    const dzGenome  = document.getElementById('genome-annotation-drop-zone');
    if (genomeUrl && dzGenome) dzGenome.hidden = genomeUrl.value.trim().length > 0;
  }

  // ─── Sidebar toggle ──────────────────────────────────────────────────────

  function setSidebarCollapsed(collapsed) {
    const sidebar    = document.querySelector('.sidebar');
    const expandBtn  = document.getElementById('sidebar-expand-btn');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    if (expandBtn) expandBtn.hidden = !collapsed;
    writeURLParams();
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

    // Genome search filter
    const genomeSearch = document.getElementById('genome-search');
    if (genomeSearch) {
      genomeSearch.addEventListener('input', () => buildGenomeToggles());
    }

    const genomeSelectAll = document.getElementById('genome-select-all');
    if (genomeSelectAll) {
      genomeSelectAll.addEventListener('click', () => {
        document.querySelectorAll('#genome-toggles .genome-toggle-checkbox').forEach((cb) => {
          AppState.visibleGenomes.add(cb.value);
          cb.checked = true;
        });
        window.onStateChanged();
      });
    }

    const genomeClearAll = document.getElementById('genome-clear-all');
    if (genomeClearAll) {
      genomeClearAll.addEventListener('click', () => {
        document.querySelectorAll('#genome-toggles .genome-toggle-checkbox').forEach((cb) => {
          AppState.visibleGenomes.delete(cb.value);
          cb.checked = false;
        });
        window.onStateChanged();
      });
    }

    const geneSimilarityBtn = document.getElementById('genome-gene-similarity-btn');
    if (geneSimilarityBtn) {
      geneSimilarityBtn.addEventListener('click', () => {
        if (AppState.customGenomeOrder) {
          AppState.customGenomeOrder = null;
          geneSimilarityBtn.textContent = 'Sort by gene content';
          window.onStateChanged();
        } else {
          geneSimilarityBtn.textContent = 'Computing…';
          geneSimilarityBtn.disabled = true;
          setTimeout(() => {
            try {
              AppState.customGenomeOrder = computeGeneSimilarityOrder();
              geneSimilarityBtn.textContent = 'Clear gene-content sort';
            } catch (e) {
              AppState.customGenomeOrder = null;
              geneSimilarityBtn.textContent = 'Sort by gene content';
            }
            geneSimilarityBtn.disabled = false;
            window.onStateChanged();
          }, 10);
        }
      });
    }

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
        refreshGenomeDisplayNames();
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

    const genomeTooltipColsSelect = document.getElementById('genome-tooltip-columns-select');
    if (genomeTooltipColsSelect) {
      genomeTooltipColsSelect.addEventListener('change', () => {
        const selected = Array.from(genomeTooltipColsSelect.selectedOptions).map((o) => o.value);
        if (window.setGenomeTooltipColumns) window.setGenomeTooltipColumns(selected);
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
    const zoomInfoClose = document.getElementById('zoom-info-close');
    if (zoomInfoClose) {
      zoomInfoClose.addEventListener('click', () => {
        if (window.ZoomState) { window.ZoomState.resetZoom(); updateZoomInfo(); }
      });
    }

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

    // Hide drop zones in real time as URL inputs are filled.
    ['data-url-input', 'gene-annot-url-input', 'genome-annot-url-input'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', syncDropZoneVisibility);
    });

    syncDropZoneVisibility();

    // Sidebar collapse / expand
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
    }
    const expandBtn = document.getElementById('sidebar-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => setSidebarCollapsed(false));
    }

    // Apply initial sidebar state from URL
    if (new URLSearchParams(initialURLSearch).get('sidebar') === '0') {
      setSidebarCollapsed(true);
    }
  });

  // ─── Callbacks for app.js ─────────────────────────────────────────────────

  /**
   * Called by app.js after the CSV has been parsed and AppState is populated.
   */
  window.onDataLoaded = function () {
    AppState.customGenomeOrder = null;
    const simBtn = document.getElementById('genome-gene-similarity-btn');
    if (simBtn) { simBtn.textContent = 'Sort by gene content'; simBtn.disabled = false; }

    colorScale = d3
      .scaleOrdinal(d3.schemeTableau10.concat(d3.schemePastel1))
      .domain(AppState.allGenomes);

    // Populate reference genome selector
    const select = document.getElementById('reference-select');
    select.innerHTML = '';
    for (const genome of AppState.allGenomes) {
      const option = document.createElement('option');
      option.value = genome;
      option.textContent = getGenomeDisplayName(genome);
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

    syncDropZoneVisibility();

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
    updateGenomeAnnotationStats();
    updateZoomInfo();
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

    const tooltipColsSelect = document.getElementById('genome-tooltip-columns-select');
    if (tooltipColsSelect) {
      tooltipColsSelect.innerHTML = '';
      for (const col of GenomeAnnotationState.columns) {
        const opt = document.createElement('option');
        opt.value = col; opt.textContent = col;
        tooltipColsSelect.appendChild(opt);
      }
    }

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
    refreshGenomeDisplayNames();
    window.renderGenomeAnnotationLegend();
    updateGenomeAnnotationStats();
    writeURLParams();
  };

  // ─── DOM builders ─────────────────────────────────────────────────────────

  function buildGenomeToggles() {
    const container = document.getElementById('genome-toggles');
    container.innerHTML = '';

    const searchEl = document.getElementById('genome-search');
    const filter   = searchEl ? searchEl.value.toLowerCase() : '';

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

    for (const genome of nonRefGenomes) {
      const displayName = getGenomeDisplayName(genome);
      if (filter && !displayName.toLowerCase().includes(filter)) continue;

      const color     = colorScale ? colorScale(genome) : '#888888';
      const isVisible = AppState.visibleGenomes.has(genome);

      const label = document.createElement('label');
      label.className = 'genome-toggle-label';
      label.style.setProperty('--genome-color', color);

      const checkbox = document.createElement('input');
      checkbox.type      = 'checkbox';
      checkbox.className = 'genome-toggle-checkbox';
      checkbox.value     = genome;
      checkbox.checked   = isVisible;
      checkbox.addEventListener('change', () => {
        window.toggleGenome(genome, checkbox.checked);
      });

      const dot = document.createElement('span');
      dot.className = 'genome-color-dot';

      const nameSpan = document.createElement('span');
      nameSpan.className   = 'genome-name';
      nameSpan.textContent = displayName;
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

  function getGenomeDisplayName(genome) {
    if (window.GenomeAnnotationState && GenomeAnnotationState.labelColumn && GenomeAnnotationState.rawData) {
      const row = GenomeAnnotationState.rawData.get(String(genome));
      if (row) {
        const label = row[GenomeAnnotationState.labelColumn];
        if (label !== null && label !== undefined && label !== '') return String(label);
      }
    }
    return shortenName(genome);
  }

  function refreshGenomeDisplayNames() {
    const select = document.getElementById('reference-select');
    if (select) {
      for (const opt of select.options) {
        opt.textContent = getGenomeDisplayName(opt.value);
      }
    }
    buildGenomeToggles();
  }

  // ─── Gene-content similarity ordering ────────────────────────────────────

  function computeGeneSimilarityOrder() {
    var rows = AppState.rows;
    var refGenome = AppState.referenceGenome;

    var geneToIdx = new Map();
    var geneCount = 0;
    var genomeGenes = new Map();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var genome = row.genome;
      if (!genome || genome === refGenome) continue;
      var gene = row.sseqid;
      if (!gene) continue;

      var idx = geneToIdx.get(gene);
      if (idx === undefined) { idx = geneCount++; geneToIdx.set(gene, idx); }

      var gset = genomeGenes.get(genome);
      if (!gset) { gset = new Set(); genomeGenes.set(genome, gset); }
      gset.add(idx);
    }

    var genomes = Array.from(genomeGenes.keys());
    var N = genomes.length;
    if (N <= 1) return genomes;

    var words = Math.ceil(geneCount / 32) || 1;

    var vecs = [];
    for (var i = 0; i < N; i++) {
      var v = new Int32Array(words);
      genomeGenes.get(genomes[i]).forEach(function(g) { v[g >> 5] |= (1 << (g & 31)); });
      vecs.push(v);
    }

    function popcount32(x) {
      x = x >>> 0;
      x -= (x >>> 1) & 0x55555555;
      x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
      x = (x + (x >>> 4)) & 0x0f0f0f0f;
      return (x * 0x01010101) >>> 24;
    }

    var pcounts = new Int32Array(N);
    for (var i = 0; i < N; i++) {
      var s = 0;
      for (var w = 0; w < words; w++) s += popcount32(vecs[i][w]);
      pcounts[i] = s;
    }

    function intersectSize(va, vb) {
      var s = 0;
      for (var w = 0; w < words; w++) s += popcount32(va[w] & vb[w]);
      return s;
    }

    // Start from genome with median gene count
    var sortedCounts = Array.from(pcounts).sort(function(a, b) { return a - b; });
    var medianCount = sortedCounts[Math.floor(N / 2)];
    var startIdx = 0, minDiff = Infinity;
    for (var i = 0; i < N; i++) {
      var diff = Math.abs(pcounts[i] - medianCount);
      if (diff < minDiff) { minDiff = diff; startIdx = i; }
    }

    // Greedy nearest-neighbour traversal
    var visited = new Uint8Array(N);
    var order = [startIdx];
    visited[startIdx] = 1;

    for (var step = 1; step < N; step++) {
      var prev = order[step - 1];
      var bestNext = -1, bestSim = -1;
      var prevCount = pcounts[prev];
      for (var j = 0; j < N; j++) {
        if (visited[j]) continue;
        var inter = intersectSize(vecs[prev], vecs[j]);
        var union = prevCount + pcounts[j] - inter;
        var sim = union > 0 ? inter / union : 0;
        if (sim > bestSim) { bestSim = sim; bestNext = j; }
      }
      order.push(bestNext);
      visited[bestNext] = 1;
    }

    return order.map(function(i) { return genomes[i]; });
  }
})();
