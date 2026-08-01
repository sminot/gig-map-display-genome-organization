/**
 * Data ingestion. Two entry paths reach the same normalised state:
 *
 *   - the standalone app fetches a gzipped CSV (`fetchText` + `parseAlignmentCsv`)
 *   - a library caller hands over rows it already has (`setAlignmentRows`)
 *
 * Nothing here touches the DOM.
 */

import Papa from 'papaparse';

const NUMERIC_FIELDS = new Set([
  'qstart', 'qend', 'qlen', 'sstart', 'send', 'slen', 'length', 'pident', 'coverage',
]);

/** Fetch a URL as text, transparently decompressing gzip. */
export async function fetchText(url) {
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(url) && !/^https?:\/\//i.test(url)) {
    throw new Error('Only http://, https://, and relative URLs are supported.');
  }

  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    const corsHint = /^https?:\/\//i.test(url) ? ' — check that the server allows CORS requests' : '';
    throw new Error(`Could not fetch ${url}${corsHint}. (${e.message})`);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);

  const isGzip = /\.gz$/i.test(url.split('?')[0])
    || (resp.headers.get('content-encoding') || '').toLowerCase().includes('gzip');
  if (!isGzip) return resp.text();

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress gzip. Use Chrome, Firefox, or Edge.');
  }
  const decompressed = resp.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(decompressed).text();
}

/** Parse a gig-map alignment CSV into row objects. */
export function parseAlignmentCsv(text) {
  const result = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });

  const fatal = (result.errors || []).find((e) => e.type === 'Delimiter' || e.type === 'Quotes');
  if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);

  return result.data;
}

/**
 * Normalise rows and populate the alignment part of `state`.
 * Resets the reference genome and visible set, matching a fresh load.
 */
export function setAlignmentRows(state, rawRows, sourceUrl = null) {
  const genomeSet = new Set();

  state.rows = rawRows.map((raw) => {
    const row = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === '' || key === undefined) continue;
      row[key] = NUMERIC_FIELDS.has(key)
        ? (typeof value === 'number' ? value : parseFloat(value))
        : value;
    }
    genomeSet.add(row.genome);
    return row;
  });

  state.allGenomes = [...genomeSet].sort();
  state.referenceGenome = state.allGenomes[0] ?? null;
  state.visibleGenomes = new Set(state.allGenomes.filter((g) => g !== state.referenceGenome));
  state.customGenomeOrder = null;
  state.sourceUrl = sourceUrl;
}

/**
 * Parse an annotation CSV/TSV into `{ rawData, columns }`.
 *
 * @param {string} text
 * @param {string|null} preferredIdField column to key on, if present
 */
export function parseAnnotationCsv(text, preferredIdField = null) {
  const result = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter: '',
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });

  const fields = result.meta && result.meta.fields;
  if (!fields || fields.length < 1) {
    throw new Error('Could not detect columns in the annotation file.');
  }

  return annotationRowsToMap(result.data, fields, preferredIdField);
}

/**
 * Turn caller-supplied annotation rows into `{ rawData, columns }`.
 * Column order is taken from `fields` when given, else from the first row.
 */
export function annotationRowsToMap(rows, fields = null, preferredIdField = null) {
  const names = fields || (rows.length > 0 ? Object.keys(rows[0]) : []);
  if (names.length < 1) return { rawData: new Map(), columns: [] };

  const idField = (preferredIdField && names.includes(preferredIdField))
    ? preferredIdField
    : names[0];
  const columns = names.filter((f) => f !== idField);

  const rawData = new Map();
  for (const row of rows) {
    const rawId = row[idField];
    if (rawId === null || rawId === undefined) continue;
    const id = String(rawId).trim();
    if (id) rawData.set(id, row);
  }

  return { rawData, columns };
}
