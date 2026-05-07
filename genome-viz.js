/**
 * genome-viz.js — D3/Canvas circular genome visualization engine.
 *
 * Exposes two functions on window:
 *   window.initViz()                  — called once on DOMContentLoaded
 *   window.drawVisualization(data)    — called by controls.js on every state change
 *
 * Reads from: RenderData (see data-contract.js for shape)
 * Touches only: #main-canvas, #overlay-svg, #viz-container, #tooltip
 */

(function () {
  'use strict';

  // ─── Module-level state ───────────────────────────────────────────────────

  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D} */
  let ctx;
  /** @type {SVGSVGElement} */
  let svg;

  // Last render data — kept so resizeCanvas() can redraw.
  let lastRenderData = null;

  // Geometry snapshot from the last draw — needed for hit detection.
  let lastGeometry = null;

  // ─── Public API ───────────────────────────────────────────────────────────

  function initViz() {
    canvas = document.getElementById('main-canvas');
    ctx = canvas.getContext('2d');
    svg = document.getElementById('overlay-svg');

    resizeCanvas();

    const container = document.getElementById('viz-container');
    if (container && window.ResizeObserver) {
      const ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(container);
    }

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', hideTooltip);
  }

  function drawVisualization(renderData) {
    if (!canvas || !ctx) return;

    lastRenderData = renderData;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    if (!renderData || !renderData.contigs || renderData.contigs.length === 0) {
      return;
    }

    const cx = width / 2;
    const cy = height / 2;

    // ── Ring geometry ──────────────────────────────────────────────────────

    const outerRadius       = Math.min(cx, cy) * 0.92;
    const referenceRingWidth = 18;
    const numGenomes        = Math.max(1, renderData.visibleGenomes.length);

    const referenceRingOuter = outerRadius;
    const referenceRingInner = outerRadius - referenceRingWidth;

    // Annotation ring sits just inside the reference ring when active.
    const ANNOT_WIDTH  = 14;
    const ANNOT_GAP    = 3;
    const annotActive  = renderData.annotActive;
    const annotRingOuter = annotActive ? referenceRingInner - ANNOT_GAP : referenceRingInner;
    const annotRingInner = annotActive ? annotRingOuter - ANNOT_WIDTH  : referenceRingInner;

    const genomeRingStart = annotActive ? annotRingInner : referenceRingInner;
    const annotReserved   = annotActive ? ANNOT_WIDTH + ANNOT_GAP : 0;

    let geneRingWidth = (outerRadius - referenceRingWidth - annotReserved - 20) / numGenomes;
    geneRingWidth = Math.min(geneRingWidth, 20);

    function genomeRingBounds(i) {
      const outer = genomeRingStart - i * geneRingWidth - 2;
      const inner = outer - geneRingWidth + 2;
      return { outer, inner };
    }

    lastGeometry = {
      cx,
      cy,
      referenceRingOuter,
      referenceRingInner,
      annotRingOuter,
      annotRingInner,
      geneRingWidth,
      genomeRingBounds,
    };

    // ── D3 arc generator ───────────────────────────────────────────────────
    const arcGen = d3.arc();

    function makeArcPath(innerRadius, outerRadius, startAngle, endAngle) {
      return arcGen({ innerRadius, outerRadius, startAngle, endAngle });
    }

    // ── Draw reference contig ring ─────────────────────────────────────────

    ctx.save();
    ctx.translate(cx, cy);

    const gapRadians = (1.5 * Math.PI) / 180; // 1.5° gap between contigs

    ctx.fillStyle = '#6366f1'; // indigo
    for (const contig of renderData.contigs) {
      const startAngle = (contig.cumStart / renderData.totalLength) * 2 * Math.PI;
      let endAngle = ((contig.cumStart + contig.length) / renderData.totalLength) * 2 * Math.PI;
      endAngle -= gapRadians;
      if (endAngle <= startAngle) continue;

      const pathStr = makeArcPath(referenceRingInner, referenceRingOuter, startAngle, endAngle);
      if (pathStr) {
        ctx.fill(new Path2D(pathStr));
      }
    }

    // ── Draw gene annotation ring ─────────────────────────────────────────
    if (annotActive) {
      drawAnnotationRing(ctx, renderData, annotRingInner, annotRingOuter, makeArcPath);
    }

    // ── Draw genome rings ─────────────────────────────────────────────────

    for (let i = 0; i < renderData.visibleGenomes.length; i++) {
      const genome = renderData.visibleGenomes[i];
      const color  = renderData.genomeColors.get(genome) || renderData.colorScale(genome);
      const { outer: ringOuter, inner: ringInner } = genomeRingBounds(i);

      const genomeGeneMap = renderData.genomeGenes.get(genome);
      if (!genomeGeneMap) continue;

      ctx.fillStyle = color;
      const batchPath = new Path2D();

      for (const [geneId, geneInfo] of renderData.referenceGenes) {
        if (!genomeGeneMap.has(geneId)) continue;

        const { startAngle, endAngle } = geneInfo;
        if (endAngle <= startAngle) continue; // reverse-strand gene — never drawn

        const pathStr = makeArcPath(ringInner, ringOuter, startAngle, endAngle);
        if (pathStr) {
          batchPath.addPath(new Path2D(pathStr));
        }
      }

      ctx.fill(batchPath);
    }

    ctx.restore();

    // ── Draw contig labels (SVG overlay) ──────────────────────────────────

    const svgNS = 'http://www.w3.org/2000/svg';
    const labelRadius = referenceRingOuter + 12;

    for (const contig of renderData.contigs) {
      if (contig.length < 50000) continue; // skip contigs shorter than 50 kbp — label would be too cramped

      const midFraction = (contig.cumStart + contig.length / 2) / renderData.totalLength;
      const midAngle    = midFraction * 2 * Math.PI;

      const lx = cx + labelRadius * Math.sin(midAngle);
      const ly = cy - labelRadius * Math.cos(midAngle);

      let rotateDeg = (midAngle * 180) / Math.PI;
      if (midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2) rotateDeg += 180;

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', lx);
      text.setAttribute('y', ly);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', `rotate(${rotateDeg},${lx},${ly})`);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.setAttribute('fill', '#94a3b8');
      text.textContent = contig.id;
      svg.appendChild(text);
    }
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  function resizeCanvas() {
    const container = document.getElementById('viz-container');
    if (!container || !canvas || !svg) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    canvas.width  = w;
    canvas.height = h;

    svg.setAttribute('width',  w);
    svg.setAttribute('height', h);

    if (lastRenderData) {
      drawVisualization(lastRenderData);
    }
  }

  // ─── Hit Detection ─────────────────────────────────────────────────────────

  function handleMouseMove(event) {
    if (!lastRenderData || !lastGeometry) {
      hideTooltip();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const { cx, cy, referenceRingOuter, referenceRingInner, geneRingWidth, genomeRingBounds,
            annotRingOuter, annotRingInner } = lastGeometry;

    // Mouse position relative to canvas centre.
    const mx = event.clientX - rect.left - cx;
    const my = event.clientY - rect.top  - cy;
    const r  = Math.sqrt(mx * mx + my * my);

    // Convert to our angle convention: 0 = top (12 o'clock), clockwise.
    const rawAngle = Math.atan2(my, mx);
    let theta = rawAngle + Math.PI / 2;
    if (theta < 0)             theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI)  theta -= 2 * Math.PI;

    // ── Determine ring ────────────────────────────────────────────────────

    let hitGenome      = null;
    let hitIsReference = false;
    let hitIsAnnotation = false;

    if (r >= referenceRingInner && r <= referenceRingOuter) {
      hitIsReference = true;
    } else if (lastRenderData.annotActive &&
               r >= annotRingInner && r <= annotRingOuter) {
      hitIsAnnotation = true;
    } else if (r < referenceRingInner) {
      for (let i = 0; i < lastRenderData.visibleGenomes.length; i++) {
        const { outer, inner } = genomeRingBounds(i);
        if (r >= inner && r <= outer) {
          hitGenome = lastRenderData.visibleGenomes[i];
          break;
        }
      }
    }

    if (!hitIsReference && !hitGenome && !hitIsAnnotation) {
      hideTooltip();
      return;
    }

    // ── Determine gene arc ────────────────────────────────────────────────
    // Linear scan; angles are in [0, 2π) for forward-strand genes.

    let hitGeneId   = null;
    let hitGeneInfo = null;

    for (const [geneId, geneInfo] of lastRenderData.referenceGenes) {
      const { startAngle, endAngle } = geneInfo;
      if (endAngle <= startAngle) continue; // reverse-strand gene — never drawn

      let sa = startAngle;
      let ea = endAngle;
      if (sa < 0) sa += 2 * Math.PI;
      if (ea < 0) ea += 2 * Math.PI;

      if (sa <= ea) {
        if (theta >= sa && theta <= ea) { hitGeneId = geneId; hitGeneInfo = geneInfo; break; }
      } else {
        // Wrap-around arc.
        if (theta >= sa || theta <= ea) { hitGeneId = geneId; hitGeneInfo = geneInfo; break; }
      }
    }

    if (!hitGeneId || !hitGeneInfo) {
      hideTooltip();
      return;
    }

    // ── Build tooltip content ─────────────────────────────────────────────

    let pident   = null;
    let coverage = null;
    let genomeName = 'Reference';

    if (hitIsReference || hitIsAnnotation) {
      pident   = hitGeneInfo.pident;
      coverage = hitGeneInfo.coverage;
    } else if (hitGenome) {
      genomeName = hitGenome;
      const geneData = lastRenderData.genomeGenes.get(hitGenome)?.get(hitGeneId);
      if (geneData) {
        pident   = geneData.pident;
        coverage = geneData.coverage;
      }
    }

    const position    = `${hitGeneInfo.contigId}:${hitGeneInfo.qstart}–${hitGeneInfo.qend}`;
    const pidentStr   = pident   != null ? `${pident.toFixed(1)}%`   : 'N/A';
    const coverageStr = coverage != null ? `${coverage.toFixed(1)}%` : 'N/A';

    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    tooltip.innerHTML =
      `<div class="tooltip-row"><span class="tooltip-label">Gene:</span><span class="tooltip-value">${escapeHtml(hitGeneId)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Genome:</span><span class="tooltip-value">${escapeHtml(genomeName)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Position:</span><span class="tooltip-value">${escapeHtml(position)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Identity:</span><span class="tooltip-value">${escapeHtml(pidentStr)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Coverage:</span><span class="tooltip-value">${escapeHtml(coverageStr)}</span></div>`;

    // Append annotation column value whenever an active column is set.
    if (lastRenderData.annotActive && lastRenderData.annotColumnName) {
      const annotVal = lastRenderData.geneAnnotValues.get(hitGeneId);
      if (annotVal != null) {
        tooltip.innerHTML +=
          `<div class="tooltip-row"><span class="tooltip-label">${escapeHtml(lastRenderData.annotColumnName)}:</span>` +
          `<span class="tooltip-value">${escapeHtml(String(annotVal))}</span></div>`;
      }
    }

    tooltip.style.left = (event.clientX + 12) + 'px';
    tooltip.style.top  = (event.clientY + 12) + 'px';
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.setAttribute('aria-hidden', 'true');
  }

  // ─── Private drawing helpers ───────────────────────────────────────────────

  function drawAnnotationRing(ctx, renderData, innerR, outerR, makeArcPath) {
    for (const [geneId, geneInfo] of renderData.referenceGenes) {
      const { startAngle, endAngle } = geneInfo;
      if (endAngle <= startAngle) continue;

      const color = renderData.geneAnnotColors.get(geneId);
      if (!color) continue;

      if (renderData.annotIsContinuous) {
        const frac = renderData.geneAnnotBarFractions.get(geneId);
        if (!frac) continue;
        const barHeight = frac * (outerR - innerR);
        const pathStr = makeArcPath(outerR - barHeight, outerR, startAngle, endAngle);
        if (pathStr) {
          ctx.fillStyle = color;
          ctx.fill(new Path2D(pathStr));
        }
      } else {
        const pathStr = makeArcPath(innerR, outerR, startAngle, endAngle);
        if (pathStr) {
          ctx.fillStyle = color;
          ctx.fill(new Path2D(pathStr));
        }
      }
    }
  }



  // ─── Utilities ─────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  window.initViz          = initViz;
  window.drawVisualization = drawVisualization;
  window.resizeCanvas     = resizeCanvas;

  window.getLastGeometry = function () {
    return lastGeometry;
  };

  window.getLastRenderData = function () {
    return lastRenderData;
  };
})();
