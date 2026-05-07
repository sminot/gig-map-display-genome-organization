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

  // Track displayRadiusScale changes to trigger canvas redraws
  let lastDisplayScale = 1;

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

  function computeRingGeometry(rd, cx, cy) {
    const scale = window.ZoomState ? window.ZoomState.displayRadiusScale : 1;
    const outerRadius = Math.min(cx, cy) * 0.92 * scale;
    const GAP = 18;
    const blowInner = outerRadius + GAP;
    const ANN_W = rd.annotActive ? 12 : 0;
    const numGenomes = rd.visibleGenomes.length;
    const GEN_W = Math.min(18, Math.max(5,
      (outerRadius * 0.35 - ANN_W) / Math.max(1, numGenomes)));
    const blowOuter = blowInner + ANN_W + numGenomes * GEN_W + 6;
    return { outerRadius, blowInner, blowOuter, ANN_W, GEN_W };
  }

  // ── Data buffer builder ───────────────────────────────────────────────────

  function rebuildDataBuffer() {
    const rd = lastRenderData;
    if (!rd) return;

    const canvas = gl.canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const { blowInner, ANN_W, GEN_W } = computeRingGeometry(rd, cx, cy);

    const instances = [];

    function push(geoStart, geoEnd, rInner, rOuter, color) {
      const [r, g, b, a] = color;
      instances.push(geoStart, geoEnd, rInner, rOuter, r, g, b, a);
    }

    // ── Annotation ring — only genes that have an annotation color ────────
    if (rd.annotActive && ANN_W > 0 && rd.referenceGenes && rd.geneAnnotColors) {
      const annInner = blowInner;
      const annOuter = annInner + ANN_W;

      rd.referenceGenes.forEach((gene, geneId) => {
        if (gene.endAngle <= gene.startAngle) return;
        const cssColor = rd.geneAnnotColors.get(geneId);
        if (!cssColor) return;
        const color = parseColorToFloat(cssColor);
        if (rd.annotIsContinuous) {
          const frac = rd.geneAnnotBarFractions ? (rd.geneAnnotBarFractions.get(geneId) || 0) : 0;
          if (frac > 0) push(gene.startAngle, gene.endAngle, annInner, annInner + frac * ANN_W, color);
        } else {
          push(gene.startAngle, gene.endAngle, annInner, annOuter, color);
        }
      });
    }

    // ── Genome rings ──────────────────────────────────────────────────────
    if (rd.visibleGenomes && rd.referenceGenes) {
      rd.visibleGenomes.forEach((genomeId, i) => {
        const gInner = blowInner + ANN_W + i * GEN_W;
        const gOuter = gInner + GEN_W - 2;

        const genomeMap = rd.genomeGenes ? rd.genomeGenes.get(genomeId) : null;
        if (!genomeMap) return;

        const baseColor = rd.genomeColors
          ? rd.genomeColors.get(genomeId)
          : (rd.colorScale ? rd.colorScale(genomeId) : '#888888');
        const color = parseColorToFloat(baseColor || '#888888');

        rd.referenceGenes.forEach((refGene, geneId) => {
          if (!genomeMap.has(geneId)) return;
          if (refGene.endAngle <= refGene.startAngle) return;
          push(refGene.startAngle, refGene.endAngle, gInner, gOuter, color);
        });
      });
    }

    numDataInstances = instances.length / 8;

    if (numDataInstances === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instances), gl.DYNAMIC_DRAW);
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

    if (lastRenderData) {
      const R0 = Math.min(cx, cy) * 0.92;
      const ANN_W0 = lastRenderData.annotActive ? 12 : 0;
      const numG0 = lastRenderData.visibleGenomes.length;
      const GEN_W0 = Math.min(18, Math.max(5, (R0 * 0.35 - ANN_W0) / Math.max(1, numG0)));
      const wedgeExtra = 18 + ANN_W0 + numG0 * GEN_W0 + 6;
      const targetScale = zs.zoomLevel > 1.05
        ? Math.min(1.0, (Math.min(cx, cy) * 0.97 - wedgeExtra) / R0)
        : 1.0;
      zs.setTargetRadiusScale(targetScale);
    }

    // Trigger a Canvas 2D redraw whenever the scale has meaningfully changed.
    if (Math.abs(zs.displayRadiusScale - lastDisplayScale) > 0.002) {
      lastDisplayScale = zs.displayRadiusScale;
      if (typeof window.drawVisualization === 'function' && window.getLastRenderData) {
        const rd = window.getLastRenderData();
        if (rd) window.drawVisualization(rd);
      }
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

    // Draw background
    updateBgBuffer(zs.focusAngle, dataHalfSpan, blowInner, blowOuter);
    gl.bindVertexArray(bgVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 16 * 6, 1);

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

    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
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

}());
