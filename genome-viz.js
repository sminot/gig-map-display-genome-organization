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

    const scale             = window.ZoomState ? window.ZoomState.displayRadiusScale : 1;
    const outerRadius       = Math.min(cx, cy) * 0.92 * scale;
    const referenceRingWidth = 18;
    const numGenomes        = Math.max(1, renderData.visibleGenomes.length);

    const referenceRingOuter = outerRadius;
    const referenceRingInner = outerRadius - referenceRingWidth;

    // Annotation track sits just outside the reference ring when active.
    const ANNOT_WIDTH    = 20;
    const ANNOT_GAP      = 4;
    const annotActive    = renderData.annotActive;
    const annotRingInner = annotActive ? referenceRingOuter + ANNOT_GAP : referenceRingOuter;
    const annotRingOuter = annotActive ? annotRingInner + ANNOT_WIDTH   : referenceRingOuter;
    // Genome rings are unaffected by annotation track (annotation is outermost).

    // Genome rings fill inward from the reference ring, unaffected by annotation track.
    const genomeRingStart = referenceRingInner;
    let geneRingWidth = (outerRadius - referenceRingWidth - 20) / numGenomes;
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

    // ── Draw gene annotation track (outside reference ring) ───────────────
    if (annotActive) {
      drawAnnotationRing(ctx, renderData, annotRingInner, annotRingOuter, makeArcPath);
    }

    ctx.restore();

    // ── Draw contig labels (SVG overlay) ──────────────────────────────────

    const svgNS = 'http://www.w3.org/2000/svg';
    const labelRadius = (annotActive ? annotRingOuter : referenceRingOuter) + 12;

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

    // ── Determine ring (wedge or main circle) ─────────────────────────────

    // Distance from r to band [lo, hi] — 0 when inside the band.
    function bandDist(radius, lo, hi) {
      return radius < lo ? lo - radius : (radius > hi ? radius - hi : 0);
    }

    // Snap radius: cursor snaps to the nearest ring within this many pixels.
    const SNAP_PX = 12;

    let hitGenome       = null;
    let hitIsReference  = false;
    let hitIsAnnotation = false;
    let searchAngle     = theta; // angle used for gene hit-test

    const zs         = window.ZoomState;
    const WEDGE_GAP  = zs ? zs.wedgeGap : 6;
    const blowInner  = referenceRingOuter + WEDGE_GAP;

    if (zs && zs.zoomLevel > 1.05 && r >= blowInner - SNAP_PX) {
      // ── Wedge region ────────────────────────────────────────────────────
      const R_hit     = Math.min(canvas.width, canvas.height) / 2;
      const blowOuter = R_hit * 0.97;
      const available = Math.max(0, blowOuter - blowInner);
      const ANN_W     = lastRenderData.annotActive ? Math.min(12, available * 0.25) : 0;
      const numG      = lastRenderData.visibleGenomes.length;
      const GEN_W     = numG > 0 ? (available - ANN_W) / numG : 0;

      if (r > blowOuter + SNAP_PX) { hideTooltip(); return; }

      // Check angular bounds.
      const wedgeHalfSpan = zs.wedgeSpan * Math.PI;
      let localAngle = theta - zs.focusAngle;
      if (localAngle > Math.PI)  localAngle -= 2 * Math.PI;
      if (localAngle < -Math.PI) localAngle += 2 * Math.PI;

      if (Math.abs(localAngle) > wedgeHalfSpan + 0.05) { hideTooltip(); return; }

      // Inverse zoom transform → genome angle.
      let genomeAngle = zs.focusAngle + localAngle / zs.zoomLevel;
      genomeAngle = ((genomeAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      searchAngle = genomeAngle;

      // Snap to the nearest wedge ring band within SNAP_PX.
      // Annotation is always outermost (after genome rings).
      const annStart = blowInner + numG * GEN_W;

      let bestDist = SNAP_PX;
      for (let i = 0; i < lastRenderData.visibleGenomes.length; i++) {
        const gInner = blowInner + i * GEN_W;
        const gOuter = gInner + GEN_W - 1;
        const d = bandDist(r, gInner, gOuter);
        if (d < bestDist) {
          bestDist = d;
          hitGenome = lastRenderData.visibleGenomes[i];
          hitIsAnnotation = false;
        }
      }
      if (lastRenderData.annotActive && ANN_W > 0) {
        const d = bandDist(r, annStart, annStart + ANN_W);
        if (d < bestDist) {
          hitIsAnnotation = true;
          hitGenome = null;
        }
      }

      if (!hitGenome && !hitIsAnnotation) { hideTooltip(); return; }

    } else {
      // ── Main circle rings — snap to nearest band within SNAP_PX ──────────
      let bestDist = SNAP_PX;

      const dRef = bandDist(r, referenceRingInner, referenceRingOuter);
      if (dRef < bestDist) {
        bestDist = dRef;
        hitIsReference = true;
      }

      if (lastRenderData.annotActive) {
        const dAnn = bandDist(r, annotRingInner, annotRingOuter);
        if (dAnn < bestDist) {
          bestDist = dAnn;
          hitIsReference = false;
          hitIsAnnotation = true;
        }
      }

      for (let i = 0; i < lastRenderData.visibleGenomes.length; i++) {
        const { outer, inner } = genomeRingBounds(i);
        const dG = bandDist(r, inner, outer);
        if (dG < bestDist) {
          bestDist = dG;
          hitIsReference = false;
          hitIsAnnotation = false;
          hitGenome = lastRenderData.visibleGenomes[i];
        }
      }

      if (!hitIsReference && !hitGenome && !hitIsAnnotation) {
        hideTooltip();
        return;
      }
    }

    // ── Snap to nearest gene arc by angle (~3° tolerance) ─────────────────

    const ANGLE_SNAP = 0.05; // radians ≈ 3°

    let hitGeneId   = null;
    let hitGeneInfo = null;
    let bestAngleDist = ANGLE_SNAP;

    for (const [geneId, geneInfo] of lastRenderData.referenceGenes) {
      const { startAngle, endAngle } = geneInfo;
      if (endAngle <= startAngle) continue;

      let sa = startAngle < 0 ? startAngle + 2 * Math.PI : startAngle;
      let ea = endAngle   < 0 ? endAngle   + 2 * Math.PI : endAngle;

      let d;
      if (sa <= ea) {
        if (searchAngle >= sa && searchAngle <= ea) {
          d = 0;
        } else {
          const dSa = Math.min(Math.abs(searchAngle - sa), 2 * Math.PI - Math.abs(searchAngle - sa));
          const dEa = Math.min(Math.abs(searchAngle - ea), 2 * Math.PI - Math.abs(searchAngle - ea));
          d = Math.min(dSa, dEa);
        }
      } else {
        if (searchAngle >= sa || searchAngle <= ea) {
          d = 0;
        } else {
          const dSa = Math.min(Math.abs(searchAngle - sa), 2 * Math.PI - Math.abs(searchAngle - sa));
          const dEa = Math.min(Math.abs(searchAngle - ea), 2 * Math.PI - Math.abs(searchAngle - ea));
          d = Math.min(dSa, dEa);
        }
      }

      if (d < bestAngleDist) {
        bestAngleDist = d;
        hitGeneId   = geneId;
        hitGeneInfo = geneInfo;
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

    // Gene name row (from label column if set)
    let geneNameRow = '';
    const GAS = window.GeneAnnotationState;
    if (GAS && GAS.labelColumn && GAS.rawData) {
      const geneAnnotRow = GAS.rawData.get(hitGeneId);
      if (geneAnnotRow) {
        const nameVal = geneAnnotRow[GAS.labelColumn];
        if (nameVal !== null && nameVal !== undefined && nameVal !== '') {
          geneNameRow = `<div class="tooltip-row"><span class="tooltip-label">Name:</span><span class="tooltip-value">${escapeHtml(String(nameVal))}</span></div>`;
        }
      }
    }

    // Genome name row (from genome annotation label column if set)
    let genomeNameRow = '';
    let genomeExtraRows = '';
    const GeAS = window.GenomeAnnotationState;
    if (hitGenome && GeAS && GeAS.rawData) {
      const genomeAnnotRow = GeAS.rawData.get(String(hitGenome));
      if (genomeAnnotRow) {
        if (GeAS.labelColumn) {
          const nameVal = genomeAnnotRow[GeAS.labelColumn];
          if (nameVal !== null && nameVal !== undefined && nameVal !== '') {
            genomeNameRow = `<div class="tooltip-row"><span class="tooltip-label">Name:</span><span class="tooltip-value">${escapeHtml(String(nameVal))}</span></div>`;
          }
        }
        if (GeAS.tooltipColumns && GeAS.tooltipColumns.length > 0) {
          for (const col of GeAS.tooltipColumns) {
            const val = genomeAnnotRow[col];
            if (val !== null && val !== undefined && val !== '') {
              genomeExtraRows += `<div class="tooltip-row"><span class="tooltip-label">${escapeHtml(col)}:</span><span class="tooltip-value">${escapeHtml(String(val))}</span></div>`;
            }
          }
        }
      }
    }

    tooltip.innerHTML =
      geneNameRow +
      `<div class="tooltip-row"><span class="tooltip-label">Gene:</span><span class="tooltip-value">${escapeHtml(hitGeneId)}</span></div>` +
      genomeNameRow +
      `<div class="tooltip-row"><span class="tooltip-label">Genome:</span><span class="tooltip-value">${escapeHtml(genomeName)}</span></div>` +
      genomeExtraRows +
      `<div class="tooltip-row"><span class="tooltip-label">Position:</span><span class="tooltip-value">${escapeHtml(position)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Identity:</span><span class="tooltip-value">${escapeHtml(pidentStr)}</span></div>` +
      `<div class="tooltip-row"><span class="tooltip-label">Coverage:</span><span class="tooltip-value">${escapeHtml(coverageStr)}</span></div>`;

    // Show category if gene annotation is active
    if (lastRenderData.annotActive && GAS && GAS.categoryColumn) {
      const row = GAS.rawData ? GAS.rawData.get(hitGeneId) : null;
      if (row) {
        const catVal = row[GAS.categoryColumn];
        if (catVal !== null && catVal !== undefined && catVal !== '') {
          const isHighlighted = lastRenderData.geneAnnotColors && lastRenderData.geneAnnotColors.has(hitGeneId);
          tooltip.innerHTML +=
            `<div class="tooltip-row"><span class="tooltip-label">${escapeHtml(GAS.categoryColumn)}:</span>` +
            `<span class="tooltip-value" style="${isHighlighted ? 'color:' + lastRenderData.geneAnnotColors.get(hitGeneId) : ''}">${escapeHtml(String(catVal))}</span></div>`;
        }
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
    // Dim background for the full track width.
    const bgPath = makeArcPath(innerR, outerR, 0, 2 * Math.PI);
    if (bgPath) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(new Path2D(bgPath)); }

    const isArrows = renderData.annotDisplayMode === 'arrows';

    for (const [geneId, geneInfo] of renderData.referenceGenes) {
      const { startAngle, endAngle } = geneInfo;
      if (endAngle <= startAngle) continue;
      const color = renderData.geneAnnotColors.get(geneId);
      if (!color) continue;

      if (isArrows) {
        // Draw inward-pointing triangle centered on gene midpoint
        const midAngle = (startAngle + endAngle) / 2;
        const theta = midAngle - Math.PI / 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const midR = (innerR + outerR) / 2;
        const geneSpanPx = midR * Math.abs(endAngle - startAngle);
        const halfW = Math.max(3, Math.min(geneSpanPx / 2, (outerR - innerR) * 0.5));
        const tipX   = cos * (innerR + 1);
        const tipY   = sin * (innerR + 1);
        const baseX  = cos * outerR;
        const baseY  = sin * outerR;
        const perpX  = -sin * halfW;
        const perpY  =  cos * halfW;
        ctx.beginPath();
        ctx.moveTo(baseX + perpX, baseY + perpY);
        ctx.lineTo(baseX - perpX, baseY - perpY);
        ctx.lineTo(tipX, tipY);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        const pathStr = makeArcPath(innerR, outerR, startAngle, endAngle);
        if (pathStr) { ctx.fillStyle = color; ctx.fill(new Path2D(pathStr)); }
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
