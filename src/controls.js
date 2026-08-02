/**
 * The sidebar: every control, legend and stat line.
 *
 * Only built when `config.controls` is true. A host application that supplies its
 * own controls mounts with `controls: false` and drives the display through
 * `update(config)` instead, so nothing here is on the library's critical path.
 *
 * Every listener registered here goes through `on()`, which records a disposer,
 * so `destroy()` leaves no handler attached to the instance's DOM or to document.
 */

import { escapeHtml } from './canvas-renderer.js';
import { downloadBlob, copyToClipboard } from './export.js';
import {
  setReferenceGenome, setGenomeVisible, computeGeneSimilarityOrder,
} from './render-data.js';
import {
  setGeneCategoryColumn, setGeneSelectedCategories, toggleGeneCategory,
  setGeneCustomColor, clearGeneAnnotation,
} from './gene-annotation.js';
import {
  setGenomeColorColumn, setGenomeGroupColumn, setGenomeLabelColumn, setGenomeTooltipColumns,
  setGenomeSortColumn, setGenomePalette, clearGenomeAnnotation, getGenomeDisplayName,
} from './genome-annotation.js';

const NONE_LABEL = '— none —';
const FALLBACK_GENOME_COLOR = '#888888';

function formatBases(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} Mbp`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kbp`;
  return `${n} bp`;
}

function fillColumnSelect(select, columns, selected) {
  if (!select) return;
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = NONE_LABEL;
  select.appendChild(none);
  for (const column of columns) {
    const option = document.createElement('option');
    option.value = column;
    option.textContent = column;
    select.appendChild(option);
  }
  select.value = selected || '';
}

export function createControls({
  state, refs, render, emitChange, getRenderData, markWebGLDirty,
  exportPNG, exportSVG, setCollapsed,
}) {
  const disposers = [];

  function on(element, type, handler, options) {
    if (!element) return;
    element.addEventListener(type, handler, options);
    disposers.push(() => element.removeEventListener(type, handler, options));
  }

  /** Apply a state change: redraw, refresh the sidebar, tell the host. */
  function commit() {
    render();
    emitChange();
  }

  // ── Reference genome combobox ─────────────────────────────────────────────

  let refOptions = [];
  let activeIndex = -1;

  function renderRefList(filtered) {
    const list = refs.refList;
    list.innerHTML = '';
    activeIndex = -1;
    const currentValue = refs.refInput.dataset.value || '';

    for (const option of filtered) {
      const li = document.createElement('li');
      li.className = `ref-combobox-option${option.value === currentValue ? ' selected' : ''}`;
      li.setAttribute('role', 'option');
      li.dataset.value = option.value;
      li.textContent = option.label;
      // mousedown, not click: the input's blur would close the list first.
      li.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseReference(option.value);
      });
      list.appendChild(li);
    }
  }

  function openRefList() {
    const query = refs.refInput.value.trim().toLowerCase();
    renderRefList(query
      ? refOptions.filter((o) => o.label.toLowerCase().includes(query)
        || o.value.toLowerCase().includes(query))
      : refOptions);
    refs.refList.hidden = false;
    refs.refInput.setAttribute('aria-expanded', 'true');
    refs.refList.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function closeRefList() {
    refs.refList.hidden = true;
    refs.refInput.setAttribute('aria-expanded', 'false');
    setRefInputValue(refs.refInput.dataset.value || '');
  }

  function setRefInputValue(value) {
    const option = refOptions.find((o) => o.value === value);
    refs.refInput.value = option ? option.label : value;
    refs.refInput.dataset.value = value;
  }

  function chooseReference(value) {
    setRefInputValue(value);
    setReferenceGenome(state, value);
    buildGenomeToggles();
    closeRefList();
    commit();
  }

  function populateRefOptions() {
    refOptions = state.allGenomes.map((g) => ({ value: g, label: getGenomeDisplayName(state, g) }));
    setRefInputValue(state.referenceGenome || '');
  }

  on(refs.refInput, 'focus', openRefList);
  on(refs.refInput, 'input', openRefList);
  on(refs.refInput, 'blur', () => setTimeout(() => {
    if (refs.refList.isConnected) closeRefList();
  }, 150));
  on(refs.refInput, 'keydown', (event) => {
    const items = [...refs.refList.querySelectorAll('.ref-combobox-option')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = event.key === 'ArrowDown'
        ? Math.min(activeIndex + 1, items.length - 1)
        : Math.max(activeIndex - 1, 0);
      items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) chooseReference(items[activeIndex].dataset.value);
    } else if (event.key === 'Escape') {
      closeRefList();
      refs.refInput.blur();
    }
  });

  // ── Genome toggles ────────────────────────────────────────────────────────

  function buildGenomeToggles() {
    const container = refs.genomeToggles;
    container.innerHTML = '';

    const filter = refs.genomeSearch.value.toLowerCase();
    const renderData = getRenderData();
    const nonReference = state.allGenomes.filter((g) => g !== state.referenceGenome).sort();

    if (nonReference.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'genome-toggles-empty';
      empty.textContent = 'No other genomes loaded.';
      container.appendChild(empty);
      return;
    }

    for (const genome of nonReference) {
      const displayName = getGenomeDisplayName(state, genome);
      if (filter && !displayName.toLowerCase().includes(filter)) continue;

      const label = document.createElement('label');
      label.className = 'genome-toggle-label';
      label.dataset.genome = genome;
      label.style.setProperty('--genome-color',
        (renderData && renderData.genomeColors.get(genome)) || FALLBACK_GENOME_COLOR);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'genome-toggle-checkbox';
      checkbox.value = genome;
      checkbox.checked = state.visibleGenomes.has(genome);
      checkbox.addEventListener('change', () => {
        setGenomeVisible(state, genome, checkbox.checked);
        commit();
      });

      const dot = document.createElement('span');
      dot.className = 'genome-color-dot';

      const name = document.createElement('span');
      name.className = 'genome-name';
      name.textContent = displayName;
      name.title = genome;

      label.append(checkbox, dot, name);
      container.appendChild(label);
    }
  }

  /**
   * Recolour the toggle swatches from the latest render data. The toggle list is
   * built before the first render, so its colours arrive one step behind.
   */
  function paintToggleColors(renderData) {
    if (!renderData) return;
    for (const label of refs.genomeToggles.querySelectorAll('.genome-toggle-label')) {
      label.style.setProperty('--genome-color',
        renderData.genomeColors.get(label.dataset.genome) || FALLBACK_GENOME_COLOR);
    }
  }

  on(refs.genomeSearch, 'input', buildGenomeToggles);

  on(refs.genomeSelectAll, 'click', () => {
    for (const checkbox of refs.genomeToggles.querySelectorAll('.genome-toggle-checkbox')) {
      setGenomeVisible(state, checkbox.value, true);
      checkbox.checked = true;
    }
    commit();
  });

  on(refs.genomeClearAll, 'click', () => {
    for (const checkbox of refs.genomeToggles.querySelectorAll('.genome-toggle-checkbox')) {
      setGenomeVisible(state, checkbox.value, false);
      checkbox.checked = false;
    }
    commit();
  });

  on(refs.genomeSimilarityBtn, 'click', () => {
    const button = refs.genomeSimilarityBtn;
    if (state.customGenomeOrder) {
      state.customGenomeOrder = null;
      button.textContent = 'Sort by gene content';
      commit();
      return;
    }
    button.textContent = 'Computing…';
    button.disabled = true;
    // Yield first so the label repaints before a multi-second bitset walk.
    setTimeout(() => {
      state.customGenomeOrder = computeGeneSimilarityOrder(state);
      button.textContent = 'Clear gene-content sort';
      button.disabled = false;
      commit();
    }, 10);
  });

  // ── Gene annotation ───────────────────────────────────────────────────────

  function buildCategoryList() {
    const list = refs.geneCategoryList;
    list.innerHTML = '';
    const ga = state.geneAnnot;
    if (!ga.categoryColumn) return;

    const filter = refs.geneCategorySearch.value.toLowerCase();
    const renderData = getRenderData();
    const referenceGenes = renderData && renderData.referenceGenes;

    // How many of each category are actually on the current reference genome.
    const referenceCounts = new Map();
    if (referenceGenes) {
      for (const [geneId, row] of ga.rawData) {
        if (!referenceGenes.has(geneId)) continue;
        const value = row[ga.categoryColumn];
        if (value === null || value === undefined || value === '') continue;
        const key = String(value);
        referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
      }
    }

    for (const value of ga.categoryValues) {
      if (filter && !value.toLowerCase().includes(filter)) continue;

      const total = ga.categoryCounts.get(value) || 0;
      const item = document.createElement('label');
      item.className = 'category-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'category-checkbox';
      checkbox.value = value;
      checkbox.checked = ga.selectedCategories.has(value);
      checkbox.addEventListener('change', () => {
        toggleGeneCategory(state, value, checkbox.checked);
        buildCategoryList();
        commit();
      });

      const swatch = document.createElement('input');
      swatch.type = 'color';
      swatch.className = 'category-swatch';
      swatch.value = ga.customColors.get(value) || (ga.scale ? ga.scale(value) : '#888888');
      swatch.title = 'Click to change color';
      swatch.addEventListener('click', (event) => event.stopPropagation());
      swatch.addEventListener('change', (event) => {
        event.stopPropagation();
        setGeneCustomColor(state, value, event.target.value);
        buildCategoryList();
        commit();
      });

      const name = document.createElement('span');
      name.className = 'category-name';
      name.textContent = value;

      const count = document.createElement('span');
      count.className = 'category-count';
      if (referenceGenes) {
        const inReference = referenceCounts.get(value) || 0;
        count.textContent = `(${inReference} / ${total})`;
        count.title = `${inReference} in reference / ${total} total`;
      } else {
        count.textContent = `(${total})`;
      }

      item.append(checkbox, swatch, name, count);
      list.appendChild(item);
    }
  }

  function populateGeneAnnotationSelects() {
    const ga = state.geneAnnot;
    const loaded = ga.columns.length > 0;
    refs.geneAnnotControls.hidden = !loaded;
    fillColumnSelect(refs.geneCategorySelect, ga.columns, ga.categoryColumn);
    fillColumnSelect(refs.geneLabelSelect, ga.columns, ga.labelColumn);
    refs.geneCategorySearch.value = '';
    syncGeneCategorySection();
  }

  function syncGeneCategorySection() {
    refs.geneCategorySection.hidden = !state.geneAnnot.categoryColumn;
    buildCategoryList();
  }

  on(refs.geneCategorySelect, 'change', (event) => {
    setGeneCategoryColumn(state, event.target.value || null);
    syncGeneCategorySection();
    commit();
  });

  on(refs.geneLabelSelect, 'change', (event) => {
    state.geneAnnot.labelColumn = event.target.value || null;
    commit();
  });

  on(refs.geneSelectAll, 'click', () => {
    const listed = [...refs.geneCategoryList.querySelectorAll('.category-checkbox')].map((c) => c.value);
    setGeneSelectedCategories(state, [...state.geneAnnot.selectedCategories, ...listed]);
    buildCategoryList();
    commit();
  });

  on(refs.geneClearAll, 'click', () => {
    setGeneSelectedCategories(state, []);
    buildCategoryList();
    commit();
  });

  on(refs.geneCategorySearch, 'input', buildCategoryList);

  on(refs.geneClearBtn, 'click', () => {
    clearGeneAnnotation(state);
    populateGeneAnnotationSelects();
    commit();
  });

  function renderGeneLegend() {
    const legend = refs.geneLegend;
    legend.innerHTML = '';
    const ga = state.geneAnnot;
    if (!ga.categoryColumn || !ga.scale || ga.selectedCategories.size === 0) return;

    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = ga.categoryColumn;
    legend.appendChild(title);

    const items = document.createElement('div');
    items.className = 'legend-items';
    for (const value of [...ga.selectedCategories].sort()) {
      items.appendChild(legendItem(value, ga.customColors.get(value) || ga.scale(value)));
    }
    legend.appendChild(items);
  }

  function updateGeneStats(renderData) {
    const ga = state.geneAnnot;
    if (!ga.categoryColumn) {
      refs.geneStats.hidden = true;
      refs.geneSelectionStats.textContent = '';
      return;
    }

    const referenceGenes = renderData && renderData.referenceGenes;
    const metaTotal = ga.rawData.size;
    let inReference = 0;
    if (referenceGenes) {
      for (const geneId of ga.rawData.keys()) if (referenceGenes.has(geneId)) inReference++;
    }
    const notFound = metaTotal - inReference;
    const pct = metaTotal > 0 ? ((inReference / metaTotal) * 100).toFixed(1) : '0.0';
    const referenceName = state.referenceGenome || 'reference';

    let html = `Out of ${metaTotal.toLocaleString()} genes in metadata, ${pct}% `
      + `(${inReference.toLocaleString()}) are present in ${escapeHtml(referenceName)}.`;
    if (notFound > 0) {
      html += ` ${notFound.toLocaleString()} gene${notFound === 1 ? '' : 's'} not found in alignments.`;
    }
    refs.geneStats.innerHTML = html;
    refs.geneStats.hidden = false;

    if (ga.selectedCategories.size === 0) {
      refs.geneSelectionStats.textContent = '';
      return;
    }
    let selectedInReference = 0;
    let selectedTotal = 0;
    for (const [geneId, row] of ga.rawData) {
      const value = row[ga.categoryColumn];
      if (value === null || value === undefined || value === '') continue;
      if (!ga.selectedCategories.has(String(value))) continue;
      selectedTotal++;
      if (referenceGenes && referenceGenes.has(geneId)) selectedInReference++;
    }
    refs.geneSelectionStats.textContent = `${selectedInReference.toLocaleString()} / `
      + `${selectedTotal.toLocaleString()} selected genes present in alignments.`;
  }

  // ── Genome annotation ─────────────────────────────────────────────────────

  function populateGenomeAnnotationSelects() {
    const gna = state.genomeAnnot;
    refs.genomeAnnotControls.hidden = gna.columns.length === 0;

    fillColumnSelect(refs.genomeColorSelect, gna.columns, gna.colorColumn);
    fillColumnSelect(refs.genomeGroupSelect, gna.columns, gna.groupColumn);
    fillColumnSelect(refs.genomeLabelSelect, gna.columns, gna.labelColumn);
    fillColumnSelect(refs.genomeSortSelect, gna.columns, gna.sortColumn);

    refs.genomeTooltipSelect.innerHTML = '';
    for (const column of gna.columns) {
      const option = document.createElement('option');
      option.value = column;
      option.textContent = column;
      option.selected = gna.tooltipColumns.includes(column);
      refs.genomeTooltipSelect.appendChild(option);
    }

    refs.genomePaletteSelect.value = gna.palette;
    refs.genomeSortOrderSelect.value = gna.sortAscending ? 'asc' : 'desc';
  }

  on(refs.genomeColorSelect, 'change', (event) => {
    setGenomeColorColumn(state, event.target.value || null);
    commit();
  });

  on(refs.genomeGroupSelect, 'change', (event) => {
    setGenomeGroupColumn(state, event.target.value || null);
    commit();
  });

  on(refs.genomeLabelSelect, 'change', (event) => {
    setGenomeLabelColumn(state, event.target.value || null);
    populateRefOptions();
    buildGenomeToggles();
    commit();
  });

  on(refs.genomePaletteSelect, 'change', (event) => {
    setGenomePalette(state, event.target.value);
    commit();
  });

  on(refs.genomeTooltipSelect, 'change', () => {
    setGenomeTooltipColumns(state, [...refs.genomeTooltipSelect.selectedOptions].map((o) => o.value));
    emitChange();
  });

  function applySort() {
    setGenomeSortColumn(
      state,
      refs.genomeSortSelect.value || null,
      refs.genomeSortOrderSelect.value !== 'desc',
    );
    commit();
  }

  on(refs.genomeSortSelect, 'change', applySort);
  on(refs.genomeSortOrderSelect, 'change', applySort);

  on(refs.genomeClearBtn, 'click', () => {
    clearGenomeAnnotation(state);
    populateGenomeAnnotationSelects();
    populateRefOptions();
    buildGenomeToggles();
    commit();
  });

  function legendItem(value, color) {
    const row = document.createElement('div');
    row.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    swatch.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = value;

    row.append(swatch, label);
    return row;
  }

  function renderGenomeLegend() {
    const legend = refs.genomeLegend;
    legend.innerHTML = '';
    const gna = state.genomeAnnot;

    const useGroup = !!(gna.groupColumn && gna.groupScale);
    const column = useGroup ? gna.groupColumn : gna.colorColumn;
    const scale = useGroup ? gna.groupScale : gna.scale;
    const domain = useGroup ? gna.groupDomain : gna.domain;
    if (!column || !scale) return;

    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = column;
    legend.appendChild(title);

    const items = document.createElement('div');
    items.className = 'legend-items';
    for (const value of domain) items.appendChild(legendItem(value, scale(value)));
    legend.appendChild(items);
  }

  function updateGenomeStats() {
    const gna = state.genomeAnnot;
    if (gna.rawData.size === 0) {
      refs.genomeStats.hidden = true;
      return;
    }
    const metaTotal = gna.rawData.size;
    const found = state.allGenomes.filter((g) => gna.rawData.has(String(g))).length;
    const pct = ((found / metaTotal) * 100).toFixed(1);
    let html = `${pct}% (${found.toLocaleString()} / ${metaTotal.toLocaleString()}) `
      + 'of metadata genomes found in alignment data.';
    if (metaTotal - found > 0) html += ` ${(metaTotal - found).toLocaleString()} not found.`;
    refs.genomeStats.innerHTML = html;
    refs.genomeStats.hidden = false;
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  function syncZoomInputs() {
    const zoom = state.zoom;
    refs.wedgeSpanInput.value = Math.round(zoom.wedgeSpan * 100);
    refs.wedgeSpanDisplay.textContent = `${Math.round(zoom.wedgeSpan * 100)}%`;
    refs.wedgeGapInput.value = zoom.wedgeGap;
    refs.wedgeGapDisplay.textContent = `${zoom.wedgeGap}px`;
    refs.wedgeHeightInput.value = zoom.wedgeHeightScale;
    refs.wedgeHeightDisplay.textContent = `${zoom.wedgeHeightScale.toFixed(1)}×`;
  }

  on(refs.wedgeSpanInput, 'input', () => {
    state.zoom.setWedgeSpan(parseInt(refs.wedgeSpanInput.value, 10) / 100);
    refs.wedgeSpanDisplay.textContent = `${refs.wedgeSpanInput.value}%`;
    emitChange();
  });

  on(refs.wedgeGapInput, 'input', () => {
    state.zoom.setWedgeGap(parseInt(refs.wedgeGapInput.value, 10));
    refs.wedgeGapDisplay.textContent = `${refs.wedgeGapInput.value}px`;
    markWebGLDirty();
    render();
    emitChange();
  });

  on(refs.wedgeHeightInput, 'input', () => {
    const scale = parseFloat(refs.wedgeHeightInput.value);
    state.zoom.setWedgeHeightScale(scale);
    refs.wedgeHeightDisplay.textContent = `${scale.toFixed(1)}×`;
    markWebGLDirty();
    render();
    emitChange();
  });

  on(refs.resetZoomBtn, 'click', () => { state.zoom.resetZoom(); emitChange(); });
  on(refs.zoomInfoClose, 'click', () => { state.zoom.resetZoom(); updateZoomInfo(); emitChange(); });

  function updateZoomInfo() {
    const zoom = state.zoom;
    const renderData = getRenderData();
    if (zoom.zoomLevel <= 1.05 || !renderData || !renderData.totalLength) {
      refs.zoomInfo.hidden = true;
      return;
    }

    const halfSpan = (zoom.wedgeSpan * Math.PI) / zoom.zoomLevel;
    const startAngle = (zoom.focusAngle - halfSpan + 4 * Math.PI) % (2 * Math.PI);
    const endAngle = (zoom.focusAngle + halfSpan + 4 * Math.PI) % (2 * Math.PI);
    const perRadian = renderData.totalLength / (2 * Math.PI);

    refs.zoomInfoText.textContent = `${formatBases(Math.round(startAngle * perRadian))} – `
      + `${formatBases(Math.round(endAngle * perRadian))} `
      + `(${formatBases(Math.round(halfSpan * 2 * perRadian))} shown)`;
    refs.zoomInfo.hidden = false;
  }

  // ── Chrome: theme, collapse, export ───────────────────────────────────────

  on(refs.themeBtn, 'click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    render();
    buildGenomeToggles();
    emitChange();
  });

  on(refs.collapseBtn, 'click', () => setCollapsedState(true));
  on(refs.expandBtn, 'click', () => setCollapsedState(false));

  function setCollapsedState(collapsed) {
    refs.sidebar.classList.toggle('collapsed', collapsed);
    refs.expandBtn.hidden = !collapsed;
    setCollapsed(collapsed);
  }

  function flashLabel(button, text) {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, 1500);
  }

  on(refs.exportPngBtn, 'click', async () => {
    downloadBlob(await exportPNG(), 'pangenome.png');
  });

  on(refs.exportSvgBtn, 'click', () => {
    downloadBlob(new Blob([exportSVG()], { type: 'image/svg+xml' }), 'pangenome.svg');
  });

  on(refs.embedBtn, 'click', async () => {
    const snippet = `<iframe src="${window.location.href}" width="100%" height="600" `
      + 'frameborder="0" style="border:none" allowfullscreen></iframe>';
    flashLabel(refs.embedBtn, (await copyToClipboard(snippet)) ? 'Copied!' : 'Copy failed');
  });

  return {
    /**
     * Rebuild every control from state. Called whenever a config is applied — after
     * a data load and on each update() — so no select or toggle shows a stale value.
     */
    syncFromState() {
      populateRefOptions();
      populateGeneAnnotationSelects();
      populateGenomeAnnotationSelects();
      buildGenomeToggles();
      syncZoomInputs();
      refs.genomeSimilarityBtn.textContent = state.customGenomeOrder
        ? 'Clear gene-content sort'
        : 'Sort by gene content';
      refs.controlsPanel.hidden = state.rows.length === 0;
    },

    /** Called after every render, to keep the sidebar consistent with the figure. */
    refresh(renderData) {
      renderGeneLegend();
      renderGenomeLegend();
      updateGeneStats(renderData);
      updateGenomeStats();
      updateZoomInfo();
      syncZoomInputs();
      paintToggleColors(renderData);
      // Never overwrite what the user is typing into the combobox.
      if (refs.refList.hidden) setRefInputValue(state.referenceGenome || '');
    },

    /**
     * Called on animation frames where the zoom moved. Deliberately narrower than
     * refresh(): rebuilding legends and stats at 60fps would be wasted work.
     */
    onAnimate() {
      updateZoomInfo();
    },

    setCollapsed(collapsed) {
      refs.sidebar.classList.toggle('collapsed', collapsed);
      refs.expandBtn.hidden = !collapsed;
    },

    destroy() {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    },
  };
}
