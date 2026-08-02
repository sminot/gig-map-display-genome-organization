/**
 * Canvas 2D renderer for the main circle, plus pointer hit-testing and the
 * tooltip. Arcs are generated as SVG path strings by d3 and rasterised through
 * Path2D, which is what lets the SVG exporter emit the same shapes as vectors.
 */

import { arc } from 'd3';
import { mainGeometry, wedgeGeometry } from './geometry.js';

const TWO_PI = 2 * Math.PI;
const CONTIG_GAP_RADIANS = (1.5 * Math.PI) / 180;
const CONTIG_LABEL_MIN_LENGTH = 50000;
const SNAP_PX = 12;
const ANGLE_SNAP = 0.05; // radians, about 3°
const SVG_NS = 'http://www.w3.org/2000/svg';

export const CONTIG_COLOR = '#6366f1';

export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function contigLabelColor(theme) {
  return theme === 'light' ? '#475569' : '#94a3b8';
}

export function annotationTrackBackground(theme) {
  return theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
}

/** Labelled contigs and their label placement, shared with the SVG exporter. */
export function contigLabels(renderData, geometry) {
  const labelRadius = (renderData.annotActive ? geometry.annotRingOuter : geometry.referenceRingOuter) + 12;

  return renderData.contigs
    .filter((contig) => contig.length >= CONTIG_LABEL_MIN_LENGTH)
    .map((contig) => {
      const midAngle = ((contig.cumStart + contig.length / 2) / renderData.totalLength) * TWO_PI;
      const x = geometry.cx + labelRadius * Math.sin(midAngle);
      const y = geometry.cy - labelRadius * Math.cos(midAngle);
      let rotateDeg = (midAngle * 180) / Math.PI;
      if (midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2) rotateDeg += 180;
      return { id: contig.id, x, y, rotateDeg };
    });
}

/** Angular extent of a contig band, minus the inter-contig gap. */
export function contigArcAngles(contig, totalLength) {
  const startAngle = (contig.cumStart / totalLength) * TWO_PI;
  const endAngle = ((contig.cumStart + contig.length) / totalLength) * TWO_PI - CONTIG_GAP_RADIANS;
  return { startAngle, endAngle };
}

/** Inward-pointing triangle for a gene in 'arrows' display mode, centred on the origin. */
export function arrowPoints(gene, innerR, outerR) {
  const midAngle = (gene.startAngle + gene.endAngle) / 2;
  const theta = midAngle - Math.PI / 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const midR = (innerR + outerR) / 2;
  const geneSpanPx = midR * Math.abs(gene.endAngle - gene.startAngle);
  const halfW = Math.max(3, Math.min(geneSpanPx / 2, (outerR - innerR) * 0.5));
  return [
    [cos * outerR - sin * halfW, sin * outerR + cos * halfW],
    [cos * outerR + sin * halfW, sin * outerR - cos * halfW],
    [cos * (innerR + 1), sin * (innerR + 1)],
  ];
}

export function createCanvasRenderer({ state, refs }) {
  const canvas = refs.canvas;
  const ctx = canvas.getContext('2d');
  const svg = refs.overlay;
  const arcGen = arc();

  let renderData = null;
  let geometry = null;

  const makeArcPath = (innerRadius, outerRadius, startAngle, endAngle) =>
    arcGen({ innerRadius, outerRadius, startAngle, endAngle });

  function draw(nextRenderData) {
    if (nextRenderData) renderData = nextRenderData;
    if (!renderData) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    if (!renderData.contigs || renderData.contigs.length === 0) {
      geometry = null;
      return;
    }

    geometry = mainGeometry(state, width, height, renderData);
    const { cx, cy, referenceRingInner, referenceRingOuter, annotRingInner, annotRingOuter } = geometry;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = CONTIG_COLOR;
    for (const contig of renderData.contigs) {
      const { startAngle, endAngle } = contigArcAngles(contig, renderData.totalLength);
      if (endAngle <= startAngle) continue;
      const path = makeArcPath(referenceRingInner, referenceRingOuter, startAngle, endAngle);
      if (path) ctx.fill(new Path2D(path));
    }

    for (let i = 0; i < renderData.visibleGenomes.length; i++) {
      const genome = renderData.visibleGenomes[i];
      const geneMap = renderData.genomeGenes.get(genome);
      if (!geneMap) continue;

      const { outer, inner } = geometry.genomeRingBounds(i);
      ctx.fillStyle = renderData.genomeColors.get(genome) || renderData.colorScale(genome);

      const batch = new Path2D();
      for (const [geneId, gene] of renderData.referenceGenes) {
        if (!geneMap.has(geneId)) continue;
        // Reverse-strand genes have endAngle <= startAngle and are never drawn.
        if (gene.endAngle <= gene.startAngle) continue;
        const path = makeArcPath(inner, outer, gene.startAngle, gene.endAngle);
        if (path) batch.addPath(new Path2D(path));
      }
      ctx.fill(batch);
    }

    if (renderData.annotActive) {
      drawAnnotationRing(annotRingInner, annotRingOuter);
    }

    ctx.restore();

    for (const label of contigLabels(renderData, geometry)) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', label.x);
      text.setAttribute('y', label.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', `rotate(${label.rotateDeg},${label.x},${label.y})`);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.setAttribute('fill', contigLabelColor(state.theme));
      text.textContent = label.id;
      svg.appendChild(text);
    }
  }

  function drawAnnotationRing(innerR, outerR) {
    const background = makeArcPath(innerR, outerR, 0, TWO_PI);
    if (background) {
      ctx.fillStyle = annotationTrackBackground(state.theme);
      ctx.fill(new Path2D(background));
    }

    const isArrows = renderData.annotDisplayMode === 'arrows';
    for (const [geneId, gene] of renderData.referenceGenes) {
      if (gene.endAngle <= gene.startAngle) continue;
      const color = renderData.geneAnnotColors.get(geneId);
      if (!color) continue;

      ctx.fillStyle = color;
      if (isArrows) {
        const [a, b, tip] = arrowPoints(gene, innerR, outerR);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(tip[0], tip[1]);
        ctx.closePath();
        ctx.fill();
      } else {
        const path = makeArcPath(innerR, outerR, gene.startAngle, gene.endAngle);
        if (path) ctx.fill(new Path2D(path));
      }
    }
  }

  function resize() {
    const w = refs.vizContainer.clientWidth;
    const h = refs.vizContainer.clientHeight;
    if (w === 0 || h === 0) return;

    canvas.width = w;
    canvas.height = h;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    draw();
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  const bandDist = (r, lo, hi) => (r < lo ? lo - r : (r > hi ? r - hi : 0));

  /** Which ring the pointer is over, and the genome angle to search for a gene. */
  function resolveRing(r, theta) {
    const zoom = state.zoom;

    if (zoom.zoomLevel > 1.05) {
      const wedge = wedgeGeometry(state, canvas.width, canvas.height, renderData);
      if (r >= wedge.blowInner - SNAP_PX) {
        if (r > wedge.blowOuter + SNAP_PX) return null;

        const wedgeHalfSpan = zoom.wedgeSpan * Math.PI;
        let localAngle = theta - zoom.focusAngle;
        if (localAngle > Math.PI) localAngle -= TWO_PI;
        if (localAngle < -Math.PI) localAngle += TWO_PI;
        if (Math.abs(localAngle) > wedgeHalfSpan + 0.05) return null;

        // Invert the shader's angular magnification to get back to genome space.
        const genomeAngle = zoom.focusAngle + localAngle / zoom.zoomLevel;
        const searchAngle = ((genomeAngle % TWO_PI) + TWO_PI) % TWO_PI;

        let best = SNAP_PX;
        let hit = null;
        for (let i = 0; i < renderData.visibleGenomes.length; i++) {
          const inner = wedge.blowInner + i * wedge.genomeWidth;
          const d = bandDist(r, inner, inner + wedge.genomeWidth - 1);
          if (d < best) { best = d; hit = { genome: renderData.visibleGenomes[i] }; }
        }
        if (renderData.annotActive && wedge.annotWidth > 0) {
          const annStart = wedge.blowInner + wedge.numGenomes * wedge.genomeWidth;
          if (bandDist(r, annStart, annStart + wedge.annotWidth) < best) hit = { isAnnotation: true };
        }
        return hit ? { ...hit, searchAngle } : null;
      }
    }

    let best = SNAP_PX;
    let hit = null;

    const dRef = bandDist(r, geometry.referenceRingInner, geometry.referenceRingOuter);
    if (dRef < best) { best = dRef; hit = { isReference: true }; }

    if (renderData.annotActive) {
      const dAnn = bandDist(r, geometry.annotRingInner, geometry.annotRingOuter);
      if (dAnn < best) { best = dAnn; hit = { isAnnotation: true }; }
    }

    for (let i = 0; i < renderData.visibleGenomes.length; i++) {
      const { outer, inner } = geometry.genomeRingBounds(i);
      const d = bandDist(r, inner, outer);
      if (d < best) { best = d; hit = { genome: renderData.visibleGenomes[i] }; }
    }

    return hit ? { ...hit, searchAngle: theta } : null;
  }

  /** Nearest reference gene to `searchAngle`, within ANGLE_SNAP. */
  function findGene(searchAngle) {
    let bestDist = ANGLE_SNAP;
    let found = null;

    for (const [geneId, gene] of renderData.referenceGenes) {
      if (gene.endAngle <= gene.startAngle) continue;

      const sa = gene.startAngle < 0 ? gene.startAngle + TWO_PI : gene.startAngle;
      const ea = gene.endAngle < 0 ? gene.endAngle + TWO_PI : gene.endAngle;

      const inside = sa <= ea
        ? (searchAngle >= sa && searchAngle <= ea)
        : (searchAngle >= sa || searchAngle <= ea);

      let d = 0;
      if (!inside) {
        const dSa = Math.min(Math.abs(searchAngle - sa), TWO_PI - Math.abs(searchAngle - sa));
        const dEa = Math.min(Math.abs(searchAngle - ea), TWO_PI - Math.abs(searchAngle - ea));
        d = Math.min(dSa, dEa);
      }

      if (d < bestDist) { bestDist = d; found = { geneId, gene }; }
    }
    return found;
  }

  function tooltipRow(label, value, style = '') {
    return `<div class="tooltip-row"><span class="tooltip-label">${escapeHtml(label)}:</span>`
      + `<span class="tooltip-value"${style}>${escapeHtml(value)}</span></div>`;
  }

  function buildTooltipHtml(hit, geneId, gene) {
    const ga = state.geneAnnot;
    const gna = state.genomeAnnot;

    let pident = null;
    let coverage = null;
    let genomeName = 'Reference';

    if (hit.genome) {
      genomeName = hit.genome;
      const geneData = renderData.genomeGenes.get(hit.genome)?.get(geneId);
      if (geneData) { pident = geneData.pident; coverage = geneData.coverage; }
    } else {
      pident = gene.pident;
      coverage = gene.coverage;
    }

    let html = '';

    if (ga.labelColumn) {
      const row = ga.rawData.get(geneId);
      const value = row && row[ga.labelColumn];
      if (value !== null && value !== undefined && value !== '') html += tooltipRow('Name', value);
    }
    html += tooltipRow('Gene', geneId);

    const genomeRow = hit.genome ? gna.rawData.get(String(hit.genome)) : null;
    if (genomeRow && gna.labelColumn) {
      const value = genomeRow[gna.labelColumn];
      if (value !== null && value !== undefined && value !== '') html += tooltipRow('Name', value);
    }
    html += tooltipRow('Genome', genomeName);

    if (genomeRow) {
      for (const col of gna.tooltipColumns) {
        const value = genomeRow[col];
        if (value !== null && value !== undefined && value !== '') html += tooltipRow(col, value);
      }
    }

    html += tooltipRow('Position', `${gene.contigId}:${gene.qstart}–${gene.qend}`);
    html += tooltipRow('Identity', pident != null ? `${pident.toFixed(1)}%` : 'N/A');
    html += tooltipRow('Coverage', coverage != null ? `${coverage.toFixed(1)}%` : 'N/A');

    if (renderData.annotActive && ga.categoryColumn) {
      const row = ga.rawData.get(geneId);
      const value = row && row[ga.categoryColumn];
      if (value !== null && value !== undefined && value !== '') {
        const highlight = renderData.geneAnnotColors.get(geneId);
        html += tooltipRow(ga.categoryColumn, value, highlight ? ` style="color:${highlight}"` : '');
      }
    }

    return html;
  }

  function positionTooltip(event) {
    const tooltip = refs.tooltip;
    const OFFSET = 12;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = event.clientX + OFFSET;
    let top = event.clientY + OFFSET;
    if (left + tw > vw) left = event.clientX - OFFSET - tw;
    if (top + th > vh) top = event.clientY - OFFSET - th;

    tooltip.style.left = `${Math.max(0, Math.min(left, vw - tw))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(top, vh - th))}px`;
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip() {
    refs.tooltip.setAttribute('aria-hidden', 'true');
  }

  function handleMouseMove(event) {
    if (!renderData || !geometry) { hideTooltip(); return; }

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left - geometry.cx;
    const my = event.clientY - rect.top - geometry.cy;
    const r = Math.sqrt(mx * mx + my * my);

    // Angle convention: 0 at 12 o'clock, increasing clockwise.
    let theta = Math.atan2(my, mx) + Math.PI / 2;
    if (theta < 0) theta += TWO_PI;
    if (theta >= TWO_PI) theta -= TWO_PI;

    const hit = resolveRing(r, theta);
    if (!hit) { hideTooltip(); return; }

    const found = findGene(hit.searchAngle);
    if (!found) { hideTooltip(); return; }

    refs.tooltip.innerHTML = buildTooltipHtml(hit, found.geneId, found.gene);
    positionTooltip(event);
  }

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', hideTooltip);

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(refs.vizContainer);
  resize();

  return {
    draw,
    resize,
    getGeometry: () => geometry,
    getRenderData: () => renderData,
    destroy() {
      resizeObserver.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', hideTooltip);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderData = null;
      geometry = null;
    },
  };
}
