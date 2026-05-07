/**
 * app.js — Data pipeline for the Pangenome Viewer.
 *
 * Responsibilities:
 *   - File upload / drag-and-drop wiring  (initFileUpload)
 *   - Gzip decompression + CSV parsing    (loadFile)
 *   - RenderData computation              (buildRenderData)
 *   - AppState mutation helpers           (setReference, toggleGenome)
 *
 * All public symbols are attached to `window` so that controls.js and
 * genome-viz.js can reference them without ES-module imports.
 */

// ─── Expose AppState globally ────────────────────────────────────────────────
// AppState is declared in data-contract.js (loaded before this script).
window.AppState = AppState;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return the element, throwing a clear error if missing. */
function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} not found in DOM`);
  return node;
}

// ─── 1. initFileUpload ────────────────────────────────────────────────────────

function initFileUpload() {
  const dropZone = el('drop-zone');
  const fileInput = el('file-input');

  // Drag-over: highlight the zone
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  // Drag-leave: remove highlight
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  // Drop: load the file
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Keyboard accessibility: Enter / Space activates the hidden file input
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Click on the drop-zone opens the file picker.
  // fileInput already covers the zone (position:absolute;inset:0), so a direct
  // click on the zone hits the input natively.  Stop propagation here to prevent
  // that click from also bubbling up and triggering fileInput.click() a second time.
  fileInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // File picker selection
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) loadFile(file);
    // Reset so the same file can be re-selected
    fileInput.value = '';
  });
}

window.initFileUpload = initFileUpload;

// ─── 2. loadFile ─────────────────────────────────────────────────────────────

// Shared CSV parsing + AppState population. Called by both loadFile and loadFileFromURL.
async function processMainCSVText(text) {
  const result = Papa.parse(text, {
    header:         true,
    dynamicTyping:  true,
    skipEmptyLines: true,
  });

  if (result.errors && result.errors.length > 0) {
    const fatal = result.errors.find(
      (err) => err.type === 'Delimiter' || err.type === 'Quotes'
    );
    if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
  }

  const numericFields = new Set([
    'qstart', 'qend', 'qlen',
    'sstart', 'send', 'slen',
    'length', 'pident', 'coverage',
  ]);

  AppState.rows = result.data.map((raw) => {
    const row = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === '' || key === undefined) continue;
      row[key] = numericFields.has(key)
        ? (typeof value === 'number' ? value : parseFloat(value))
        : value;
    }
    return row;
  });

  const genomeSet = new Set(AppState.rows.map((r) => r.genome));
  AppState.allGenomes = [...genomeSet].sort();

  AppState.referenceGenome = AppState.allGenomes[0] ?? null;
  AppState.visibleGenomes  = new Set(
    AppState.allGenomes.filter((g) => g !== AppState.referenceGenome)
  );
}

async function loadFile(file) {
  const loadingIndicator = el('loading-indicator');
  const controlsPanel    = el('controls-panel');
  const errorMessage     = el('error-message');

  loadingIndicator.hidden = false;
  controlsPanel.hidden    = true;
  errorMessage.hidden     = true;
  errorMessage.textContent = '';

  try {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'Your browser does not support gzip decompression. ' +
        'Please use Chrome, Firefox, or Edge.'
      );
    }

    const ds           = new DecompressionStream('gzip');
    const decompressed = file.stream().pipeThrough(ds);
    const text         = await new Response(decompressed).text();

    await processMainCSVText(text);

    AppState.loadedDataURL = null;
    loadingIndicator.hidden = true;
    if (typeof window.onDataLoaded === 'function') window.onDataLoaded();

  } catch (err) {
    loadingIndicator.hidden  = true;
    errorMessage.hidden      = false;
    errorMessage.textContent = err.message || String(err);
  }
}

async function loadFileFromURL(url) {
  const loadingIndicator = el('loading-indicator');
  const controlsPanel    = el('controls-panel');
  const errorMessage     = el('error-message');

  loadingIndicator.hidden = false;
  controlsPanel.hidden    = true;
  errorMessage.hidden     = true;
  errorMessage.textContent = '';

  try {
    const text = await window.readURLAsText(url);
    await processMainCSVText(text);

    AppState.loadedDataURL = url;
    loadingIndicator.hidden = true;
    if (typeof window.onDataLoaded === 'function') window.onDataLoaded();

  } catch (err) {
    loadingIndicator.hidden  = true;
    errorMessage.hidden      = false;
    errorMessage.textContent = err.message || String(err);
  }
}

window.loadFile        = loadFile;
window.loadFileFromURL = loadFileFromURL;

// ─── 3. buildRenderData ───────────────────────────────────────────────────────

function buildRenderData() {
  const TWO_PI      = 2 * Math.PI;
  const ANGLE_OFFSET = 0; // d3.arc() convention: 0 = top (12 o'clock), clockwise

  // ── Step 1: Contigs from the reference genome ──────────────────────────────
  const refRows = AppState.rows.filter(
    (r) => r.genome === AppState.referenceGenome
  );

  // Collect unique contig lengths (qlen is stable per qseqid)
  const contigLengthMap = new Map(); // qseqid → qlen
  for (const row of refRows) {
    if (!contigLengthMap.has(row.qseqid)) {
      contigLengthMap.set(row.qseqid, row.qlen);
    }
  }

  // Sort contigs by descending length
  const sortedContigEntries = [...contigLengthMap.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  // Assign cumulative start positions and compute total length
  let cumStart   = 0;
  const contigMap = new Map(); // qseqid → { id, length, cumStart }
  const contigs   = [];

  for (const [id, length] of sortedContigEntries) {
    const contig = { id, length, cumStart };
    contigMap.set(id, contig);
    contigs.push(contig);
    cumStart += length;
  }

  const totalLength = cumStart;

  // ── Step 2: Reference genes ────────────────────────────────────────────────
  const referenceGenes = new Map(); // sseqid → gene object

  for (const row of refRows) {
    const contig = contigMap.get(row.qseqid);
    if (!contig) continue; // should never happen

    const existing = referenceGenes.get(row.sseqid);

    // Keep the row with the highest coverage; if equal, keep first seen
    if (existing && existing.coverage >= row.coverage) continue;

    const baseStart  = contig.cumStart + row.qstart;
    const baseEnd    = contig.cumStart + row.qend;
    const startAngle = (baseStart / totalLength) * TWO_PI + ANGLE_OFFSET;
    const endAngle   = (baseEnd   / totalLength) * TWO_PI + ANGLE_OFFSET;
    // Use seam-safe midAngle: simple average works unless the arc crosses 0/2π.
    const midAngle = (endAngle >= startAngle)
      ? (startAngle + endAngle) / 2
      : ((startAngle + endAngle + 2 * Math.PI) / 2) % (2 * Math.PI);

    referenceGenes.set(row.sseqid, {
      contigId:   row.qseqid,
      qstart:     row.qstart,
      qend:       row.qend,
      startAngle,
      endAngle,
      midAngle,
      pident:     row.pident,
      coverage:   row.coverage,
    });
  }

  // ── Step 3: All non-reference genomes → genomeGenes ───────────────────────
  const genomeGenes = new Map(); // genome → Map<sseqid, { pident, coverage }>

  for (const row of AppState.rows) {
    if (row.genome === AppState.referenceGenome) continue;

    if (!genomeGenes.has(row.genome)) {
      genomeGenes.set(row.genome, new Map());
    }

    const geneMap  = genomeGenes.get(row.genome);
    const existing = geneMap.get(row.sseqid);

    // Keep highest-coverage hit per gene per genome
    if (!existing || row.coverage > existing.coverage) {
      geneMap.set(row.sseqid, {
        pident:   row.pident,
        coverage: row.coverage,
      });
    }
  }

  // ── Step 4: Color scale ────────────────────────────────────────────────────
  const colorScale = d3
    .scaleOrdinal(d3.schemeTableau10.concat(d3.schemePastel1))
    .domain(AppState.allGenomes);

  // ── Step 5: Visible genomes (sorted — respects genome annotation sort column) ─
  const visibleGenomesArr = [...AppState.visibleGenomes];
  const visibleGenomes = (window.getGenomeSortedOrder)
    ? window.getGenomeSortedOrder(visibleGenomesArr)
    : visibleGenomesArr.sort();

  // ── Step 6: Pre-resolve annotation data ───────────────────────────────────
  // Annotation functions (from annotation.js/genome-annotation.js) may not yet
  // exist on the first call, so we guard every access.
  const annotActive       = !!(window.GeneAnnotationState && window.GeneAnnotationState.activeColumn);
  const annotIsContinuous = annotActive && window.GeneAnnotationState.columnType === 'continuous';
  const annotColumnName   = annotActive ? window.GeneAnnotationState.activeColumn : null;

  const geneAnnotColors       = new Map();
  const geneAnnotBarFractions = new Map();
  const geneAnnotValues       = new Map();

  if (annotActive) {
    for (const geneId of referenceGenes.keys()) {
      const color = window.getGeneAnnotationColor ? window.getGeneAnnotationColor(geneId) : null;
      if (color) geneAnnotColors.set(geneId, color);

      if (annotIsContinuous) {
        const frac = window.getGeneAnnotationBarFraction
          ? window.getGeneAnnotationBarFraction(geneId) : null;
        if (frac !== null) geneAnnotBarFractions.set(geneId, frac);
      }

      const val = window.getGeneAnnotationValue ? window.getGeneAnnotationValue(geneId) : null;
      if (val !== null) geneAnnotValues.set(geneId, val);
    }
  }

  // Pre-resolve per-genome ring colors (genome annotation > default colorScale).
  const genomeColors = new Map();
  for (const genome of AppState.allGenomes) {
    const annotColor = window.getGenomeAnnotationColor
      ? window.getGenomeAnnotationColor(genome) : null;
    genomeColors.set(genome, annotColor || colorScale(genome));
  }

  // ── Return RenderData ─────────────────────────────────────────────────────
  const renderData = {
    contigs,
    totalLength,
    referenceGenes,
    genomeGenes,
    visibleGenomes,
    colorScale,
    annotActive,
    annotIsContinuous,
    annotColumnName,
    geneAnnotColors,
    geneAnnotBarFractions,
    geneAnnotValues,
    genomeColors,
  };

  if (typeof window.updateWebGLRenderData === 'function') {
    window.updateWebGLRenderData(renderData);
  }

  return renderData;
}

window.buildRenderData = buildRenderData;

// ─── 4. setReference & toggleGenome ─────────────────────────────────────────

function setReference(genomeId) {
  if (genomeId === AppState.referenceGenome) return;

  const oldReference = AppState.referenceGenome;

  // Move old reference into visible set (if it exists)
  if (oldReference !== null) {
    AppState.visibleGenomes.add(oldReference);
  }

  // Remove new reference from visible set
  AppState.visibleGenomes.delete(genomeId);

  AppState.referenceGenome = genomeId;

  if (typeof window.onStateChanged === 'function') {
    window.onStateChanged();
  }
}

function toggleGenome(genomeId, visible) {
  if (visible) {
    AppState.visibleGenomes.add(genomeId);
  } else {
    AppState.visibleGenomes.delete(genomeId);
  }

  if (typeof window.onStateChanged === 'function') {
    window.onStateChanged();
  }
}

window.setReference  = setReference;
window.toggleGenome  = toggleGenome;
