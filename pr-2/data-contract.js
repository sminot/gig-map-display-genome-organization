/**
 * Shared data contract — single source of truth for all state singletons.
 * Loaded first by index.html; every other script may read these objects.
 */

// ─── App State ────────────────────────────────────────────────────────────────
const AppState = {
  rows: [],
  allGenomes: [],
  referenceGenome: null,
  visibleGenomes: new Set(),
  customGenomeOrder: null, // string[] | null — greedy gene-similarity ordering
};

// ─── Gene Annotation State ────────────────────────────────────────────────────
// Populated by annotation.js when the user uploads a gene annotation file.
const GeneAnnotationState = {
  rawData:            new Map(), // geneId → row object
  columns:            [],        // string[] — all column names (col 2+)
  categoryColumn:     null,      // string | null
  labelColumn:        null,      // string | null — column shown as gene name in tooltip
  selectedCategories: new Set(), // Set<string> — selected values
  categoryValues:     [],        // string[] — all unique values, sorted
  categoryCounts:     new Map(), // value → count in rawData
  scale:              null,      // d3 ordinal scale (value → color)
  customColors:       new Map(), // category → hex color override
  displayMode:        'bars',
  loadedURL:          null,
};

// ─── Genome Annotation State ──────────────────────────────────────────────────
// Populated by genome-annotation.js when the user uploads a genome annotation file.
const GenomeAnnotationState = {
  rawData:       new Map(), // genomeId → row object
  columns:       [],        // string[] — annotation column names (col 2+)
  colorColumn:   null,      // string | null — column used to color rings
  groupColumn:   null,      // string | null — groups+sorts rings (overrides colorColumn for color)
  groupScale:    null,      // d3 ordinal scale | null
  groupDomain:   [],        // unique sorted values for groupColumn
  labelColumn:   null,      // string | null — column shown as genome name in tooltip
  tooltipColumns: [],       // string[] — extra columns shown in mouseover
  sortColumn:    null,      // string | null — column used to sort rings
  sortAscending: true,
  palette:       'Tableau10', // name of the active D3 palette
  scale:         null,        // d3 ordinal scale | null
  domain:        [],          // unique category values for the color column
  loadedURL:     null,
};

// ─── Render Data (shape documentation) ───────────────────────────────────────
// Produced by buildRenderData() in app.js, passed to drawVisualization().
//
// {
//   contigs: Array<{ id: string, length: number, cumStart: number }>,
//   totalLength: number,
//
//   referenceGenes: Map<string, {
//     contigId: string, qstart: number, qend: number,
//     startAngle: number, endAngle: number, midAngle: number,
//     pident: number, coverage: number,
//   }>,
//
//   genomeGenes: Map<string, Map<string, { pident: number, coverage: number }>>,
//
//   visibleGenomes: string[],
//     // Ordered list respecting GenomeAnnotationState.sortColumn when set.
//
//   colorScale: Function,
//     // Fallback d3 ordinal scale (genome → color).
//
//   // Pre-resolved annotation data (avoids renderer coupling to annotation modules):
//   annotActive:        boolean,         // true when categoryColumn is set
//   annotDisplayMode:   'bars' | 'arrows',
//   geneAnnotColors:    Map<string, string>,  // geneId → CSS color (only highlighted genes)
//   genomeColors:       Map<string, string>,  // genome → CSS color (annotation > colorScale)
// }

// Row shape (one per CSV row in the alignment file):
// {
//   qseqid, sseqid, pident, length, qstart, qend, qlen,
//   sstart, send, slen, genome, coverage   (all types per column map above)
// }

// ─── Shared utilities ─────────────────────────────────────────────────────────

/**
 * Map a palette name to its d3 color array.
 * Shared by annotation.js and genome-annotation.js.
 */
window.getPalette = function getPalette(name) {
  var palettes = {
    'Tableau10': d3.schemeTableau10,
    'Pastel1':   d3.schemePastel1,
    'Set1':      d3.schemeSet1,
    'Set2':      d3.schemeSet2,
    'Set3':      d3.schemeSet3,
    'Accent':    d3.schemeAccent,
    'Dark2':     d3.schemeDark2,
    'Paired':    d3.schemePaired,
  };
  return palettes[name] || d3.schemeTableau10;
};

/**
 * Read a File object to a UTF-8 string, decompressing gzip if needed.
 * Shared by annotation.js and genome-annotation.js.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
/**
 * Fetch a URL to a UTF-8 string, decompressing gzip if needed.
 * Detects gzip by URL extension (.gz) or response Content-Encoding header.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
window.readURLAsText = async function readURLAsText(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  var resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error('Could not fetch URL — check that the server allows CORS requests. (' + e.message + ')');
  }
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' fetching URL.');

  var isGzip = /\.gz$/i.test(url.split('?')[0]) ||
               (resp.headers.get('content-encoding') || '').toLowerCase().includes('gzip');

  if (!isGzip) return resp.text();

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Your browser does not support gzip decompression. Please use Chrome, Firefox, or Edge.');
  }
  var ds = new DecompressionStream('gzip');
  var decompressed = resp.body.pipeThrough(ds);
  return new Response(decompressed).text();
};

window.readFileAsText = async function readFileAsText(file) {
  // Detect gzip by magic bytes 0x1F 0x8B.
  var headerBuf   = await file.slice(0, 2).arrayBuffer();
  var headerBytes = new Uint8Array(headerBuf);
  var isGzip      = headerBytes[0] === 0x1f && headerBytes[1] === 0x8b;

  if (!isGzip) return file.text();

  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Your browser does not support gzip decompression. ' +
      'Please use Chrome, Firefox, or Edge.'
    );
  }
  var ds           = new DecompressionStream('gzip');
  var decompressed = file.stream().pipeThrough(ds);
  return new Response(decompressed).text();
};
