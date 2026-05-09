(function () {
  'use strict';

  // ── Shader sources ────────────────────────────────────────────────────────

  const VERT_SRC = `#version 300 es
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
const int   NUM_SEGS = 16;

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
`;

  const FRAG_SRC = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`;

  // ── State ─────────────────────────────────────────────────────────────────

  let gl = null;
  let program = null;
  let lastRenderData = null;
  let dirty = false;
  let lastTime = 0;

  // VAO / buffers for data arcs
  let dataVAO = null;
  let dataBuffer = null;
  let numDataInstances = 0;

  // VAO / buffer for background arc (rebuilt each frame)
  let bgVAO = null;
  let bgBuffer = null;

  // VAO / buffer for the zoom-region indicator on the main circle
  let indVAO = null;
  let indBuffer = null;

  // Track animated values to trigger canvas redraws when they change
  let lastDisplayScale = 1;
  let lastFocusAngle   = 0;
  let lastZoomLevel    = 1;

  // Attribute / uniform locations
  let locs = {};

  // ── Helpers ───────────────────────────────────────────────────────────────

  function parseColorToFloat(cssColor) {
    const d3c = d3.color(cssColor);
    if (!d3c) return [0.5, 0.5, 0.5, 1.0];
    const rgb = d3c.rgb();
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255, d3c.opacity];
  }

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(vertSrc, fragSrc) {
    const vert = compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  // Build a VAO wired to a given buffer (8 floats per instance).
  function createInstancedVAO(buffer) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const stride = 8 * 4; // 8 floats × 4 bytes

    // aGeoStart  – offset 0
    gl.enableVertexAttribArray(locs.aGeoStart);
    gl.vertexAttribPointer(locs.aGeoStart, 1, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(locs.aGeoStart, 1);

    // aGeoEnd    – offset 4
    gl.enableVertexAttribArray(locs.aGeoEnd);
    gl.vertexAttribPointer(locs.aGeoEnd, 1, gl.FLOAT, false, stride, 4);
    gl.vertexAttribDivisor(locs.aGeoEnd, 1);

    // aRingInner – offset 8
    gl.enableVertexAttribArray(locs.aRingInner);
    gl.vertexAttribPointer(locs.aRingInner, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(locs.aRingInner, 1);

    // aRingOuter – offset 12
    gl.enableVertexAttribArray(locs.aRingOuter);
    gl.vertexAttribPointer(locs.aRingOuter, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(locs.aRingOuter, 1);

    // aColor     – offset 16 (vec4)
    gl.enableVertexAttribArray(locs.aColor);
    gl.vertexAttribPointer(locs.aColor, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(locs.aColor, 1);

    gl.bindVertexArray(null);
    return vao;
  }

  // ── Ring geometry helper ──────────────────────────────────────────────────
  //
  // In this model the wedge outer edge is always fixed at R*0.97 (max viewport).
  // The wedge height slider controls displayRadiusScale (circle size), which
  // determines how much radial space is available for the rings.

  function computeRingGeometry(rd, cx, cy) {
    const R = Math.min(cx, cy);
    const scale = window.ZoomState ? window.ZoomState.displayRadiusScale : 1;
    const outerRadius = R * 0.92 * scale;
    const GAP = window.ZoomState ? window.ZoomState.wedgeGap : 6;
    const blowInner = outerRadius + GAP;
    const blowOuter = R * 0.97;
    const numGenomes = rd.visibleGenomes.length;
    const available = Math.max(0, blowOuter - blowInner);
    const ANN_W = rd.annotActive ? Math.min(12, available * 0.25) : 0;
    const GEN_W = numGenomes > 0 ? (available - ANN_W) / numGenomes : 0;
    return { outerRadius, blowInner, blowOuter, ANN_W, GEN_W, numGenomes };
  }

  // ── Data buffer builder ───────────────────────────────────────────────────

  function rebuildDataBuffer() {
    const rd = lastRenderData;
    if (!rd) return;

    const canvas = gl.canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const { blowInner, ANN_W, GEN_W } = computeRingGeometry(rd, cx, cy);

    const numGenomes  = rd.visibleGenomes  ? rd.visibleGenomes.length  : 0;
    const numRefGenes = rd.referenceGenes  ? rd.referenceGenes.size    : 0;

    // Pre-allocate a typed array sized to the worst case (all genomes × all genes
    // plus one annotation ring). Writing directly into a Float32Array avoids the
    // dynamic-resize overhead of a plain JS array and the extra copy that
    // `new Float32Array(jsArray)` would require at the end — both of which become
    // significant with 1 000+ genomes.
    const maxInstances = numGenomes * numRefGenes + numRefGenes;
    const buf = new Float32Array(maxInstances * 8);
    let ptr = 0;

    function push(geoStart, geoEnd, rInner, rOuter, color) {
      buf[ptr    ] = geoStart;
      buf[ptr + 1] = geoEnd;
      buf[ptr + 2] = rInner;
      buf[ptr + 3] = rOuter;
      buf[ptr + 4] = color[0];
      buf[ptr + 5] = color[1];
      buf[ptr + 6] = color[2];
      buf[ptr + 7] = color[3];
      ptr += 8;
    }

    // ── Genome rings — start immediately at blowInner (annotation is outermost) ─
    if (rd.visibleGenomes && rd.referenceGenes) {
      rd.visibleGenomes.forEach(function(genomeId, i) {
        const gInner = blowInner + i * GEN_W;
        const gOuter = gInner + GEN_W - 1;

        const genomeMap = rd.genomeGenes ? rd.genomeGenes.get(genomeId) : null;
        if (!genomeMap) return;

        const baseColor = rd.genomeColors
          ? rd.genomeColors.get(genomeId)
          : (rd.colorScale ? rd.colorScale(genomeId) : '#888888');
        const color = parseColorToFloat(baseColor || '#888888');

        rd.referenceGenes.forEach(function(refGene, geneId) {
          if (!genomeMap.has(geneId)) return;
          if (refGene.endAngle <= refGene.startAngle) return;
          push(refGene.startAngle, refGene.endAngle, gInner, gOuter, color);
        });
      });
    }

    // ── Annotation ring — always outermost (after all genome rings) ────────
    if (rd.annotActive && ANN_W > 0 && rd.referenceGenes && rd.geneAnnotColors) {
      const annInner = blowInner + numGenomes * GEN_W;
      const annOuter = annInner + ANN_W;
      rd.referenceGenes.forEach(function(gene, geneId) {
        if (gene.endAngle <= gene.startAngle) return;
        const cssColor = rd.geneAnnotColors.get(geneId);
        if (!cssColor) return;
        const color = parseColorToFloat(cssColor);
        push(gene.startAngle, gene.endAngle, annInner, annOuter, color);
      });
    }

    numDataInstances = ptr / 8;

    if (numDataInstances === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
    // Upload only the filled portion — buf may be larger than what was written.
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, ptr), gl.DYNAMIC_DRAW);
  }

  // ── Background buffer ─────────────────────────────────────────────────────

  function updateBgBuffer(focusAngle, dataHalfSpan, blowInner, blowOuter) {
    const geoStart = focusAngle - Math.PI;
    const geoEnd   = focusAngle + Math.PI;
    const data = new Float32Array([
      geoStart, geoEnd,
      blowInner - 2, blowOuter + 2,
      0.086, 0.129, 0.243, 0.92
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  function updateIndBuffer(geoStart, geoEnd, innerR, outerR) {
    const data = new Float32Array([geoStart, geoEnd, innerR, outerR, 1.0, 0.85, 0.1, 0.9]);
    gl.bindBuffer(gl.ARRAY_BUFFER, indBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  // ── Uniform helpers ───────────────────────────────────────────────────────

  function setUniforms(focusAngle, dataHalfSpan, wedgeHalfSpan, zoomLevel, cx, cy) {
    const canvas = gl.canvas;
    gl.uniform1f(locs.uFocusAngle,    focusAngle);
    gl.uniform1f(locs.uDataHalfSpan,  dataHalfSpan);
    gl.uniform1f(locs.uZoomLevel,     zoomLevel);
    gl.uniform1f(locs.uWedgeHalfSpan, wedgeHalfSpan);
    gl.uniform2f(locs.uCenter,        cx, cy);
    gl.uniform2f(locs.uResolution,    canvas.width, canvas.height);
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  function renderFrame(time) {
    const dt = lastTime ? time - lastTime : 0;
    lastTime = time;

    window.ZoomState.tick(dt);

    const zs = window.ZoomState;

    // Compute target radius scale so the wedge fits within the canvas.
    const canvas = gl.canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    {
      // The wedge outer edge is fixed at R*0.97. The circle shrinks to make room.
      // wedgeHeightScale controls the fraction of R*0.97 allocated to the wedge rings;
      // larger scale → bigger wedge → smaller circle.
      const R = Math.min(cx, cy);
      const maxR = R * 0.97;
      if (zs.zoomLevel > 1.05) {
        const wedgeFraction = Math.min(0.80, 0.15 * zs.wedgeHeightScale);
        const targetOuterRadius = maxR * (1 - wedgeFraction);
        const targetScale = Math.max(0.1, Math.min(1.0, targetOuterRadius / (R * 0.92)));
        zs.setTargetRadiusScale(targetScale);
      } else {
        zs.setTargetRadiusScale(1.0);
      }
    }

    // Trigger a Canvas 2D redraw and WebGL buffer rebuild whenever animated values change.
    // Ring pixel positions depend on displayRadiusScale, so dirty must be set on scale change.
    const focusAngleDelta = Math.abs(zs.focusAngle - lastFocusAngle);
    const scaleDelta      = Math.abs(zs.displayRadiusScale - lastDisplayScale);
    const zoomDelta       = Math.abs(zs.zoomLevel - lastZoomLevel);
    if (scaleDelta > 0.002 || focusAngleDelta > 0.001 || zoomDelta > 0.01) {
      lastDisplayScale = zs.displayRadiusScale;
      lastFocusAngle   = zs.focusAngle;
      lastZoomLevel    = zs.zoomLevel;
      if (scaleDelta > 0.002 && lastRenderData) dirty = true;
      if (typeof window.drawVisualization === 'function' && window.getLastRenderData) {
        const rd = window.getLastRenderData();
        if (rd) window.drawVisualization(rd);
      }
      if (typeof window.updateZoomInfo === 'function') window.updateZoomInfo();
    }

    const shouldShow = zs.zoomLevel > 1.05;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!lastRenderData || !shouldShow) {
      requestAnimationFrame(renderFrame);
      return;
    }

    if (dirty) {
      rebuildDataBuffer();
      dirty = false;
    }

    const { blowInner, blowOuter, outerRadius } = computeRingGeometry(lastRenderData, cx, cy);

    const wedgeHalfSpan = zs.wedgeSpan * Math.PI;
    const dataHalfSpan  = wedgeHalfSpan / zs.zoomLevel;

    gl.useProgram(program);
    setUniforms(zs.focusAngle, dataHalfSpan, wedgeHalfSpan, zs.zoomLevel, cx, cy);

    // Draw data arcs
    if (numDataInstances > 0) {
      gl.bindVertexArray(dataVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 16 * 6, numDataInstances);
    }

    // Draw indicator arc on the main circle showing the zoomed region.
    // Uses identity uniforms so arcs render at their natural genome angle.
    updateIndBuffer(zs.focusAngle - dataHalfSpan, zs.focusAngle + dataHalfSpan,
                    outerRadius + 2, outerRadius + 6);
    gl.uniform1f(locs.uZoomLevel,     1.0);
    gl.uniform1f(locs.uDataHalfSpan,  Math.PI);
    gl.uniform1f(locs.uWedgeHalfSpan, Math.PI);
    gl.bindVertexArray(indVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 16 * 6, 1);

    gl.bindVertexArray(null);

    requestAnimationFrame(renderFrame);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.initWebGLRenderer = function () {
    const container = document.getElementById('viz-container');
    if (!container) {
      console.error('webgl-renderer: #viz-container not found');
      return;
    }

    const mainCanvas = document.getElementById('main-canvas');

    const canvas = document.createElement('canvas');
    canvas.id = 'webgl-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '2';
    canvas.style.pointerEvents = 'none';

    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width  = w;
    canvas.height = h;

    container.appendChild(canvas);

    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) {
      console.error('webgl-renderer: WebGL2 not available');
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Compile shaders / link program
    program = createProgram(VERT_SRC, FRAG_SRC);
    if (!program) return;

    // Cache attribute & uniform locations
    locs = {
      aGeoStart:    gl.getAttribLocation(program,  'aGeoStart'),
      aGeoEnd:      gl.getAttribLocation(program,  'aGeoEnd'),
      aRingInner:   gl.getAttribLocation(program,  'aRingInner'),
      aRingOuter:   gl.getAttribLocation(program,  'aRingOuter'),
      aColor:       gl.getAttribLocation(program,  'aColor'),
      uFocusAngle:  gl.getUniformLocation(program, 'uFocusAngle'),
      uDataHalfSpan:gl.getUniformLocation(program, 'uDataHalfSpan'),
      uZoomLevel:   gl.getUniformLocation(program, 'uZoomLevel'),
      uWedgeHalfSpan:gl.getUniformLocation(program,'uWedgeHalfSpan'),
      uCenter:      gl.getUniformLocation(program, 'uCenter'),
      uResolution:  gl.getUniformLocation(program, 'uResolution'),
    };

    // Create GPU buffers
    dataBuffer = gl.createBuffer();
    bgBuffer   = gl.createBuffer();

    // Allocate a placeholder for the bg buffer (1 instance = 8 floats)
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 8 * 4, gl.DYNAMIC_DRAW);

    // Allocate indicator buffer (1 instance)
    indBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, indBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 8 * 4, gl.DYNAMIC_DRAW);

    // Build VAOs
    bgVAO   = createInstancedVAO(bgBuffer);
    dataVAO = createInstancedVAO(dataBuffer);
    indVAO  = createInstancedVAO(indBuffer);

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      canvas.width  = nw;
      canvas.height = nh;
      gl.viewport(0, 0, nw, nh);
    });
    ro.observe(container);

    // Kick off the render loop
    requestAnimationFrame(renderFrame);
  };

  window.updateWebGLRenderData = function (renderData) {
    lastRenderData = renderData;
    dirty = true;
  };

  window.markWebGLDirty = function () {
    dirty = true;
  };

}());
