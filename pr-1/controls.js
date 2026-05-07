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

  // ─── Boot ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    window.initFileUpload();
    window.initViz();
    window.initSelectionInteraction();
    window.initAnnotationUpload();
    window.initGenomeAnnotationUpload();
    window.initExportButtons();

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
