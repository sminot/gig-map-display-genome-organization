/**
 * Vector export.
 *
 * Every layer of the figure is emitted as SVG geometry; nothing is rasterised.
 *
 *   contig ring, genome rings, annotation track  annulus sectors
 *   contig labels                                <text>
 *   zoom wedge                                   annulus sectors, with the vertex
 *                                                shader's angular magnification
 *                                                re-derived in JS
 *   zoom indicator                               annulus sector
 *
 * Arcs are written directly rather than through d3.arc because the output has to
 * stay compact: a 70-genome display is hundreds of thousands of arcs, and one
 * `<path>` per ring with a fixed coordinate precision is what keeps the file
 * merely large instead of unusable.
 */

import { mainGeometry, wedgeGeometry } from './geometry.js';
import {
  CONTIG_COLOR, contigArcAngles, contigLabels, contigLabelColor,
  annotationTrackBackground, arrowPoints, escapeHtml,
} from './canvas-renderer.js';

const TWO_PI = 2 * Math.PI;
const PRECISION = 1;
const INDICATOR_COLOR = 'rgba(255,217,26,0.9)';

const BACKGROUND = { dark: '#1a1a2e', light: '#ffffff' };

const n = (value) => value.toFixed(PRECISION).replace(/\.0$/, '');

/** Annulus sector path, in a coordinate system centred on the circle. */
function sectorPath(innerR, outerR, startAngle, endAngle) {
  const span = endAngle - startAngle;
  if (span <= 0) return '';

  // A single arc command cannot span a full circle.
  if (span >= TWO_PI - 1e-9) {
    return `M0,${n(-outerR)}A${n(outerR)},${n(outerR)} 0 1 1 0,${n(outerR)}`
      + `A${n(outerR)},${n(outerR)} 0 1 1 0,${n(-outerR)}Z`
      + `M0,${n(-innerR)}A${n(innerR)},${n(innerR)} 0 1 0 0,${n(innerR)}`
      + `A${n(innerR)},${n(innerR)} 0 1 0 0,${n(-innerR)}Z`;
  }

  const large = span > Math.PI ? 1 : 0;
  const x = (r, a) => n(r * Math.sin(a));
  const y = (r, a) => n(-r * Math.cos(a));

  return `M${x(outerR, startAngle)},${y(outerR, startAngle)}`
    + `A${n(outerR)},${n(outerR)} 0 ${large} 1 ${x(outerR, endAngle)},${y(outerR, endAngle)}`
    + `L${x(innerR, endAngle)},${y(innerR, endAngle)}`
    + `A${n(innerR)},${n(innerR)} 0 ${large} 0 ${x(innerR, startAngle)},${y(innerR, startAngle)}`
    + 'Z';
}

function fullRingPath(innerR, outerR) {
  return sectorPath(innerR, outerR, 0, TWO_PI);
}

function pathElement(d, fill) {
  return d ? `<path fill="${fill}" d="${d}"/>` : '';
}

function mainCircleLayers(state, renderData, geometry) {
  const parts = [];

  let contigPath = '';
  for (const contig of renderData.contigs) {
    const { startAngle, endAngle } = contigArcAngles(contig, renderData.totalLength);
    if (endAngle <= startAngle) continue;
    contigPath += sectorPath(geometry.referenceRingInner, geometry.referenceRingOuter, startAngle, endAngle);
  }
  parts.push(pathElement(contigPath, CONTIG_COLOR));

  for (let i = 0; i < renderData.visibleGenomes.length; i++) {
    const genome = renderData.visibleGenomes[i];
    const geneMap = renderData.genomeGenes.get(genome);
    if (!geneMap) continue;

    const { outer, inner } = geometry.genomeRingBounds(i);
    let d = '';
    for (const [geneId, gene] of renderData.referenceGenes) {
      if (!geneMap.has(geneId)) continue;
      if (gene.endAngle <= gene.startAngle) continue;
      d += sectorPath(inner, outer, gene.startAngle, gene.endAngle);
    }
    parts.push(pathElement(d, renderData.genomeColors.get(genome) || renderData.colorScale(genome)));
  }

  if (renderData.annotActive) {
    const { annotRingInner: innerR, annotRingOuter: outerR } = geometry;
    parts.push(pathElement(fullRingPath(innerR, outerR), annotationTrackBackground(state.theme)));

    const isArrows = renderData.annotDisplayMode === 'arrows';
    // One path per colour, so a category with thousands of genes is one element.
    const byColor = new Map();
    for (const [geneId, gene] of renderData.referenceGenes) {
      if (gene.endAngle <= gene.startAngle) continue;
      const color = renderData.geneAnnotColors.get(geneId);
      if (!color) continue;

      const d = isArrows
        ? (() => {
          const [a, b, tip] = arrowPoints(gene, innerR, outerR);
          return `M${n(a[0])},${n(a[1])}L${n(b[0])},${n(b[1])}L${n(tip[0])},${n(tip[1])}Z`;
        })()
        : sectorPath(innerR, outerR, gene.startAngle, gene.endAngle);

      byColor.set(color, (byColor.get(color) || '') + d);
    }
    for (const [color, d] of byColor) parts.push(pathElement(d, color));
  }

  return parts.join('');
}

/**
 * Re-derive the wedge's angular magnification.
 *
 * The vertex shader maps a genome angle to a screen angle by
 * `clamp((geo - focus) * zoom, ±wedgeHalfSpan)`, discarding vertices whose
 * genome-space offset exceeds `dataHalfSpan`. Clamping each endpoint to
 * `dataHalfSpan` before magnifying reproduces that, and yields true arcs rather
 * than the shader's 16-segment approximation.
 */
function wedgeLayers(state, renderData, geometry) {
  const zoom = state.zoom;
  if (zoom.zoomLevel <= 1.05) return '';

  const wedge = wedgeGeometry(state, geometry.cx * 2, geometry.cy * 2, renderData);
  const wedgeHalfSpan = zoom.wedgeSpan * Math.PI;
  const dataHalfSpan = wedgeHalfSpan / zoom.zoomLevel;

  const toLocal = (angle) => {
    let local = angle - zoom.focusAngle;
    local = ((local + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    return local;
  };

  function screenAngles(startAngle, endAngle) {
    const s = toLocal(startAngle);
    const e = toLocal(endAngle);
    if (Math.abs(s) > dataHalfSpan && Math.abs(e) > dataHalfSpan && s * e > 0) return null;

    const clampData = (v) => Math.max(-dataHalfSpan, Math.min(dataHalfSpan, v));
    const clampWedge = (v) => Math.max(-wedgeHalfSpan, Math.min(wedgeHalfSpan, v));
    return [
      zoom.focusAngle + clampWedge(clampData(s) * zoom.zoomLevel),
      zoom.focusAngle + clampWedge(clampData(e) * zoom.zoomLevel),
    ];
  }

  const parts = [];

  renderData.visibleGenomes.forEach((genome, i) => {
    const geneMap = renderData.genomeGenes.get(genome);
    if (!geneMap) return;

    const inner = wedge.blowInner + i * wedge.genomeWidth;
    const outer = inner + wedge.genomeWidth - 1;

    let d = '';
    for (const [geneId, gene] of renderData.referenceGenes) {
      if (!geneMap.has(geneId)) continue;
      if (gene.endAngle <= gene.startAngle) continue;
      const angles = screenAngles(gene.startAngle, gene.endAngle);
      if (!angles) continue;
      d += sectorPath(inner, outer, angles[0], angles[1]);
    }
    parts.push(pathElement(d, renderData.genomeColors.get(genome) || renderData.colorScale(genome)));
  });

  if (renderData.annotActive && wedge.annotWidth > 0) {
    const inner = wedge.blowInner + wedge.numGenomes * wedge.genomeWidth;
    const outer = inner + wedge.annotWidth;
    const byColor = new Map();
    for (const [geneId, gene] of renderData.referenceGenes) {
      if (gene.endAngle <= gene.startAngle) continue;
      const color = renderData.geneAnnotColors.get(geneId);
      if (!color) continue;
      const angles = screenAngles(gene.startAngle, gene.endAngle);
      if (!angles) continue;
      byColor.set(color, (byColor.get(color) || '') + sectorPath(inner, outer, angles[0], angles[1]));
    }
    for (const [color, d] of byColor) parts.push(pathElement(d, color));
  }

  parts.push(pathElement(
    sectorPath(wedge.outerRadius + 2, wedge.outerRadius + 6,
      zoom.focusAngle - dataHalfSpan, zoom.focusAngle + dataHalfSpan),
    INDICATOR_COLOR,
  ));

  return parts.join('');
}

/**
 * Serialise the current figure as an SVG document.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object} options.renderData
 * @param {number} options.width  canvas pixel width
 * @param {number} options.height canvas pixel height
 * @returns {string}
 */
export function renderSVG({ state, renderData, width, height }) {
  const background = BACKGROUND[state.theme] || BACKGROUND.dark;

  if (!renderData || !renderData.contigs || renderData.contigs.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
      + `viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/></svg>`;
  }

  const geometry = mainGeometry(state, width, height, renderData);
  const labels = contigLabels(renderData, geometry)
    .map((label) => `<text x="${n(label.x)}" y="${n(label.y)}" text-anchor="middle" `
      + `dominant-baseline="middle" transform="rotate(${n(label.rotateDeg)},${n(label.x)},${n(label.y)})" `
      + `font-size="11" font-family="system-ui, sans-serif" fill="${contigLabelColor(state.theme)}">`
      + `${escapeHtml(label.id)}</text>`)
    .join('');

  const centred = mainCircleLayers(state, renderData, geometry) + wedgeLayers(state, renderData, geometry);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${background}"/>`
    + `<g transform="translate(${n(geometry.cx)},${n(geometry.cy)})">${centred}</g>`
    + labels
    + '</svg>';
}
