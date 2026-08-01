import { schemePaired as mn, schemeDark2 as Qe, schemeAccent as fn, schemeSet3 as pn, schemeSet2 as hn, schemeSet1 as bn, schemePastel1 as Je, schemeTableau10 as fe, arc as An, color as wn, scaleOrdinal as Me } from "d3";
import en from "papaparse";
const ee = 2 * Math.PI, K = {
  zoomLevel: [1, 50],
  wedgeSpan: [0.1, 0.5],
  wedgeGap: [0, 80],
  wedgeHeightScale: [2, 10],
  radiusScale: [0.3, 1]
};
function re(e, [n, l]) {
  return Math.max(n, Math.min(l, e));
}
function vn() {
  return {
    focusAngle: 0,
    zoomLevel: 1,
    displayRadiusScale: 1,
    focusAngleTarget: 0,
    zoomLevelTarget: 1,
    radiusScaleTarget: 1,
    wedgeSpan: 1 / 3,
    wedgeGap: 6,
    wedgeHeightScale: 2,
    // Transient: gates wheel handling while the pointer is over the circle.
    isHovering: !1,
    tick(e) {
      const n = 1 - Math.exp(-e / 120), l = 1 - Math.exp(-e / 200), o = 1 - Math.exp(-e / 150);
      this.zoomLevel += (this.zoomLevelTarget - this.zoomLevel) * n, this.displayRadiusScale += (this.radiusScaleTarget - this.displayRadiusScale) * o;
      let a = this.focusAngleTarget - this.focusAngle;
      a > Math.PI && (a -= ee), a < -Math.PI && (a += ee), this.focusAngle = (this.focusAngle + a * l + ee) % ee;
    },
    setFocusAngle(e) {
      this.focusAngleTarget = (e % ee + ee) % ee;
    },
    setZoomLevel(e) {
      this.zoomLevelTarget = re(e, K.zoomLevel);
    },
    setTargetRadiusScale(e) {
      this.radiusScaleTarget = re(e, K.radiusScale);
    },
    setWedgeSpan(e) {
      this.wedgeSpan = re(e, K.wedgeSpan);
    },
    setWedgeGap(e) {
      this.wedgeGap = re(e, K.wedgeGap);
    },
    setWedgeHeightScale(e) {
      this.wedgeHeightScale = re(e, K.wedgeHeightScale);
    },
    setHovering(e) {
      this.isHovering = e;
    },
    resetZoom() {
      this.zoomLevelTarget = 1, this.radiusScaleTarget = 1;
    },
    snapToTargets() {
      this.zoomLevel = this.zoomLevelTarget, this.focusAngle = this.focusAngleTarget, this.displayRadiusScale = this.radiusScaleTarget;
    }
  };
}
function Re() {
  return {
    rawData: /* @__PURE__ */ new Map(),
    // geneId -> row object
    columns: [],
    // annotation column names (column 2 onward)
    categoryColumn: null,
    labelColumn: null,
    // shown as the gene name in the tooltip
    selectedCategories: /* @__PURE__ */ new Set(),
    categoryValues: [],
    // all values, count desc then value asc
    categoryCounts: /* @__PURE__ */ new Map(),
    scale: null,
    // derived: value -> colour
    customColors: /* @__PURE__ */ new Map(),
    // category -> hex override
    displayMode: "bars",
    // 'bars' | 'arrows'
    sourceUrl: null
  };
}
function Ee() {
  return {
    rawData: /* @__PURE__ */ new Map(),
    // genomeId -> row object
    columns: [],
    colorColumn: null,
    groupColumn: null,
    // groups and sorts rings; overrides colorColumn for colour
    groupScale: null,
    // derived
    groupDomain: [],
    labelColumn: null,
    tooltipColumns: [],
    sortColumn: null,
    sortAscending: !0,
    palette: "Tableau10",
    scale: null,
    // derived
    domain: [],
    sourceUrl: null
  };
}
function Cn() {
  return {
    rows: [],
    // one object per alignment row
    allGenomes: [],
    referenceGenome: null,
    visibleGenomes: /* @__PURE__ */ new Set(),
    customGenomeOrder: null,
    // string[] | null — greedy gene-similarity ordering
    sourceUrl: null,
    theme: "dark",
    // 'dark' | 'light'
    geneAnnot: Re(),
    genomeAnnot: Ee(),
    zoom: vn()
  };
}
const nn = {
  Tableau10: fe,
  Pastel1: Je,
  Set1: bn,
  Set2: hn,
  Set3: pn,
  Accent: fn,
  Dark2: Qe,
  Paired: mn
}, pe = Object.keys(nn);
function tn(e) {
  return nn[e] || fe;
}
function yn(e) {
  return e === "light" ? Qe.concat(fe) : fe.concat(Je);
}
let Sn = 0;
const Gn = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>', xn = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>', Ln = '<svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>', $n = '<svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>', le = '<option value="">— none —</option>';
function In(e, n) {
  const l = pe.map((o) => `<option value="${o}">${o}</option>`).join("");
  return `
    <button class="gmd-expand sidebar-expand-btn" aria-label="Expand sidebar" type="button" hidden>${Gn}</button>

    <aside class="gmd-sidebar sidebar" aria-label="Controls">
      <header class="sidebar-header">
        <h1 class="app-title">${n}</h1>
        <button class="gmd-theme theme-toggle-btn" aria-label="Toggle light/dark theme" type="button">${Ln}${$n}</button>
        <button class="gmd-collapse sidebar-collapse-btn" aria-label="Collapse sidebar" type="button">${xn}</button>
      </header>

      <div class="gmd-loading loading-indicator" aria-live="polite" aria-busy="true" hidden>
        <span class="spinner" aria-hidden="true"></span>
        <span class="loading-text">Parsing…</span>
      </div>
      <div class="gmd-error error-message" role="alert" aria-live="assertive" hidden></div>

      <div class="gmd-controls controls-panel" hidden>

        <section class="control-section" aria-labelledby="${e("ref-heading")}">
          <h2 class="control-section-heading" id="${e("ref-heading")}">Reference Genome</h2>
          <div class="control-field">
            <div class="ref-combobox">
              <input type="text" class="gmd-ref-input select-control ref-combobox-input"
                     autocomplete="off" placeholder="Search genomes…" aria-label="Reference genome"
                     aria-autocomplete="list" aria-controls="${e("ref-list")}" aria-expanded="false">
              <ul class="gmd-ref-list ref-combobox-list" id="${e("ref-list")}" role="listbox" hidden></ul>
            </div>
          </div>
        </section>

        <section class="control-section" aria-labelledby="${e("genomes-heading")}">
          <h2 class="control-section-heading" id="${e("genomes-heading")}">Genomes</h2>
          <div class="category-search-row">
            <input type="text" class="gmd-genome-search url-load-input category-search-input"
                   placeholder="Filter genomes…" autocomplete="off" aria-label="Filter genomes">
            <button class="gmd-genome-all btn-url" type="button">All</button>
            <button class="gmd-genome-none btn-url" type="button">None</button>
          </div>
          <button class="gmd-genome-similarity btn-export btn-block" type="button">Sort by gene content</button>
          <div class="gmd-genome-toggles genome-toggles" role="group" aria-label="Toggle genomes"></div>
        </section>

        <section class="control-section" aria-labelledby="${e("annot-heading")}">
          <h2 class="control-section-heading" id="${e("annot-heading")}">Highlight Genes</h2>
          <div class="gmd-gene-annot-controls annotation-controls" hidden>
            <div class="control-row">
              <label for="${e("gene-category")}" class="control-label">Group by</label>
              <select class="gmd-gene-category select-control select-control-sm" id="${e("gene-category")}">${le}</select>
            </div>
            <div class="control-row">
              <label for="${e("gene-label")}" class="control-label">Name col.</label>
              <select class="gmd-gene-label select-control select-control-sm" id="${e("gene-label")}">${le}</select>
            </div>
            <div class="gmd-gene-stats annotation-stats" hidden></div>
            <div class="gmd-gene-category-section" hidden>
              <div class="category-search-row">
                <input type="text" class="gmd-gene-category-search url-load-input category-search-input"
                       placeholder="Filter categories…" aria-label="Filter categories">
                <button class="gmd-gene-select-all btn-url" type="button">All</button>
                <button class="gmd-gene-clear-all btn-url" type="button">None</button>
              </div>
              <div class="gmd-gene-category-list category-checklist"></div>
              <div class="gmd-gene-selection-stats annotation-stats"></div>
            </div>
            <button class="gmd-gene-clear btn-text-danger" type="button">Clear</button>
          </div>
          <div class="gmd-gene-legend legend-container"></div>
        </section>

        <section class="control-section" aria-labelledby="${e("genome-annot-heading")}">
          <h2 class="control-section-heading" id="${e("genome-annot-heading")}">Genome Annotation</h2>
          <div class="gmd-genome-annot-controls annotation-controls" hidden>
            <div class="control-row">
              <label for="${e("genome-color")}" class="control-label">Color by</label>
              <select class="gmd-genome-color select-control select-control-sm" id="${e("genome-color")}">${le}</select>
            </div>
            <div class="control-row">
              <label for="${e("genome-group")}" class="control-label">Group by</label>
              <select class="gmd-genome-group select-control select-control-sm" id="${e("genome-group")}">${le}</select>
            </div>
            <div class="control-row">
              <label for="${e("genome-label")}" class="control-label">Name col.</label>
              <select class="gmd-genome-label select-control select-control-sm" id="${e("genome-label")}">${le}</select>
            </div>
            <div class="control-row">
              <label for="${e("genome-palette")}" class="control-label">Palette</label>
              <select class="gmd-genome-palette select-control select-control-sm" id="${e("genome-palette")}">${l}</select>
            </div>
            <div class="control-row control-row-top">
              <label for="${e("genome-tooltip")}" class="control-label control-label-top">Tooltip cols.</label>
              <select class="gmd-genome-tooltip select-control select-control-sm" id="${e("genome-tooltip")}" multiple size="4"></select>
            </div>
            <div class="control-row">
              <label for="${e("genome-sort")}" class="control-label">Sort by</label>
              <select class="gmd-genome-sort select-control select-control-sm" id="${e("genome-sort")}">${le}</select>
            </div>
            <div class="control-row">
              <label for="${e("genome-sort-order")}" class="control-label">Order</label>
              <select class="gmd-genome-sort-order select-control select-control-sm" id="${e("genome-sort-order")}">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            <div class="gmd-genome-stats annotation-stats" hidden></div>
            <button class="gmd-genome-clear btn-text-danger" type="button">Clear</button>
          </div>
          <div class="gmd-genome-legend legend-container"></div>
        </section>

        <section class="control-section" aria-labelledby="${e("zoom-heading")}">
          <h2 class="control-section-heading" id="${e("zoom-heading")}">Zoom</h2>
          <div class="control-row">
            <label for="${e("wedge-span")}" class="control-label">Wedge</label>
            <input type="range" class="gmd-wedge-span range-control" id="${e("wedge-span")}"
                   min="10" max="50" value="33" step="1"
                   aria-label="Zoom wedge size as percent of full circle">
            <span class="gmd-wedge-span-display range-display">33%</span>
          </div>
          <div class="control-row">
            <label for="${e("wedge-gap")}" class="control-label">Gap</label>
            <input type="range" class="gmd-wedge-gap range-control" id="${e("wedge-gap")}"
                   min="0" max="60" value="6" step="1"
                   aria-label="Gap between main circle and wedge in pixels">
            <span class="gmd-wedge-gap-display range-display">6px</span>
          </div>
          <div class="control-row">
            <label for="${e("wedge-height")}" class="control-label">Height</label>
            <input type="range" class="gmd-wedge-height range-control" id="${e("wedge-height")}"
                   min="2" max="10" value="2" step="0.1" aria-label="Wedge height scale factor">
            <span class="gmd-wedge-height-display range-display">2.0×</span>
          </div>
          <button class="gmd-reset-zoom btn-export btn-block" type="button">Reset Zoom</button>
          <p class="control-hint">Hover over the circle and scroll to zoom in. The wedge shows the zoomed region.</p>
        </section>

        <section class="control-section" aria-labelledby="${e("export-heading")}">
          <h2 class="control-section-heading" id="${e("export-heading")}">Export</h2>
          <div class="export-buttons">
            <button class="gmd-export-png btn-export" type="button">PNG</button>
            <button class="gmd-export-svg btn-export" type="button">SVG</button>
            <button class="gmd-embed btn-export" type="button">Embed</button>
          </div>
        </section>

      </div>
    </aside>`;
}
function Mn() {
  return `
    <main class="gmd-main main-area" aria-label="Visualization">
      <div class="gmd-viz viz-container">
        <canvas class="gmd-canvas" aria-label="Pangenome circular visualization"></canvas>
        <svg class="gmd-overlay" aria-hidden="true"></svg>
      </div>
      <div class="gmd-zoom-info zoom-info" hidden>
        <span class="gmd-zoom-info-text"></span>
        <button class="gmd-zoom-info-close zoom-info-close" title="Exit zoom" aria-label="Exit zoom">&#x2715;</button>
      </div>
      <div class="zoom-hint">Scroll to zoom &nbsp;·&nbsp; Click &amp; drag to move</div>
      <div class="gmd-tooltip tooltip" role="tooltip" aria-hidden="true"></div>
    </main>`;
}
const Rn = {
  expandBtn: ".gmd-expand",
  sidebar: ".gmd-sidebar",
  themeBtn: ".gmd-theme",
  collapseBtn: ".gmd-collapse",
  loading: ".gmd-loading",
  errorMessage: ".gmd-error",
  controlsPanel: ".gmd-controls",
  refInput: ".gmd-ref-input",
  refList: ".gmd-ref-list",
  genomeSearch: ".gmd-genome-search",
  genomeSelectAll: ".gmd-genome-all",
  genomeClearAll: ".gmd-genome-none",
  genomeSimilarityBtn: ".gmd-genome-similarity",
  genomeToggles: ".gmd-genome-toggles",
  geneAnnotControls: ".gmd-gene-annot-controls",
  geneCategorySelect: ".gmd-gene-category",
  geneLabelSelect: ".gmd-gene-label",
  geneStats: ".gmd-gene-stats",
  geneCategorySection: ".gmd-gene-category-section",
  geneCategorySearch: ".gmd-gene-category-search",
  geneSelectAll: ".gmd-gene-select-all",
  geneClearAll: ".gmd-gene-clear-all",
  geneCategoryList: ".gmd-gene-category-list",
  geneSelectionStats: ".gmd-gene-selection-stats",
  geneClearBtn: ".gmd-gene-clear",
  geneLegend: ".gmd-gene-legend",
  genomeAnnotControls: ".gmd-genome-annot-controls",
  genomeColorSelect: ".gmd-genome-color",
  genomeGroupSelect: ".gmd-genome-group",
  genomeLabelSelect: ".gmd-genome-label",
  genomePaletteSelect: ".gmd-genome-palette",
  genomeTooltipSelect: ".gmd-genome-tooltip",
  genomeSortSelect: ".gmd-genome-sort",
  genomeSortOrderSelect: ".gmd-genome-sort-order",
  genomeStats: ".gmd-genome-stats",
  genomeClearBtn: ".gmd-genome-clear",
  genomeLegend: ".gmd-genome-legend",
  wedgeSpanInput: ".gmd-wedge-span",
  wedgeSpanDisplay: ".gmd-wedge-span-display",
  wedgeGapInput: ".gmd-wedge-gap",
  wedgeGapDisplay: ".gmd-wedge-gap-display",
  wedgeHeightInput: ".gmd-wedge-height",
  wedgeHeightDisplay: ".gmd-wedge-height-display",
  resetZoomBtn: ".gmd-reset-zoom",
  exportPngBtn: ".gmd-export-png",
  exportSvgBtn: ".gmd-export-svg",
  embedBtn: ".gmd-embed",
  vizContainer: ".gmd-viz",
  canvas: ".gmd-canvas",
  overlay: ".gmd-overlay",
  zoomInfo: ".gmd-zoom-info",
  zoomInfoText: ".gmd-zoom-info-text",
  zoomInfoClose: ".gmd-zoom-info-close",
  tooltip: ".gmd-tooltip"
};
function En(e, { controls: n = !0, title: l = "Pangenome Viewer" } = {}) {
  const o = ++Sn, a = (r) => `gmd${o}-${r}`;
  e.classList.add("gmd-root"), n || e.classList.add("gmd-no-controls"), e.innerHTML = `<div class="gmd-layout app-layout">${n ? In(a, l) : ""}${Mn()}</div>`;
  const t = { root: e };
  for (const [r, i] of Object.entries(Rn))
    t[r] = e.querySelector(i);
  return { refs: t, uid: o };
}
const Te = 18, Tn = 20, zn = 4, On = 20;
function on(e, n, l, o) {
  const a = n / 2, t = l / 2, r = Math.min(a, t) * 0.92 * e.zoom.displayRadiusScale, i = r, u = r - Te, g = o.annotActive, c = g ? i + zn : i, f = g ? c + Tn : i, x = Math.max(1, o.visibleGenomes.length), $ = Math.min(
    (r - Te - 20) / x,
    On
  );
  return {
    cx: a,
    cy: t,
    outerRadius: r,
    referenceRingOuter: i,
    referenceRingInner: u,
    annotRingOuter: f,
    annotRingInner: c,
    geneRingWidth: $,
    genomeRingBounds(b) {
      const G = u - b * $ - 2;
      return { outer: G, inner: G - $ + 2 };
    }
  };
}
function he(e, n, l, o) {
  const a = n / 2, t = l / 2, r = Math.min(a, t), i = r * 0.92 * e.zoom.displayRadiusScale, u = i + e.zoom.wedgeGap, g = r * 0.97, c = o.visibleGenomes.length, f = Math.max(0, g - u), x = o.annotActive ? Math.min(12, f * 0.25) : 0, $ = c > 0 ? (f - x) / c : 0;
  return { cx: a, cy: t, R: r, outerRadius: i, blowInner: u, blowOuter: g, annotWidth: x, genomeWidth: $, numGenomes: c };
}
function kn(e, n, l) {
  const o = Math.min(n / 2, l / 2);
  if (e.zoom.zoomLevel <= 1.05) return 1;
  const a = Math.min(0.8, 0.15 * e.zoom.wedgeHeightScale);
  return o * 0.97 * (1 - a) / (o * 0.92);
}
const Z = 2 * Math.PI, Nn = 1.5 * Math.PI / 180, Pn = 5e4, ue = 12, Dn = 0.05, _n = "http://www.w3.org/2000/svg", ln = "#6366f1";
function be(e) {
  return e == null ? "" : String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function an(e) {
  return e === "light" ? "#475569" : "#94a3b8";
}
function rn(e) {
  return e === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)";
}
function sn(e, n) {
  const l = (e.annotActive ? n.annotRingOuter : n.referenceRingOuter) + 12;
  return e.contigs.filter((o) => o.length >= Pn).map((o) => {
    const a = (o.cumStart + o.length / 2) / e.totalLength * Z, t = n.cx + l * Math.sin(a), r = n.cy - l * Math.cos(a);
    let i = a * 180 / Math.PI;
    return a > Math.PI / 2 && a < 3 * Math.PI / 2 && (i += 180), { id: o.id, x: t, y: r, rotateDeg: i };
  });
}
function cn(e, n) {
  const l = e.cumStart / n * Z, o = (e.cumStart + e.length) / n * Z - Nn;
  return { startAngle: l, endAngle: o };
}
function gn(e, n, l) {
  const a = (e.startAngle + e.endAngle) / 2 - Math.PI / 2, t = Math.cos(a), r = Math.sin(a), u = (n + l) / 2 * Math.abs(e.endAngle - e.startAngle), g = Math.max(3, Math.min(u / 2, (l - n) * 0.5));
  return [
    [t * l - r * g, r * l + t * g],
    [t * l + r * g, r * l - t * g],
    [t * (n + 1), r * (n + 1)]
  ];
}
function Hn({ state: e, refs: n }) {
  const l = n.canvas, o = l.getContext("2d"), a = n.overlay, t = An();
  let r = null, i = null;
  const u = (v, w, R, z) => t({ innerRadius: v, outerRadius: w, startAngle: R, endAngle: z });
  function g(v) {
    if (v && (r = v), !r) return;
    const { width: w, height: R } = l;
    for (o.clearRect(0, 0, w, R); a.firstChild; ) a.removeChild(a.firstChild);
    if (!r.contigs || r.contigs.length === 0) {
      i = null;
      return;
    }
    i = on(e, w, R, r);
    const { cx: z, cy: k, referenceRingInner: A, referenceRingOuter: m, annotRingInner: h, annotRingOuter: L } = i;
    o.save(), o.translate(z, k), o.fillStyle = ln;
    for (const S of r.contigs) {
      const { startAngle: y, endAngle: E } = cn(S, r.totalLength);
      if (E <= y) continue;
      const B = u(A, m, y, E);
      B && o.fill(new Path2D(B));
    }
    for (let S = 0; S < r.visibleGenomes.length; S++) {
      const y = r.visibleGenomes[S], E = r.genomeGenes.get(y);
      if (!E) continue;
      const { outer: B, inner: _ } = i.genomeRingBounds(S);
      o.fillStyle = r.genomeColors.get(y) || r.colorScale(y);
      const j = new Path2D();
      for (const [s, d] of r.referenceGenes) {
        if (!E.has(s) || d.endAngle <= d.startAngle) continue;
        const C = u(_, B, d.startAngle, d.endAngle);
        C && j.addPath(new Path2D(C));
      }
      o.fill(j);
    }
    r.annotActive && c(h, L), o.restore();
    for (const S of sn(r, i)) {
      const y = document.createElementNS(_n, "text");
      y.setAttribute("x", S.x), y.setAttribute("y", S.y), y.setAttribute("text-anchor", "middle"), y.setAttribute("dominant-baseline", "middle"), y.setAttribute("transform", `rotate(${S.rotateDeg},${S.x},${S.y})`), y.setAttribute("font-size", "11"), y.setAttribute("font-family", "system-ui, sans-serif"), y.setAttribute("fill", an(e.theme)), y.textContent = S.id, a.appendChild(y);
    }
  }
  function c(v, w) {
    const R = u(v, w, 0, Z);
    R && (o.fillStyle = rn(e.theme), o.fill(new Path2D(R)));
    const z = r.annotDisplayMode === "arrows";
    for (const [k, A] of r.referenceGenes) {
      if (A.endAngle <= A.startAngle) continue;
      const m = r.geneAnnotColors.get(k);
      if (m)
        if (o.fillStyle = m, z) {
          const [h, L, S] = gn(A, v, w);
          o.beginPath(), o.moveTo(h[0], h[1]), o.lineTo(L[0], L[1]), o.lineTo(S[0], S[1]), o.closePath(), o.fill();
        } else {
          const h = u(v, w, A.startAngle, A.endAngle);
          h && o.fill(new Path2D(h));
        }
    }
  }
  function f() {
    const v = n.vizContainer.clientWidth, w = n.vizContainer.clientHeight;
    v === 0 || w === 0 || (l.width = v, l.height = w, a.setAttribute("width", v), a.setAttribute("height", w), g());
  }
  const x = (v, w, R) => v < w ? w - v : v > R ? v - R : 0;
  function $(v, w) {
    const R = e.zoom;
    if (R.zoomLevel > 1.05) {
      const m = he(e, l.width, l.height, r);
      if (v >= m.blowInner - ue) {
        if (v > m.blowOuter + ue) return null;
        const h = R.wedgeSpan * Math.PI;
        let L = w - R.focusAngle;
        if (L > Math.PI && (L -= Z), L < -Math.PI && (L += Z), Math.abs(L) > h + 0.05) return null;
        const y = ((R.focusAngle + L / R.zoomLevel) % Z + Z) % Z;
        let E = ue, B = null;
        for (let _ = 0; _ < r.visibleGenomes.length; _++) {
          const j = m.blowInner + _ * m.genomeWidth, s = x(v, j, j + m.genomeWidth - 1);
          s < E && (E = s, B = { genome: r.visibleGenomes[_] });
        }
        if (r.annotActive && m.annotWidth > 0) {
          const _ = m.blowInner + m.numGenomes * m.genomeWidth;
          x(v, _, _ + m.annotWidth) < E && (B = { isAnnotation: !0 });
        }
        return B ? { ...B, searchAngle: y } : null;
      }
    }
    let z = ue, k = null;
    const A = x(v, i.referenceRingInner, i.referenceRingOuter);
    if (A < z && (z = A, k = { isReference: !0 }), r.annotActive) {
      const m = x(v, i.annotRingInner, i.annotRingOuter);
      m < z && (z = m, k = { isAnnotation: !0 });
    }
    for (let m = 0; m < r.visibleGenomes.length; m++) {
      const { outer: h, inner: L } = i.genomeRingBounds(m), S = x(v, L, h);
      S < z && (z = S, k = { genome: r.visibleGenomes[m] });
    }
    return k ? { ...k, searchAngle: w } : null;
  }
  function b(v) {
    let w = Dn, R = null;
    for (const [z, k] of r.referenceGenes) {
      if (k.endAngle <= k.startAngle) continue;
      const A = k.startAngle < 0 ? k.startAngle + Z : k.startAngle, m = k.endAngle < 0 ? k.endAngle + Z : k.endAngle, h = A <= m ? v >= A && v <= m : v >= A || v <= m;
      let L = 0;
      if (!h) {
        const S = Math.min(Math.abs(v - A), Z - Math.abs(v - A)), y = Math.min(Math.abs(v - m), Z - Math.abs(v - m));
        L = Math.min(S, y);
      }
      L < w && (w = L, R = { geneId: z, gene: k });
    }
    return R;
  }
  function G(v, w, R = "") {
    return `<div class="tooltip-row"><span class="tooltip-label">${be(v)}:</span><span class="tooltip-value"${R}>${be(w)}</span></div>`;
  }
  function p(v, w, R) {
    const z = e.geneAnnot, k = e.genomeAnnot;
    let A = null, m = null, h = "Reference";
    if (v.genome) {
      h = v.genome;
      const y = r.genomeGenes.get(v.genome)?.get(w);
      y && (A = y.pident, m = y.coverage);
    } else
      A = R.pident, m = R.coverage;
    let L = "";
    if (z.labelColumn) {
      const y = z.rawData.get(w), E = y && y[z.labelColumn];
      E != null && E !== "" && (L += G("Name", E));
    }
    L += G("Gene", w);
    const S = v.genome ? k.rawData.get(String(v.genome)) : null;
    if (S && k.labelColumn) {
      const y = S[k.labelColumn];
      y != null && y !== "" && (L += G("Name", y));
    }
    if (L += G("Genome", h), S)
      for (const y of k.tooltipColumns) {
        const E = S[y];
        E != null && E !== "" && (L += G(y, E));
      }
    if (L += G("Position", `${R.contigId}:${R.qstart}–${R.qend}`), L += G("Identity", A != null ? `${A.toFixed(1)}%` : "N/A"), L += G("Coverage", m != null ? `${m.toFixed(1)}%` : "N/A"), r.annotActive && z.categoryColumn) {
      const y = z.rawData.get(w), E = y && y[z.categoryColumn];
      if (E != null && E !== "") {
        const B = r.geneAnnotColors.get(w);
        L += G(z.categoryColumn, E, B ? ` style="color:${B}"` : "");
      }
    }
    return L;
  }
  function M(v) {
    const w = n.tooltip, R = 12, z = w.offsetWidth, k = w.offsetHeight, A = window.innerWidth, m = window.innerHeight;
    let h = v.clientX + R, L = v.clientY + R;
    h + z > A && (h = v.clientX - R - z), L + k > m && (L = v.clientY - R - k), w.style.left = `${Math.max(0, Math.min(h, A - z))}px`, w.style.top = `${Math.max(0, Math.min(L, m - k))}px`, w.setAttribute("aria-hidden", "false");
  }
  function T() {
    n.tooltip.setAttribute("aria-hidden", "true");
  }
  function P(v) {
    if (!r || !i) {
      T();
      return;
    }
    const w = l.getBoundingClientRect(), R = v.clientX - w.left - i.cx, z = v.clientY - w.top - i.cy, k = Math.sqrt(R * R + z * z);
    let A = Math.atan2(z, R) + Math.PI / 2;
    A < 0 && (A += Z), A >= Z && (A -= Z);
    const m = $(k, A);
    if (!m) {
      T();
      return;
    }
    const h = b(m.searchAngle);
    if (!h) {
      T();
      return;
    }
    n.tooltip.innerHTML = p(m, h.geneId, h.gene), M(v);
  }
  l.addEventListener("mousemove", P), l.addEventListener("mouseleave", T);
  const D = new ResizeObserver(() => f());
  return D.observe(n.vizContainer), f(), {
    draw: g,
    resize: f,
    getGeometry: () => i,
    getRenderData: () => r,
    destroy() {
      D.disconnect(), l.removeEventListener("mousemove", P), l.removeEventListener("mouseleave", T), o.clearRect(0, 0, l.width, l.height), r = null, i = null;
    }
  };
}
const se = 8, un = 16, ze = un * 6, Bn = `#version 300 es
precision highp float;

in float aGeoStart;
in float aGeoEnd;
in float aRingInner;
in float aRingOuter;
in vec4  aColor;

uniform float uFocusAngle;
uniform float uDataHalfSpan;
uniform float uZoomLevel;
uniform float uWedgeHalfSpan;
uniform vec2  uCenter;
uniform vec2  uResolution;

const float PI     = 3.14159265358979;
const float TWO_PI = 6.28318530717959;
const int   NUM_SEGS = ${un};

out vec4 vColor;

void main() {
  int quadId = gl_VertexID / 6;
  int corner = gl_VertexID % 6;
  int col = ((corner == 1 || corner == 3 || corner == 4) ? 1 : 0);
  int row = ((corner == 2 || corner == 4 || corner == 5) ? 1 : 0);

  float t = float(quadId + col) / float(NUM_SEGS);
  float geoAngle = mix(aGeoStart, aGeoEnd, t);

  float localAngle = geoAngle - uFocusAngle;
  localAngle = mod(localAngle + PI, TWO_PI) - PI;

  if (abs(localAngle) > uDataHalfSpan + 0.001) {
    gl_Position = vec4(0.0);
    vColor = vec4(0.0);
    return;
  }

  float screenLocalAngle = clamp(localAngle * uZoomLevel, -uWedgeHalfSpan, uWedgeHalfSpan);
  float screenAngle = uFocusAngle + screenLocalAngle;

  float blowR = (row == 0) ? aRingInner : aRingOuter;
  float x = uCenter.x + blowR * sin(screenAngle);
  float y = uCenter.y - blowR * cos(screenAngle);

  gl_Position = vec4(
    x / uResolution.x * 2.0 - 1.0,
    1.0 - y / uResolution.y * 2.0,
    0.0, 1.0
  );
  vColor = aColor;
}
`, Fn = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`, Un = [1, 0.85, 0.1, 0.9];
let Se = 0;
function Mt() {
  return Se;
}
function Oe(e) {
  const n = wn(e);
  if (!n) return [0.5, 0.5, 0.5, 1];
  const l = n.rgb();
  return [l.r / 255, l.g / 255, l.b / 255, n.opacity];
}
function Wn({ state: e, refs: n, onAnimate: l }) {
  const o = n.vizContainer, a = document.createElement("canvas");
  a.className = "gmd-webgl", a.width = o.clientWidth, a.height = o.clientHeight, o.appendChild(a);
  const t = a.getContext("webgl2", {
    alpha: !0,
    premultipliedAlpha: !1,
    preserveDrawingBuffer: !0
  });
  if (!t)
    return a.remove(), {
      available: !1,
      setRenderData() {
      },
      markDirty() {
      },
      destroy() {
      }
    };
  Se += 1, t.enable(t.BLEND), t.blendFunc(t.SRC_ALPHA, t.ONE_MINUS_SRC_ALPHA);
  function r(h, L) {
    const S = t.createShader(h);
    if (t.shaderSource(S, L), t.compileShader(S), !t.getShaderParameter(S, t.COMPILE_STATUS)) {
      const y = t.getShaderInfoLog(S);
      throw t.deleteShader(S), new Error(`WebGL shader compile failed: ${y}`);
    }
    return S;
  }
  const i = r(t.VERTEX_SHADER, Bn), u = r(t.FRAGMENT_SHADER, Fn), g = t.createProgram();
  if (t.attachShader(g, i), t.attachShader(g, u), t.linkProgram(g), !t.getProgramParameter(g, t.LINK_STATUS)) {
    const h = t.getProgramInfoLog(g);
    throw new Error(`WebGL program link failed: ${h}`);
  }
  t.detachShader(g, i), t.detachShader(g, u), t.deleteShader(i), t.deleteShader(u);
  const c = {
    aGeoStart: t.getAttribLocation(g, "aGeoStart"),
    aGeoEnd: t.getAttribLocation(g, "aGeoEnd"),
    aRingInner: t.getAttribLocation(g, "aRingInner"),
    aRingOuter: t.getAttribLocation(g, "aRingOuter"),
    aColor: t.getAttribLocation(g, "aColor"),
    uFocusAngle: t.getUniformLocation(g, "uFocusAngle"),
    uDataHalfSpan: t.getUniformLocation(g, "uDataHalfSpan"),
    uZoomLevel: t.getUniformLocation(g, "uZoomLevel"),
    uWedgeHalfSpan: t.getUniformLocation(g, "uWedgeHalfSpan"),
    uCenter: t.getUniformLocation(g, "uCenter"),
    uResolution: t.getUniformLocation(g, "uResolution")
  };
  function f(h) {
    const L = t.createVertexArray();
    t.bindVertexArray(L), t.bindBuffer(t.ARRAY_BUFFER, h);
    const S = se * 4, y = [
      [c.aGeoStart, 1, 0],
      [c.aGeoEnd, 1, 4],
      [c.aRingInner, 1, 8],
      [c.aRingOuter, 1, 12],
      [c.aColor, 4, 16]
    ];
    for (const [E, B, _] of y)
      t.enableVertexAttribArray(E), t.vertexAttribPointer(E, B, t.FLOAT, !1, S, _), t.vertexAttribDivisor(E, 1);
    return t.bindVertexArray(null), L;
  }
  const x = t.createBuffer(), $ = t.createBuffer();
  t.bindBuffer(t.ARRAY_BUFFER, $), t.bufferData(t.ARRAY_BUFFER, se * 4, t.DYNAMIC_DRAW);
  const b = f(x), G = f($);
  let p = null, M = !1, T = 0, P = 0, D = 0, v = !1, w = 1, R = 0, z = 1;
  function k() {
    if (!p) return;
    const h = he(e, a.width, a.height, p), L = p.referenceGenes.size, S = h.numGenomes * L + L, y = new Float32Array(S * se);
    let E = 0;
    const B = (_, j, s, d, C) => {
      y[E] = _, y[E + 1] = j, y[E + 2] = s, y[E + 3] = d, y[E + 4] = C[0], y[E + 5] = C[1], y[E + 6] = C[2], y[E + 7] = C[3], E += se;
    };
    if (p.visibleGenomes.forEach((_, j) => {
      const s = p.genomeGenes.get(_);
      if (!s) return;
      const d = h.blowInner + j * h.genomeWidth, C = d + h.genomeWidth - 1, O = Oe(p.genomeColors.get(_) || "#888888");
      p.referenceGenes.forEach((I, F) => {
        s.has(F) && (I.endAngle <= I.startAngle || B(I.startAngle, I.endAngle, d, C, O));
      });
    }), p.annotActive && h.annotWidth > 0) {
      const _ = h.blowInner + h.numGenomes * h.genomeWidth, j = _ + h.annotWidth;
      p.referenceGenes.forEach((s, d) => {
        if (s.endAngle <= s.startAngle) return;
        const C = p.geneAnnotColors.get(d);
        C && B(s.startAngle, s.endAngle, _, j, Oe(C));
      });
    }
    T = E / se, T !== 0 && (t.bindBuffer(t.ARRAY_BUFFER, x), t.bufferData(t.ARRAY_BUFFER, y.subarray(0, E), t.DYNAMIC_DRAW));
  }
  function A(h) {
    if (v) return;
    D = requestAnimationFrame(A);
    const L = P ? h - P : 0;
    P = h;
    const S = e.zoom;
    S.tick(L), S.setTargetRadiusScale(kn(e, a.width, a.height));
    const y = Math.abs(S.displayRadiusScale - w), E = Math.abs(S.focusAngle - R), B = Math.abs(S.zoomLevel - z);
    if ((y > 2e-3 || E > 1e-3 || B > 0.01) && (w = S.displayRadiusScale, R = S.focusAngle, z = S.zoomLevel, y > 2e-3 && p && (M = !0), l && l()), t.clearColor(0, 0, 0, 0), t.clear(t.COLOR_BUFFER_BIT), !p || S.zoomLevel <= 1.05) return;
    M && (k(), M = !1);
    const _ = he(e, a.width, a.height, p), j = S.wedgeSpan * Math.PI, s = j / S.zoomLevel;
    t.useProgram(g), t.uniform1f(c.uFocusAngle, S.focusAngle), t.uniform1f(c.uDataHalfSpan, s), t.uniform1f(c.uZoomLevel, S.zoomLevel), t.uniform1f(c.uWedgeHalfSpan, j), t.uniform2f(c.uCenter, _.cx, _.cy), t.uniform2f(c.uResolution, a.width, a.height), T > 0 && (t.bindVertexArray(b), t.drawArraysInstanced(t.TRIANGLES, 0, ze, T)), t.bindBuffer(t.ARRAY_BUFFER, $), t.bufferData(t.ARRAY_BUFFER, new Float32Array([
      S.focusAngle - s,
      S.focusAngle + s,
      _.outerRadius + 2,
      _.outerRadius + 6,
      ...Un
    ]), t.DYNAMIC_DRAW), t.uniform1f(c.uZoomLevel, 1), t.uniform1f(c.uDataHalfSpan, Math.PI), t.uniform1f(c.uWedgeHalfSpan, Math.PI), t.bindVertexArray(G), t.drawArraysInstanced(t.TRIANGLES, 0, ze, 1), t.bindVertexArray(null);
  }
  const m = new ResizeObserver(() => {
    const h = o.clientWidth, L = o.clientHeight;
    h === 0 || L === 0 || (a.width = h, a.height = L, t.viewport(0, 0, h, L), M = !0);
  });
  return m.observe(o), D = requestAnimationFrame(A), {
    available: !0,
    canvas: a,
    setRenderData(h) {
      p = h, M = !0;
    },
    markDirty() {
      M = !0;
    },
    destroy() {
      if (v) return;
      v = !0, cancelAnimationFrame(D), m.disconnect(), t.bindVertexArray(null), t.bindBuffer(t.ARRAY_BUFFER, null), t.useProgram(null), t.deleteVertexArray(b), t.deleteVertexArray(G), t.deleteBuffer(x), t.deleteBuffer($), t.deleteProgram(g);
      const h = t.getExtension("WEBGL_lose_context");
      h && h.loseContext(), a.width = 0, a.height = 0, a.remove(), p = null, Se -= 1;
    }
  };
}
const ke = 1.15, qn = 600, ve = 2 * Math.PI;
function Vn({ state: e, refs: n, onSettled: l }) {
  const o = n.canvas, a = e.zoom;
  let t = !1, r = null;
  function i() {
    l && (r && clearTimeout(r), r = setTimeout(() => {
      r = null, l();
    }, qn));
  }
  function u(c) {
    const f = o.getBoundingClientRect(), x = c.clientX - f.left - o.width / 2, $ = c.clientY - f.top - o.height / 2;
    let b = Math.atan2($, x) + Math.PI / 2;
    return b < 0 && (b += ve), b >= ve && (b -= ve), b;
  }
  const g = {
    mousedown(c) {
      t = !0, a.setFocusAngle(u(c)), a.setHovering(!0);
    },
    mousemove(c) {
      a.setHovering(!0), t && a.setFocusAngle(u(c));
    },
    mouseup() {
      t && i(), t = !1;
    },
    wheel(c) {
      c.preventDefault(), a.isHovering && (a.zoomLevelTarget <= 1.01 && c.deltaY < 0 && a.setFocusAngle(u(c)), a.setZoomLevel(c.deltaY < 0 ? a.zoomLevel * ke : a.zoomLevel / ke), i());
    },
    mouseleave() {
      t = !1, a.setHovering(!1);
    },
    mouseenter() {
      a.setHovering(!0);
    }
  };
  for (const [c, f] of Object.entries(g))
    o.addEventListener(c, f, c === "wheel" ? { passive: !1 } : void 0);
  return {
    destroy() {
      r && clearTimeout(r);
      for (const [c, f] of Object.entries(g))
        o.removeEventListener(c, f);
    }
  };
}
const Ne = { dark: "#1a1a2e", light: "#ffffff" };
function jn(e, n, l) {
  if (!e || e.childElementCount === 0) return null;
  const o = e.hasAttribute("width"), a = e.hasAttribute("height");
  o || e.setAttribute("width", n), a || e.setAttribute("height", l);
  const t = new XMLSerializer().serializeToString(e);
  o || e.removeAttribute("width"), a || e.removeAttribute("height");
  const r = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" }));
  return new Promise((i) => {
    const u = new Image();
    u.onload = () => {
      URL.revokeObjectURL(r), i(u);
    }, u.onerror = () => {
      URL.revokeObjectURL(r), i(null);
    }, u.src = r;
  });
}
async function Zn({ state: e, refs: n, webglCanvas: l }, o = 1) {
  const a = n.canvas, t = a.width, r = a.height, i = document.createElement("canvas");
  i.width = t, i.height = r;
  const u = i.getContext("2d");
  u.fillStyle = Ne[e.theme] || Ne.dark, u.fillRect(0, 0, t, r), u.drawImage(a, 0, 0), l && u.drawImage(l, 0, 0);
  const g = await jn(n.overlay, t, r);
  if (g && u.drawImage(g, 0, 0), o === 1) return i;
  const c = document.createElement("canvas");
  return c.width = Math.max(1, Math.round(t * o)), c.height = Math.max(1, Math.round(r * o)), c.getContext("2d").drawImage(i, 0, 0, c.width, c.height), c;
}
async function Pe(e, n = 1) {
  const l = await Zn(e, n);
  return new Promise((o, a) => {
    l.toBlob((t) => {
      t ? o(t) : a(new Error("Canvas could not be encoded as PNG."));
    }, "image/png");
  });
}
function De(e, n) {
  const l = URL.createObjectURL(e), o = document.createElement("a");
  o.href = l, o.download = n, o.style.display = "none", document.body.appendChild(o), o.click(), o.remove(), setTimeout(() => URL.revokeObjectURL(l), 1e4);
}
async function Yn(e) {
  if (navigator.clipboard && navigator.clipboard.writeText)
    try {
      return await navigator.clipboard.writeText(e), !0;
    } catch {
    }
  const n = document.createElement("textarea");
  n.value = e, n.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;border:none", document.body.appendChild(n), n.select();
  let l = !1;
  try {
    l = document.execCommand("copy");
  } finally {
    n.remove();
  }
  return l;
}
function _e(e, { rawData: n, columns: l }, o = null) {
  const a = Re();
  a.rawData = n, a.columns = l, a.sourceUrl = o, e.geneAnnot = a;
}
function Xn(e) {
  e.geneAnnot = Re();
}
function Ge(e, n) {
  const l = e.geneAnnot;
  if (l.categoryColumn = n || null, l.selectedCategories = /* @__PURE__ */ new Set(), !l.categoryColumn) {
    l.categoryValues = [], l.categoryCounts = /* @__PURE__ */ new Map(), l.scale = null;
    return;
  }
  const o = /* @__PURE__ */ new Map();
  l.rawData.forEach((t) => {
    const r = t[n];
    if (r == null || r === "") return;
    const i = String(r);
    o.set(i, (o.get(i) || 0) + 1);
  });
  const a = [...o.keys()].sort(
    (t, r) => o.get(r) - o.get(t) || t.localeCompare(r)
  );
  l.categoryValues = a, l.categoryCounts = o, l.scale = Me(tn("Tableau10")).domain(a);
}
function xe(e, n) {
  e.geneAnnot.selectedCategories = new Set(n || []);
}
function Kn(e, n, l) {
  const o = e.geneAnnot.selectedCategories;
  l ? o.add(String(n)) : o.delete(String(n));
}
function Qn(e, n, l) {
  e.geneAnnot.customColors.set(n, l);
}
function Jn(e, n) {
  const l = e.geneAnnot;
  if (!l.categoryColumn || !l.scale || l.selectedCategories.size === 0) return null;
  const o = l.rawData.get(String(n));
  if (!o) return null;
  const a = o[l.categoryColumn];
  if (a == null || a === "") return null;
  const t = String(a);
  return l.selectedCategories.has(t) ? l.customColors.get(t) || l.scale(t) : null;
}
const et = "genome_id";
function He(e, { rawData: n, columns: l }, o = null) {
  const a = Ee();
  a.rawData = n, a.columns = l, a.sourceUrl = o, e.genomeAnnot = a;
}
const Be = et;
function nt(e) {
  e.genomeAnnot = Ee();
}
function Fe(e, n) {
  if (!n) return { scale: null, domain: [] };
  const l = /* @__PURE__ */ new Set(), o = [];
  return e.rawData.forEach((a) => {
    const t = a[n];
    if (t == null || t === "") return;
    const r = String(t);
    l.has(r) || (l.add(r), o.push(r));
  }), o.sort(), { scale: Me(tn(e.palette)).domain(o), domain: o };
}
function we(e) {
  const n = e.genomeAnnot, l = Fe(n, n.colorColumn);
  n.scale = l.scale, n.domain = l.domain;
  const o = Fe(n, n.groupColumn);
  n.groupScale = o.scale, n.groupDomain = o.domain;
}
function tt(e, n) {
  e.genomeAnnot.colorColumn = n || null, we(e);
}
function ot(e, n) {
  e.genomeAnnot.groupColumn = n || null, we(e);
}
function lt(e, n) {
  e.genomeAnnot.labelColumn = n || null;
}
function at(e, n) {
  e.genomeAnnot.tooltipColumns = Array.isArray(n) ? n.slice() : [];
}
function rt(e, n, l) {
  e.genomeAnnot.sortColumn = n || null, e.genomeAnnot.sortAscending = l !== !1;
}
function st(e, n) {
  e.genomeAnnot.palette = n, we(e);
}
function it(e, n) {
  const l = e.genomeAnnot, o = !!(l.groupColumn && l.groupScale), a = o ? l.groupColumn : l.colorColumn, t = o ? l.groupScale : l.scale;
  if (!a || !t) return null;
  const r = l.rawData.get(String(n));
  if (!r) return null;
  const i = r[a];
  return i == null || i === "" ? null : t(String(i));
}
function Ue(e, n) {
  const l = e.genomeAnnot;
  if (l.labelColumn) {
    const o = l.rawData.get(String(n));
    if (o) {
      const a = o[l.labelColumn];
      if (a != null && a !== "") return String(a);
    }
  }
  return String(n).replace(/_genomic\.fna\.gz$/, "").replace(/\.fna\.gz$/, "");
}
function ct(e, n) {
  const l = e.genomeAnnot;
  if (l.groupColumn) {
    const t = l.groupColumn;
    return n.slice().sort((r, i) => {
      const u = l.rawData.get(String(r)), g = l.rawData.get(String(i)), c = u && u[t] != null ? String(u[t]) : "", f = g && g[t] != null ? String(g[t]) : "";
      return c.localeCompare(f) || String(r).localeCompare(String(i));
    });
  }
  if (!l.sortColumn) {
    if (e.customGenomeOrder) {
      const t = new Map(e.customGenomeOrder.map((r, i) => [r, i]));
      return n.slice().sort((r, i) => {
        const u = t.has(r), g = t.has(i);
        return u && g ? t.get(r) - t.get(i) : u ? -1 : g ? 1 : String(r).localeCompare(String(i));
      });
    }
    return n.slice().sort();
  }
  const o = l.sortColumn, a = l.sortAscending;
  return n.slice().sort((t, r) => {
    const i = l.rawData.get(String(t)), u = l.rawData.get(String(r)), g = i !== void 0 && i[o] !== null && i[o] !== void 0, c = u !== void 0 && u[o] !== null && u[o] !== void 0;
    if (!g && !c) return 0;
    if (!g) return 1;
    if (!c) return -1;
    const f = i[o], x = u[o], $ = typeof f == "number" && typeof x == "number" ? f - x : String(f).localeCompare(String(x));
    return a ? $ : -$;
  });
}
const de = 2 * Math.PI;
function gt(e) {
  const n = e.rows.filter((b) => b.genome === e.referenceGenome), l = /* @__PURE__ */ new Map();
  for (const b of n)
    l.has(b.qseqid) || l.set(b.qseqid, b.qlen);
  let o = 0;
  const a = /* @__PURE__ */ new Map(), t = [];
  for (const [b, G] of [...l.entries()].sort((p, M) => M[1] - p[1])) {
    const p = { id: b, length: G, cumStart: o };
    a.set(b, p), t.push(p), o += G;
  }
  const r = o, i = /* @__PURE__ */ new Map();
  for (const b of n) {
    const G = a.get(b.qseqid);
    if (!G) continue;
    const p = i.get(b.sseqid);
    if (p && p.coverage >= b.coverage) continue;
    const M = (G.cumStart + b.qstart) / r * de, T = (G.cumStart + b.qend) / r * de, P = T >= M ? (M + T) / 2 : (M + T + de) / 2 % de;
    i.set(b.sseqid, {
      contigId: b.qseqid,
      qstart: b.qstart,
      qend: b.qend,
      startAngle: M,
      endAngle: T,
      midAngle: P,
      pident: b.pident,
      coverage: b.coverage
    });
  }
  const u = /* @__PURE__ */ new Map();
  for (const b of e.rows) {
    if (b.genome === e.referenceGenome) continue;
    let G = u.get(b.genome);
    G || (G = /* @__PURE__ */ new Map(), u.set(b.genome, G));
    const p = G.get(b.sseqid);
    (!p || b.coverage > p.coverage) && G.set(b.sseqid, { pident: b.pident, coverage: b.coverage });
  }
  const g = Me(yn(e.theme)).domain(e.allGenomes), c = ct(e, [...e.visibleGenomes]), f = !!e.geneAnnot.categoryColumn, x = /* @__PURE__ */ new Map();
  if (f && e.geneAnnot.selectedCategories.size > 0)
    for (const b of i.keys()) {
      const G = Jn(e, b);
      G && x.set(b, G);
    }
  const $ = /* @__PURE__ */ new Map();
  for (const b of e.allGenomes)
    $.set(b, it(e, b) || g(b));
  return {
    contigs: t,
    totalLength: r,
    referenceGenes: i,
    genomeGenes: u,
    visibleGenomes: c,
    colorScale: g,
    annotActive: f,
    annotDisplayMode: e.geneAnnot.displayMode,
    geneAnnotColors: x,
    genomeColors: $
  };
}
function ut(e, n) {
  n !== e.referenceGenome && (e.referenceGenome !== null && e.visibleGenomes.add(e.referenceGenome), e.visibleGenomes.delete(n), e.referenceGenome = n);
}
function Ce(e, n, l) {
  l ? e.visibleGenomes.add(n) : e.visibleGenomes.delete(n);
}
function dt(e) {
  const n = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
  let o = 0;
  for (const p of e.rows) {
    const M = p.genome;
    if (!M || M === e.referenceGenome) continue;
    const T = p.sseqid;
    if (!T) continue;
    let P = n.get(T);
    P === void 0 && (P = o++, n.set(T, P));
    let D = l.get(M);
    D || (D = /* @__PURE__ */ new Set(), l.set(M, D)), D.add(P);
  }
  const a = [...l.keys()], t = a.length;
  if (t <= 1) return a;
  const r = Math.ceil(o / 32) || 1, i = a.map((p) => {
    const M = new Int32Array(r);
    return l.get(p).forEach((T) => {
      M[T >> 5] |= 1 << (T & 31);
    }), M;
  }), u = (p) => (p = p >>> 0, p -= p >>> 1 & 1431655765, p = (p & 858993459) + (p >>> 2 & 858993459), p = p + (p >>> 4) & 252645135, p * 16843009 >>> 24), g = new Int32Array(t);
  for (let p = 0; p < t; p++) {
    let M = 0;
    for (let T = 0; T < r; T++) M += u(i[p][T]);
    g[p] = M;
  }
  const c = (p, M) => {
    let T = 0;
    for (let P = 0; P < r; P++) T += u(p[P] & M[P]);
    return T;
  }, f = [...g].sort((p, M) => p - M)[Math.floor(t / 2)];
  let x = 0, $ = 1 / 0;
  for (let p = 0; p < t; p++) {
    const M = Math.abs(g[p] - f);
    M < $ && ($ = M, x = p);
  }
  const b = new Uint8Array(t), G = [x];
  b[x] = 1;
  for (let p = 1; p < t; p++) {
    const M = G[p - 1];
    let T = -1, P = -1;
    for (let D = 0; D < t; D++) {
      if (b[D]) continue;
      const v = c(i[M], i[D]), w = g[M] + g[D] - v, R = w > 0 ? v / w : 0;
      R > P && (P = R, T = D);
    }
    G.push(T), b[T] = 1;
  }
  return G.map((p) => a[p]);
}
const mt = "— none —", We = "#888888";
function ye(e) {
  return e >= 1e6 ? `${(e / 1e6).toFixed(2)} Mbp` : e >= 1e3 ? `${(e / 1e3).toFixed(1)} kbp` : `${e} bp`;
}
function ae(e, n, l) {
  if (!e) return;
  e.innerHTML = "";
  const o = document.createElement("option");
  o.value = "", o.textContent = mt, e.appendChild(o);
  for (const a of n) {
    const t = document.createElement("option");
    t.value = a, t.textContent = a, e.appendChild(t);
  }
  e.value = l || "";
}
function ft({
  state: e,
  refs: n,
  render: l,
  emitChange: o,
  getRenderData: a,
  markWebGLDirty: t,
  exportPNG: r,
  exportSVG: i,
  setCollapsed: u
}) {
  const g = [];
  function c(s, d, C, O) {
    s && (s.addEventListener(d, C, O), g.push(() => s.removeEventListener(d, C, O)));
  }
  function f() {
    l(), o();
  }
  let x = [], $ = -1;
  function b(s) {
    const d = n.refList;
    d.innerHTML = "", $ = -1;
    const C = n.refInput.dataset.value || "";
    for (const O of s) {
      const I = document.createElement("li");
      I.className = `ref-combobox-option${O.value === C ? " selected" : ""}`, I.setAttribute("role", "option"), I.dataset.value = O.value, I.textContent = O.label, I.addEventListener("mousedown", (F) => {
        F.preventDefault(), T(O.value);
      }), d.appendChild(I);
    }
  }
  function G() {
    const s = n.refInput.value.trim().toLowerCase();
    b(s ? x.filter((d) => d.label.toLowerCase().includes(s) || d.value.toLowerCase().includes(s)) : x), n.refList.hidden = !1, n.refInput.setAttribute("aria-expanded", "true"), n.refList.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
  function p() {
    n.refList.hidden = !0, n.refInput.setAttribute("aria-expanded", "false"), M(n.refInput.dataset.value || "");
  }
  function M(s) {
    const d = x.find((C) => C.value === s);
    n.refInput.value = d ? d.label : s, n.refInput.dataset.value = s;
  }
  function T(s) {
    M(s), ut(e, s), D(), p(), f();
  }
  function P() {
    x = e.allGenomes.map((s) => ({ value: s, label: Ue(e, s) })), M(e.referenceGenome || "");
  }
  c(n.refInput, "focus", G), c(n.refInput, "input", G), c(n.refInput, "blur", () => setTimeout(() => {
    n.refList.isConnected && p();
  }, 150)), c(n.refInput, "keydown", (s) => {
    const d = [...n.refList.querySelectorAll(".ref-combobox-option")];
    s.key === "ArrowDown" || s.key === "ArrowUp" ? (s.preventDefault(), $ = s.key === "ArrowDown" ? Math.min($ + 1, d.length - 1) : Math.max($ - 1, 0), d.forEach((C, O) => C.classList.toggle("active", O === $)), d[$]?.scrollIntoView({ block: "nearest" })) : s.key === "Enter" ? (s.preventDefault(), $ >= 0 && d[$] && T(d[$].dataset.value)) : s.key === "Escape" && (p(), n.refInput.blur());
  });
  function D() {
    const s = n.genomeToggles;
    s.innerHTML = "";
    const d = n.genomeSearch.value.toLowerCase(), C = a(), O = e.allGenomes.filter((I) => I !== e.referenceGenome).sort();
    if (O.length === 0) {
      const I = document.createElement("p");
      I.className = "genome-toggles-empty", I.textContent = "No other genomes loaded.", s.appendChild(I);
      return;
    }
    for (const I of O) {
      const F = Ue(e, I);
      if (d && !F.toLowerCase().includes(d)) continue;
      const H = document.createElement("label");
      H.className = "genome-toggle-label", H.dataset.genome = I, H.style.setProperty(
        "--genome-color",
        C && C.genomeColors.get(I) || We
      );
      const W = document.createElement("input");
      W.type = "checkbox", W.className = "genome-toggle-checkbox", W.value = I, W.checked = e.visibleGenomes.has(I), W.addEventListener("change", () => {
        Ce(e, I, W.checked), f();
      });
      const V = document.createElement("span");
      V.className = "genome-color-dot";
      const q = document.createElement("span");
      q.className = "genome-name", q.textContent = F, q.title = I, H.append(W, V, q), s.appendChild(H);
    }
  }
  function v(s) {
    if (s)
      for (const d of n.genomeToggles.querySelectorAll(".genome-toggle-label"))
        d.style.setProperty(
          "--genome-color",
          s.genomeColors.get(d.dataset.genome) || We
        );
  }
  c(n.genomeSearch, "input", D), c(n.genomeSelectAll, "click", () => {
    for (const s of n.genomeToggles.querySelectorAll(".genome-toggle-checkbox"))
      Ce(e, s.value, !0), s.checked = !0;
    f();
  }), c(n.genomeClearAll, "click", () => {
    for (const s of n.genomeToggles.querySelectorAll(".genome-toggle-checkbox"))
      Ce(e, s.value, !1), s.checked = !1;
    f();
  }), c(n.genomeSimilarityBtn, "click", () => {
    const s = n.genomeSimilarityBtn;
    if (e.customGenomeOrder) {
      e.customGenomeOrder = null, s.textContent = "Sort by gene content", f();
      return;
    }
    s.textContent = "Computing…", s.disabled = !0, setTimeout(() => {
      e.customGenomeOrder = dt(e), s.textContent = "Clear gene-content sort", s.disabled = !1, f();
    }, 10);
  });
  function w() {
    const s = n.geneCategoryList;
    s.innerHTML = "";
    const d = e.geneAnnot;
    if (!d.categoryColumn) return;
    const C = n.geneCategorySearch.value.toLowerCase(), O = a(), I = O && O.referenceGenes, F = /* @__PURE__ */ new Map();
    if (I)
      for (const [H, W] of d.rawData) {
        if (!I.has(H)) continue;
        const V = W[d.categoryColumn];
        if (V == null || V === "") continue;
        const q = String(V);
        F.set(q, (F.get(q) || 0) + 1);
      }
    for (const H of d.categoryValues) {
      if (C && !H.toLowerCase().includes(C)) continue;
      const W = d.categoryCounts.get(H) || 0, V = document.createElement("label");
      V.className = "category-item";
      const q = document.createElement("input");
      q.type = "checkbox", q.className = "category-checkbox", q.value = H, q.checked = d.selectedCategories.has(H), q.addEventListener("change", () => {
        Kn(e, H, q.checked), w(), f();
      });
      const X = document.createElement("input");
      X.type = "color", X.className = "category-swatch", X.value = d.customColors.get(H) || (d.scale ? d.scale(H) : "#888888"), X.title = "Click to change color", X.addEventListener("click", (Y) => Y.stopPropagation()), X.addEventListener("change", (Y) => {
        Y.stopPropagation(), Qn(e, H, Y.target.value), w(), f();
      });
      const Q = document.createElement("span");
      Q.className = "category-name", Q.textContent = H;
      const J = document.createElement("span");
      if (J.className = "category-count", I) {
        const Y = F.get(H) || 0;
        J.textContent = `(${Y} / ${W})`, J.title = `${Y} in reference / ${W} total`;
      } else
        J.textContent = `(${W})`;
      V.append(q, X, Q, J), s.appendChild(V);
    }
  }
  function R() {
    const s = e.geneAnnot, d = s.columns.length > 0;
    n.geneAnnotControls.hidden = !d, ae(n.geneCategorySelect, s.columns, s.categoryColumn), ae(n.geneLabelSelect, s.columns, s.labelColumn), n.geneCategorySearch.value = "", z();
  }
  function z() {
    n.geneCategorySection.hidden = !e.geneAnnot.categoryColumn, w();
  }
  c(n.geneCategorySelect, "change", (s) => {
    Ge(e, s.target.value || null), z(), f();
  }), c(n.geneLabelSelect, "change", (s) => {
    e.geneAnnot.labelColumn = s.target.value || null, f();
  }), c(n.geneSelectAll, "click", () => {
    const s = [...n.geneCategoryList.querySelectorAll(".category-checkbox")].map((d) => d.value);
    xe(e, [...e.geneAnnot.selectedCategories, ...s]), w(), f();
  }), c(n.geneClearAll, "click", () => {
    xe(e, []), w(), f();
  }), c(n.geneCategorySearch, "input", w), c(n.geneClearBtn, "click", () => {
    Xn(e), R(), f();
  });
  function k() {
    const s = n.geneLegend;
    s.innerHTML = "";
    const d = e.geneAnnot;
    if (!d.categoryColumn || !d.scale || d.selectedCategories.size === 0) return;
    const C = document.createElement("div");
    C.className = "legend-title", C.textContent = d.categoryColumn, s.appendChild(C);
    const O = document.createElement("div");
    O.className = "legend-items";
    for (const I of [...d.selectedCategories].sort())
      O.appendChild(L(I, d.customColors.get(I) || d.scale(I)));
    s.appendChild(O);
  }
  function A(s) {
    const d = e.geneAnnot;
    if (!d.categoryColumn) {
      n.geneStats.hidden = !0, n.geneSelectionStats.textContent = "";
      return;
    }
    const C = s && s.referenceGenes, O = d.rawData.size;
    let I = 0;
    if (C)
      for (const Q of d.rawData.keys()) C.has(Q) && I++;
    const F = O - I, H = O > 0 ? (I / O * 100).toFixed(1) : "0.0", W = e.referenceGenome || "reference";
    let V = `Out of ${O.toLocaleString()} genes in metadata, ${H}% (${I.toLocaleString()}) are present in ${be(W)}.`;
    if (F > 0 && (V += ` ${F.toLocaleString()} gene${F === 1 ? "" : "s"} not found in alignments.`), n.geneStats.innerHTML = V, n.geneStats.hidden = !1, d.selectedCategories.size === 0) {
      n.geneSelectionStats.textContent = "";
      return;
    }
    let q = 0, X = 0;
    for (const [Q, J] of d.rawData) {
      const Y = J[d.categoryColumn];
      Y == null || Y === "" || d.selectedCategories.has(String(Y)) && (X++, C && C.has(Q) && q++);
    }
    n.geneSelectionStats.textContent = `${q.toLocaleString()} / ${X.toLocaleString()} selected genes present in alignments.`;
  }
  function m() {
    const s = e.genomeAnnot;
    n.genomeAnnotControls.hidden = s.columns.length === 0, ae(n.genomeColorSelect, s.columns, s.colorColumn), ae(n.genomeGroupSelect, s.columns, s.groupColumn), ae(n.genomeLabelSelect, s.columns, s.labelColumn), ae(n.genomeSortSelect, s.columns, s.sortColumn), n.genomeTooltipSelect.innerHTML = "";
    for (const d of s.columns) {
      const C = document.createElement("option");
      C.value = d, C.textContent = d, C.selected = s.tooltipColumns.includes(d), n.genomeTooltipSelect.appendChild(C);
    }
    n.genomePaletteSelect.value = s.palette, n.genomeSortOrderSelect.value = s.sortAscending ? "asc" : "desc";
  }
  c(n.genomeColorSelect, "change", (s) => {
    tt(e, s.target.value || null), f();
  }), c(n.genomeGroupSelect, "change", (s) => {
    ot(e, s.target.value || null), f();
  }), c(n.genomeLabelSelect, "change", (s) => {
    lt(e, s.target.value || null), P(), D(), f();
  }), c(n.genomePaletteSelect, "change", (s) => {
    st(e, s.target.value), f();
  }), c(n.genomeTooltipSelect, "change", () => {
    at(e, [...n.genomeTooltipSelect.selectedOptions].map((s) => s.value)), o();
  });
  function h() {
    rt(
      e,
      n.genomeSortSelect.value || null,
      n.genomeSortOrderSelect.value !== "desc"
    ), f();
  }
  c(n.genomeSortSelect, "change", h), c(n.genomeSortOrderSelect, "change", h), c(n.genomeClearBtn, "click", () => {
    nt(e), m(), P(), D(), f();
  });
  function L(s, d) {
    const C = document.createElement("div");
    C.className = "legend-item";
    const O = document.createElement("span");
    O.className = "legend-swatch", O.style.background = d, O.setAttribute("aria-hidden", "true");
    const I = document.createElement("span");
    return I.className = "legend-label", I.textContent = s, C.append(O, I), C;
  }
  function S() {
    const s = n.genomeLegend;
    s.innerHTML = "";
    const d = e.genomeAnnot, C = !!(d.groupColumn && d.groupScale), O = C ? d.groupColumn : d.colorColumn, I = C ? d.groupScale : d.scale, F = C ? d.groupDomain : d.domain;
    if (!O || !I) return;
    const H = document.createElement("div");
    H.className = "legend-title", H.textContent = O, s.appendChild(H);
    const W = document.createElement("div");
    W.className = "legend-items";
    for (const V of F) W.appendChild(L(V, I(V)));
    s.appendChild(W);
  }
  function y() {
    const s = e.genomeAnnot;
    if (s.rawData.size === 0) {
      n.genomeStats.hidden = !0;
      return;
    }
    const d = s.rawData.size, C = e.allGenomes.filter((F) => s.rawData.has(String(F))).length;
    let I = `${(C / d * 100).toFixed(1)}% (${C.toLocaleString()} / ${d.toLocaleString()}) of metadata genomes found in alignment data.`;
    d - C > 0 && (I += ` ${(d - C).toLocaleString()} not found.`), n.genomeStats.innerHTML = I, n.genomeStats.hidden = !1;
  }
  function E() {
    const s = e.zoom;
    n.wedgeSpanInput.value = Math.round(s.wedgeSpan * 100), n.wedgeSpanDisplay.textContent = `${Math.round(s.wedgeSpan * 100)}%`, n.wedgeGapInput.value = s.wedgeGap, n.wedgeGapDisplay.textContent = `${s.wedgeGap}px`, n.wedgeHeightInput.value = s.wedgeHeightScale, n.wedgeHeightDisplay.textContent = `${s.wedgeHeightScale.toFixed(1)}×`;
  }
  c(n.wedgeSpanInput, "input", () => {
    e.zoom.setWedgeSpan(parseInt(n.wedgeSpanInput.value, 10) / 100), n.wedgeSpanDisplay.textContent = `${n.wedgeSpanInput.value}%`, o();
  }), c(n.wedgeGapInput, "input", () => {
    e.zoom.setWedgeGap(parseInt(n.wedgeGapInput.value, 10)), n.wedgeGapDisplay.textContent = `${n.wedgeGapInput.value}px`, t(), l(), o();
  }), c(n.wedgeHeightInput, "input", () => {
    const s = parseFloat(n.wedgeHeightInput.value);
    e.zoom.setWedgeHeightScale(s), n.wedgeHeightDisplay.textContent = `${s.toFixed(1)}×`, t(), l(), o();
  }), c(n.resetZoomBtn, "click", () => {
    e.zoom.resetZoom(), o();
  }), c(n.zoomInfoClose, "click", () => {
    e.zoom.resetZoom(), B(), o();
  });
  function B() {
    const s = e.zoom, d = a();
    if (s.zoomLevel <= 1.05 || !d || !d.totalLength) {
      n.zoomInfo.hidden = !0;
      return;
    }
    const C = s.wedgeSpan * Math.PI / s.zoomLevel, O = (s.focusAngle - C + 4 * Math.PI) % (2 * Math.PI), I = (s.focusAngle + C + 4 * Math.PI) % (2 * Math.PI), F = d.totalLength / (2 * Math.PI);
    n.zoomInfoText.textContent = `${ye(Math.round(O * F))} – ${ye(Math.round(I * F))} (${ye(Math.round(C * 2 * F))} shown)`, n.zoomInfo.hidden = !1;
  }
  c(n.themeBtn, "click", () => {
    e.theme = e.theme === "light" ? "dark" : "light", l(), D(), o();
  }), c(n.collapseBtn, "click", () => _(!0)), c(n.expandBtn, "click", () => _(!1));
  function _(s) {
    n.sidebar.classList.toggle("collapsed", s), n.expandBtn.hidden = !s, u(s);
  }
  function j(s, d) {
    const C = s.textContent;
    s.textContent = d, setTimeout(() => {
      s.textContent = C;
    }, 1500);
  }
  return c(n.exportPngBtn, "click", async () => {
    De(await r(), "pangenome.png");
  }), c(n.exportSvgBtn, "click", () => {
    De(new Blob([i()], { type: "image/svg+xml" }), "pangenome.svg");
  }), c(n.embedBtn, "click", async () => {
    const s = `<iframe src="${window.location.href}" width="100%" height="600" frameborder="0" style="border:none" allowfullscreen></iframe>`;
    j(n.embedBtn, await Yn(s) ? "Copied!" : "Copy failed");
  }), {
    /**
     * Rebuild every control from state. Called whenever a config is applied — after
     * a data load and on each update() — so no select or toggle shows a stale value.
     */
    syncFromState() {
      P(), R(), m(), D(), E(), n.genomeSimilarityBtn.textContent = e.customGenomeOrder ? "Clear gene-content sort" : "Sort by gene content", n.controlsPanel.hidden = e.rows.length === 0;
    },
    /** Called after every render, to keep the sidebar consistent with the figure. */
    refresh(s) {
      k(), S(), A(s), y(), B(), E(), v(s), n.refList.hidden && M(e.referenceGenome || "");
    },
    /**
     * Called on animation frames where the zoom moved. Deliberately narrower than
     * refresh(): rebuilding legends and stats at 60fps would be wasted work.
     */
    onAnimate() {
      B();
    },
    setCollapsed(s) {
      n.sidebar.classList.toggle("collapsed", s), n.expandBtn.hidden = !s;
    },
    destroy() {
      for (const s of g) s();
      g.length = 0;
    }
  };
}
const ge = 2 * Math.PI, pt = 1, ht = "rgba(255,217,26,0.9)", qe = { dark: "#1a1a2e", light: "#ffffff" }, N = (e) => e.toFixed(pt).replace(/\.0$/, "");
function oe(e, n, l, o) {
  const a = o - l;
  if (a <= 0) return "";
  if (a >= ge - 1e-9)
    return `M0,${N(-n)}A${N(n)},${N(n)} 0 1 1 0,${N(n)}A${N(n)},${N(n)} 0 1 1 0,${N(-n)}ZM0,${N(-e)}A${N(e)},${N(e)} 0 1 0 0,${N(e)}A${N(e)},${N(e)} 0 1 0 0,${N(-e)}Z`;
  const t = a > Math.PI ? 1 : 0, r = (u, g) => N(u * Math.sin(g)), i = (u, g) => N(-u * Math.cos(g));
  return `M${r(n, l)},${i(n, l)}A${N(n)},${N(n)} 0 ${t} 1 ${r(n, o)},${i(n, o)}L${r(e, o)},${i(e, o)}A${N(e)},${N(e)} 0 ${t} 0 ${r(e, l)},${i(e, l)}Z`;
}
function bt(e, n) {
  return oe(e, n, 0, ge);
}
function ne(e, n) {
  return e ? `<path fill="${n}" d="${e}"/>` : "";
}
function At(e, n, l) {
  const o = [];
  let a = "";
  for (const t of n.contigs) {
    const { startAngle: r, endAngle: i } = cn(t, n.totalLength);
    i <= r || (a += oe(l.referenceRingInner, l.referenceRingOuter, r, i));
  }
  o.push(ne(a, ln));
  for (let t = 0; t < n.visibleGenomes.length; t++) {
    const r = n.visibleGenomes[t], i = n.genomeGenes.get(r);
    if (!i) continue;
    const { outer: u, inner: g } = l.genomeRingBounds(t);
    let c = "";
    for (const [f, x] of n.referenceGenes)
      i.has(f) && (x.endAngle <= x.startAngle || (c += oe(g, u, x.startAngle, x.endAngle)));
    o.push(ne(c, n.genomeColors.get(r) || n.colorScale(r)));
  }
  if (n.annotActive) {
    const { annotRingInner: t, annotRingOuter: r } = l;
    o.push(ne(bt(t, r), rn(e.theme)));
    const i = n.annotDisplayMode === "arrows", u = /* @__PURE__ */ new Map();
    for (const [g, c] of n.referenceGenes) {
      if (c.endAngle <= c.startAngle) continue;
      const f = n.geneAnnotColors.get(g);
      if (!f) continue;
      const x = i ? (() => {
        const [$, b, G] = gn(c, t, r);
        return `M${N($[0])},${N($[1])}L${N(b[0])},${N(b[1])}L${N(G[0])},${N(G[1])}Z`;
      })() : oe(t, r, c.startAngle, c.endAngle);
      u.set(f, (u.get(f) || "") + x);
    }
    for (const [g, c] of u) o.push(ne(c, g));
  }
  return o.join("");
}
function wt(e, n, l) {
  const o = e.zoom;
  if (o.zoomLevel <= 1.05) return "";
  const a = he(e, l.cx * 2, l.cy * 2, n), t = o.wedgeSpan * Math.PI, r = t / o.zoomLevel, i = (c) => {
    let f = c - o.focusAngle;
    return f = ((f + Math.PI) % ge + ge) % ge - Math.PI, f;
  };
  function u(c, f) {
    const x = i(c), $ = i(f);
    if (Math.abs(x) > r && Math.abs($) > r && x * $ > 0) return null;
    const b = (p) => Math.max(-r, Math.min(r, p)), G = (p) => Math.max(-t, Math.min(t, p));
    return [
      o.focusAngle + G(b(x) * o.zoomLevel),
      o.focusAngle + G(b($) * o.zoomLevel)
    ];
  }
  const g = [];
  if (n.visibleGenomes.forEach((c, f) => {
    const x = n.genomeGenes.get(c);
    if (!x) return;
    const $ = a.blowInner + f * a.genomeWidth, b = $ + a.genomeWidth - 1;
    let G = "";
    for (const [p, M] of n.referenceGenes) {
      if (!x.has(p) || M.endAngle <= M.startAngle) continue;
      const T = u(M.startAngle, M.endAngle);
      T && (G += oe($, b, T[0], T[1]));
    }
    g.push(ne(G, n.genomeColors.get(c) || n.colorScale(c)));
  }), n.annotActive && a.annotWidth > 0) {
    const c = a.blowInner + a.numGenomes * a.genomeWidth, f = c + a.annotWidth, x = /* @__PURE__ */ new Map();
    for (const [$, b] of n.referenceGenes) {
      if (b.endAngle <= b.startAngle) continue;
      const G = n.geneAnnotColors.get($);
      if (!G) continue;
      const p = u(b.startAngle, b.endAngle);
      p && x.set(G, (x.get(G) || "") + oe(c, f, p[0], p[1]));
    }
    for (const [$, b] of x) g.push(ne(b, $));
  }
  return g.push(ne(
    oe(
      a.outerRadius + 2,
      a.outerRadius + 6,
      o.focusAngle - r,
      o.focusAngle + r
    ),
    ht
  )), g.join("");
}
function vt({ state: e, renderData: n, width: l, height: o }) {
  const a = qe[e.theme] || qe.dark;
  if (!n || !n.contigs || n.contigs.length === 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${o}" viewBox="0 0 ${l} ${o}"><rect width="${l}" height="${o}" fill="${a}"/></svg>`;
  const t = on(e, l, o, n), r = sn(n, t).map((u) => `<text x="${N(u.x)}" y="${N(u.y)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${N(u.rotateDeg)},${N(u.x)},${N(u.y)})" font-size="11" font-family="system-ui, sans-serif" fill="${an(e.theme)}">${be(u.id)}</text>`).join(""), i = At(e, n, t) + wt(e, n, t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${o}" viewBox="0 0 ${l} ${o}"><rect width="${l}" height="${o}" fill="${a}"/><g transform="translate(${N(t.cx)},${N(t.cy)})">${i}</g>` + r + "</svg>";
}
const Ct = /* @__PURE__ */ new Set([
  "qstart",
  "qend",
  "qlen",
  "sstart",
  "send",
  "slen",
  "length",
  "pident",
  "coverage"
]);
async function Ve(e) {
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(e) && !/^https?:\/\//i.test(e))
    throw new Error("Only http://, https://, and relative URLs are supported.");
  let n;
  try {
    n = await fetch(e);
  } catch (a) {
    const t = /^https?:\/\//i.test(e) ? " — check that the server allows CORS requests" : "";
    throw new Error(`Could not fetch ${e}${t}. (${a.message})`);
  }
  if (!n.ok) throw new Error(`HTTP ${n.status} fetching ${e}`);
  if (!(/\.gz$/i.test(e.split("?")[0]) || (n.headers.get("content-encoding") || "").toLowerCase().includes("gzip"))) return n.text();
  if (typeof DecompressionStream > "u")
    throw new Error("This browser cannot decompress gzip. Use Chrome, Firefox, or Edge.");
  const o = n.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(o).text();
}
function yt(e) {
  const n = en.parse(e, { header: !0, dynamicTyping: !0, skipEmptyLines: !0 }), l = (n.errors || []).find((o) => o.type === "Delimiter" || o.type === "Quotes");
  if (l) throw new Error(`CSV parse error: ${l.message}`);
  return n.data;
}
function je(e, n, l = null) {
  const o = /* @__PURE__ */ new Set();
  e.rows = n.map((a) => {
    const t = {};
    for (const [r, i] of Object.entries(a))
      r === "" || r === void 0 || (t[r] = Ct.has(r) ? typeof i == "number" ? i : parseFloat(i) : i);
    return o.add(t.genome), t;
  }), e.allGenomes = [...o].sort(), e.referenceGenome = e.allGenomes[0] ?? null, e.visibleGenomes = new Set(e.allGenomes.filter((a) => a !== e.referenceGenome)), e.customGenomeOrder = null, e.sourceUrl = l;
}
function St(e, n = null) {
  const l = en.parse(e, {
    header: !0,
    dynamicTyping: !0,
    skipEmptyLines: !0,
    delimiter: "",
    transform: (a) => typeof a == "string" ? a.trim() : a
  }), o = l.meta && l.meta.fields;
  if (!o || o.length < 1)
    throw new Error("Could not detect columns in the annotation file.");
  return Le(l.data, o, n);
}
function Le(e, n = null, l = null) {
  const o = n || (e.length > 0 ? Object.keys(e[0]) : []);
  if (o.length < 1) return { rawData: /* @__PURE__ */ new Map(), columns: [] };
  const a = l && o.includes(l) ? l : o[0], t = o.filter((i) => i !== a), r = /* @__PURE__ */ new Map();
  for (const i of e) {
    const u = i[a];
    if (u == null) continue;
    const g = String(u).trim();
    g && r.set(g, i);
  }
  return { rawData: r, columns: t };
}
const Ae = 1, $e = ["dark", "light"], Ie = ["bars", "arrows"], dn = /^#[0-9a-fA-F]{6}$/;
function te() {
  return {
    version: Ae,
    data: {
      alignmentUrl: null,
      geneAnnotationUrl: null,
      genomeAnnotationUrl: null
    },
    referenceGenome: null,
    visibleGenomes: null,
    // Input-only alias: resolved against the loaded genome list when
    // `visibleGenomes` is absent. `configFromState` always writes `visibleGenomes`,
    // so a round-tripped config has exactly one canonical form.
    hiddenGenomes: null,
    genomeOrder: null,
    geneAnnotation: {
      categoryColumn: null,
      labelColumn: null,
      selectedCategories: [],
      customColors: {},
      displayMode: "bars"
    },
    genomeAnnotation: {
      colorColumn: null,
      groupColumn: null,
      labelColumn: null,
      tooltipColumns: [],
      sortColumn: null,
      sortAscending: !0,
      palette: "Tableau10"
    },
    zoom: {
      focusAngle: 0,
      zoomLevel: 1,
      wedgeSpan: 1 / 3,
      wedgeGap: 6,
      wedgeHeightScale: 2
    },
    theme: "dark",
    controls: !0,
    controlsCollapsed: !1
  };
}
function Ze(e, { controls: n = !0, controlsCollapsed: l = !1 } = {}) {
  const o = e.geneAnnot, a = e.genomeAnnot, t = e.zoom, r = e.allGenomes.filter((u) => u !== e.referenceGenome), i = r.length === e.visibleGenomes.size && r.every((u) => e.visibleGenomes.has(u));
  return {
    version: Ae,
    data: {
      alignmentUrl: e.sourceUrl,
      geneAnnotationUrl: o.sourceUrl,
      genomeAnnotationUrl: a.sourceUrl
    },
    referenceGenome: e.referenceGenome,
    visibleGenomes: i ? null : [...e.visibleGenomes],
    hiddenGenomes: null,
    genomeOrder: e.customGenomeOrder ? [...e.customGenomeOrder] : null,
    geneAnnotation: {
      categoryColumn: o.categoryColumn,
      labelColumn: o.labelColumn,
      selectedCategories: [...o.selectedCategories],
      customColors: Object.fromEntries(o.customColors),
      displayMode: o.displayMode
    },
    genomeAnnotation: {
      colorColumn: a.colorColumn,
      groupColumn: a.groupColumn,
      labelColumn: a.labelColumn,
      tooltipColumns: [...a.tooltipColumns],
      sortColumn: a.sortColumn,
      sortAscending: a.sortAscending,
      palette: a.palette
    },
    zoom: {
      focusAngle: t.focusAngleTarget,
      zoomLevel: t.zoomLevelTarget,
      wedgeSpan: t.wedgeSpan,
      wedgeGap: t.wedgeGap,
      wedgeHeightScale: t.wedgeHeightScale
    },
    theme: e.theme,
    controls: n,
    controlsCollapsed: l
  };
}
function Gt(e, n) {
  const l = { ...te(), ...n };
  e.theme = $e.includes(l.theme) ? l.theme : "dark", l.referenceGenome && e.allGenomes.includes(l.referenceGenome) && (e.referenceGenome = l.referenceGenome);
  const o = e.allGenomes.filter((f) => f !== e.referenceGenome);
  if (Array.isArray(l.visibleGenomes))
    e.visibleGenomes = new Set(l.visibleGenomes.filter((f) => o.includes(f)));
  else if (Array.isArray(l.hiddenGenomes)) {
    const f = new Set(l.hiddenGenomes);
    e.visibleGenomes = new Set(o.filter((x) => !f.has(x)));
  } else
    e.visibleGenomes = new Set(o);
  e.customGenomeOrder = Array.isArray(l.genomeOrder) && l.genomeOrder.length > 0 ? l.genomeOrder.slice() : null;
  const a = { ...te().geneAnnotation, ...l.geneAnnotation || {} }, t = e.geneAnnot;
  a.categoryColumn && t.columns.includes(a.categoryColumn) ? (Ge(e, a.categoryColumn), xe(e, (a.selectedCategories || []).map(String))) : Ge(e, null), t.labelColumn = t.columns.includes(a.labelColumn) ? a.labelColumn : null, t.displayMode = Ie.includes(a.displayMode) ? a.displayMode : "bars", t.customColors = new Map(
    Object.entries(a.customColors || {}).filter(([, f]) => dn.test(f))
  );
  const r = { ...te().genomeAnnotation, ...l.genomeAnnotation || {} }, i = e.genomeAnnot, u = (f) => f && i.columns.includes(f) ? f : null;
  i.colorColumn = u(r.colorColumn), i.groupColumn = u(r.groupColumn), i.labelColumn = u(r.labelColumn), i.sortColumn = u(r.sortColumn), i.sortAscending = r.sortAscending !== !1, i.tooltipColumns = (r.tooltipColumns || []).filter((f) => i.columns.includes(f)), i.palette = pe.includes(r.palette) ? r.palette : "Tableau10", we(e);
  const g = { ...te().zoom, ...l.zoom || {} }, c = e.zoom;
  c.setWedgeSpan(g.wedgeSpan), c.setWedgeGap(g.wedgeGap), c.setWedgeHeightScale(g.wedgeHeightScale), c.setZoomLevel(g.zoomLevel), c.setFocusAngle(g.focusAngle), c.snapToTargets();
}
function U(e, n) {
  throw new Error(`GenomeDisplayConfig${e ? ` at ${e}` : ""}: ${n}`);
}
function ie(e, n) {
  e != null && typeof e != "string" && U(n, "expected a string or null");
}
function me(e, n) {
  e !== void 0 && (!Array.isArray(e) || e.some((l) => typeof l != "string")) && U(n, "expected an array of strings");
}
function ce(e, n, [l, o]) {
  e !== void 0 && ((typeof e != "number" || !Number.isFinite(e)) && U(n, "expected a finite number"), (e < l || e > o) && U(n, `expected a number in [${l}, ${o}], got ${e}`));
}
function Ye(e) {
  (e === null || typeof e != "object" || Array.isArray(e)) && U("", "expected an object");
  const n = te();
  for (const r of Object.keys(e))
    r in n || U("", `unknown property "${r}"`);
  e.version !== void 0 && (Number.isInteger(e.version) || U("version", "expected an integer"), e.version > Ae && U("version", `is ${e.version}, but this build understands up to ${Ae}`)), e.theme !== void 0 && !$e.includes(e.theme) && U("theme", `expected one of ${$e.join(", ")}`);
  for (const r of ["controls", "controlsCollapsed"])
    e[r] !== void 0 && typeof e[r] != "boolean" && U(r, "expected a boolean");
  ie(e.referenceGenome, "referenceGenome");
  for (const r of ["visibleGenomes", "hiddenGenomes"])
    e[r] !== void 0 && e[r] !== null && me(e[r], r);
  e.genomeOrder !== void 0 && e.genomeOrder !== null && me(e.genomeOrder, "genomeOrder");
  const l = e.data;
  if (l !== void 0) {
    (l === null || typeof l != "object") && U("data", "expected an object");
    for (const r of ["alignmentUrl", "geneAnnotationUrl", "genomeAnnotationUrl"])
      ie(l[r], `data.${r}`);
    for (const r of ["rows", "geneAnnotationRows", "genomeAnnotationRows"])
      l[r] !== void 0 && l[r] !== null && !Array.isArray(l[r]) && U(`data.${r}`, "expected an array of row objects");
  }
  const o = e.geneAnnotation;
  if (o !== void 0 && ((o === null || typeof o != "object") && U("geneAnnotation", "expected an object"), ie(o.categoryColumn, "geneAnnotation.categoryColumn"), ie(o.labelColumn, "geneAnnotation.labelColumn"), me(o.selectedCategories, "geneAnnotation.selectedCategories"), o.displayMode !== void 0 && !Ie.includes(o.displayMode) && U("geneAnnotation.displayMode", `expected one of ${Ie.join(", ")}`), o.customColors !== void 0 && o.customColors !== null)) {
    typeof o.customColors != "object" && U("geneAnnotation.customColors", "expected an object");
    for (const [r, i] of Object.entries(o.customColors))
      dn.test(i) || U(`geneAnnotation.customColors["${r}"]`, `expected a #rrggbb colour, got ${i}`);
  }
  const a = e.genomeAnnotation;
  if (a !== void 0) {
    (a === null || typeof a != "object") && U("genomeAnnotation", "expected an object");
    for (const r of ["colorColumn", "groupColumn", "labelColumn", "sortColumn"])
      ie(a[r], `genomeAnnotation.${r}`);
    me(a.tooltipColumns, "genomeAnnotation.tooltipColumns"), a.sortAscending !== void 0 && typeof a.sortAscending != "boolean" && U("genomeAnnotation.sortAscending", "expected a boolean"), a.palette !== void 0 && !pe.includes(a.palette) && U("genomeAnnotation.palette", `expected one of ${pe.join(", ")}`);
  }
  const t = e.zoom;
  return t !== void 0 && ((t === null || typeof t != "object") && U("zoom", "expected an object"), ce(t.focusAngle, "zoom.focusAngle", [0, 2 * Math.PI]), ce(t.zoomLevel, "zoom.zoomLevel", K.zoomLevel), ce(t.wedgeSpan, "zoom.wedgeSpan", K.wedgeSpan), ce(t.wedgeGap, "zoom.wedgeGap", K.wedgeGap), ce(t.wedgeHeightScale, "zoom.wedgeHeightScale", K.wedgeHeightScale)), e;
}
const Xe = "genomes.aln.csv.gz", xt = "genes.annot.csv.gz", Lt = "genomes.annot.csv.gz";
function Ke(e, n) {
  return !e || !e.includes(Xe) ? null : e.replace(Xe, n);
}
function Rt(e, n = {}) {
  if (!e || typeof e.querySelector != "function")
    throw new Error("mount(el, config): el must be an element");
  Ye(n);
  let l = { ...te(), ...n };
  const o = Cn(), { refs: a } = En(e, { controls: l.controls }), t = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set();
  let i = !1, u = !1;
  const g = (A) => {
    if (i) throw new Error(`DisplayHandle.${A}() called after destroy()`);
  }, c = Hn({ state: o, refs: a }), f = Wn({
    state: o,
    refs: a,
    onAnimate: () => {
      c.draw(), w && w.onAnimate();
    }
  }), x = Vn({
    state: o,
    refs: a,
    onSettled: () => $()
  });
  function $() {
    if (i) return;
    const A = Ze(o, { controls: l.controls, controlsCollapsed: u });
    for (const m of t) m(A);
  }
  function b() {
    if (i) return;
    a.root.setAttribute("data-theme", o.theme);
    const A = gt(o);
    c.draw(A), f.setRenderData(A), w && w.refresh(A);
  }
  function G(A) {
    Gt(o, A), b(), w && w.syncFromState();
  }
  function p(A) {
    a.loading && (a.loading.hidden = !A);
  }
  function M(A) {
    a.errorMessage && (a.errorMessage.textContent = A.message, a.errorMessage.hidden = !1);
    for (const m of r) m(A);
    if (!a.errorMessage && r.size === 0) throw A;
  }
  function T() {
    a.errorMessage && (a.errorMessage.textContent = "", a.errorMessage.hidden = !0);
  }
  async function P(A, { optional: m = !1, genome: h = !1 } = {}) {
    try {
      const L = St(await Ve(A), h ? Be : null);
      h ? He(o, L, A) : _e(o, L, A);
    } catch (L) {
      m || M(L);
    }
  }
  async function D(A) {
    const m = A.data || {};
    if (T(), Array.isArray(m.rows))
      je(o, m.rows, m.alignmentUrl || null);
    else if (m.alignmentUrl) {
      p(!0);
      try {
        je(o, yt(await Ve(m.alignmentUrl)), m.alignmentUrl);
      } catch (h) {
        p(!1), M(h);
        return;
      }
      p(!1);
    }
    if (Array.isArray(m.geneAnnotationRows))
      _e(o, Le(m.geneAnnotationRows), m.geneAnnotationUrl || null);
    else if (m.geneAnnotationUrl)
      await P(m.geneAnnotationUrl);
    else if (m.alignmentUrl) {
      const h = Ke(m.alignmentUrl, xt);
      h && await P(h, { optional: !0 });
    }
    if (Array.isArray(m.genomeAnnotationRows))
      He(
        o,
        Le(m.genomeAnnotationRows, null, Be),
        m.genomeAnnotationUrl || null
      );
    else if (m.genomeAnnotationUrl)
      await P(m.genomeAnnotationUrl, { genome: !0 });
    else if (m.alignmentUrl) {
      const h = Ke(m.alignmentUrl, Lt);
      h && await P(h, { optional: !0, genome: !0 });
    }
    i || (G(A), $());
  }
  function v(A) {
    const m = l.data || {}, h = A.data || {};
    return m.rows !== h.rows || m.geneAnnotationRows !== h.geneAnnotationRows || m.genomeAnnotationRows !== h.genomeAnnotationRows || m.alignmentUrl !== h.alignmentUrl || m.geneAnnotationUrl !== h.geneAnnotationUrl || m.genomeAnnotationUrl !== h.genomeAnnotationUrl;
  }
  const w = l.controls ? ft({
    state: o,
    refs: a,
    render: b,
    emitChange: $,
    getRenderData: () => c.getRenderData(),
    markWebGLDirty: () => f.markDirty(),
    exportPNG: () => Pe({ state: o, refs: a, webglCanvas: f.canvas }),
    exportSVG: () => R.toSVG(),
    setCollapsed: (A) => {
      u = A, $();
    }
  }) : null, R = {
    update(A = {}) {
      g("update"), Ye(A);
      const m = { ...te(), ...A };
      if (m.controls !== l.controls)
        throw new Error("update(): changing `controls` requires a remount — call destroy() and mount() again");
      const h = v(m);
      l = m, u = m.controlsCollapsed, w && w.setCollapsed(m.controlsCollapsed), h ? D(m) : G(m);
    },
    toSVG() {
      return g("toSVG"), vt({
        state: o,
        renderData: c.getRenderData(),
        width: a.canvas.width,
        height: a.canvas.height
      });
    },
    toPNG(A = 1) {
      return g("toPNG"), Pe({ state: o, refs: a, webglCanvas: f.canvas }, A);
    },
    destroy() {
      i || (i = !0, w && w.destroy(), x.destroy(), f.destroy(), c.destroy(), t.clear(), r.clear(), a.root.innerHTML = "", a.root.classList.remove("gmd-root", "gmd-no-controls"), a.root.removeAttribute("data-theme"));
    },
    /** Current config, including anything the user changed through the sidebar. */
    getConfig() {
      return g("getConfig"), Ze(o, { controls: l.controls, controlsCollapsed: u });
    },
    /** Subscribe to config changes. Returns an unsubscribe function. */
    onChange(A) {
      return g("onChange"), t.add(A), () => t.delete(A);
    },
    /**
     * Subscribe to data-loading failures. Returns an unsubscribe function.
     * Only relevant when the config references data by URL; a caller that supplies
     * rows has already done its own loading.
     */
    onError(A) {
      return g("onError"), r.add(A), () => r.delete(A);
    }
  };
  u = l.controlsCollapsed, w && w.setCollapsed(u);
  const z = l.data || {};
  return Array.isArray(z.rows) || z.alignmentUrl ? D(l) : G(l), R;
}
export {
  Ae as CONFIG_VERSION,
  pe as PALETTE_NAMES,
  Gt as applyConfigToState,
  Ze as configFromState,
  te as defaultConfig,
  Mt as liveContextCount,
  Rt as mount,
  Ye as validateConfig
};
//# sourceMappingURL=gig-map-display.js.map
