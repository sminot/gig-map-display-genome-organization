/**
 * WebGL2 renderer for the magnified zoom wedge.
 *
 * Each mounted display owns one WebGL context. Chrome allows roughly 16 live
 * contexts per page and silently drops the oldest beyond that, at which point a
 * display goes blank with no error — so `destroy()` must release the context, not
 * merely drop the JS references. It deletes every GPU object, disconnects the
 * observer, cancels the animation frame, and forces context loss through
 * WEBGL_lose_context. `liveContextCount()` reports how many are outstanding.
 */

import { color as d3color } from 'd3';
import { wedgeGeometry, targetRadiusScale } from './geometry.js';

const FLOATS_PER_INSTANCE = 8;
const NUM_SEGS = 16;
const VERTS_PER_INSTANCE = NUM_SEGS * 6;

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
const int   NUM_SEGS = ${NUM_SEGS};

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

const INDICATOR_RGBA = [1.0, 0.85, 0.1, 0.9];

let liveContexts = 0;

/** Number of WebGL contexts this module currently holds open. */
export function liveContextCount() {
  return liveContexts;
}

function cssColorToFloats(cssColor) {
  const parsed = d3color(cssColor);
  if (!parsed) return [0.5, 0.5, 0.5, 1];
  const rgb = parsed.rgb();
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255, parsed.opacity];
}

/**
 * @param {object} options
 * @param {object} options.state         instance state
 * @param {object} options.refs          instance DOM refs
 * @param {Function} options.onAnimate    called when an animated value moved enough
 *                                        to require a Canvas 2D redraw
 */
export function createWebGLRenderer({ state, refs, onAnimate }) {
  const container = refs.vizContainer;

  const canvas = document.createElement('canvas');
  canvas.className = 'gmd-webgl';
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  container.appendChild(canvas);

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    canvas.remove();
    return {
      available: false,
      setRenderData() {},
      markDirty() {},
      destroy() {},
    };
  }
  liveContexts += 1;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function compileShader(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compile failed: ${log}`);
    }
    return shader;
  }

  const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`WebGL program link failed: ${log}`);
  }
  // Shaders are only needed until link; deleting them now keeps destroy() simple.
  gl.detachShader(program, vert);
  gl.detachShader(program, frag);
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  const locs = {
    aGeoStart: gl.getAttribLocation(program, 'aGeoStart'),
    aGeoEnd: gl.getAttribLocation(program, 'aGeoEnd'),
    aRingInner: gl.getAttribLocation(program, 'aRingInner'),
    aRingOuter: gl.getAttribLocation(program, 'aRingOuter'),
    aColor: gl.getAttribLocation(program, 'aColor'),
    uFocusAngle: gl.getUniformLocation(program, 'uFocusAngle'),
    uDataHalfSpan: gl.getUniformLocation(program, 'uDataHalfSpan'),
    uZoomLevel: gl.getUniformLocation(program, 'uZoomLevel'),
    uWedgeHalfSpan: gl.getUniformLocation(program, 'uWedgeHalfSpan'),
    uCenter: gl.getUniformLocation(program, 'uCenter'),
    uResolution: gl.getUniformLocation(program, 'uResolution'),
  };

  function createInstancedVAO(buffer) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const stride = FLOATS_PER_INSTANCE * 4;
    const attribs = [
      [locs.aGeoStart, 1, 0],
      [locs.aGeoEnd, 1, 4],
      [locs.aRingInner, 1, 8],
      [locs.aRingOuter, 1, 12],
      [locs.aColor, 4, 16],
    ];
    for (const [location, size, offset] of attribs) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, 1);
    }

    gl.bindVertexArray(null);
    return vao;
  }

  const dataBuffer = gl.createBuffer();
  const indicatorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, indicatorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);

  const dataVAO = createInstancedVAO(dataBuffer);
  const indicatorVAO = createInstancedVAO(indicatorBuffer);

  let renderData = null;
  let dirty = false;
  let numInstances = 0;
  let lastTime = 0;
  let rafId = 0;
  let destroyed = false;

  let lastDisplayScale = 1;
  let lastFocusAngle = 0;
  let lastZoomLevel = 1;

  function rebuildDataBuffer() {
    if (!renderData) return;

    const wedge = wedgeGeometry(state, canvas.width, canvas.height, renderData);
    const numRefGenes = renderData.referenceGenes.size;

    // Sized to the worst case up front: writing straight into a Float32Array
    // avoids both the dynamic-resize cost and a final copy, which matter at
    // 1 000+ genomes.
    const maxInstances = wedge.numGenomes * numRefGenes + numRefGenes;
    const buf = new Float32Array(maxInstances * FLOATS_PER_INSTANCE);
    let ptr = 0;

    const push = (geoStart, geoEnd, rInner, rOuter, rgba) => {
      buf[ptr] = geoStart;
      buf[ptr + 1] = geoEnd;
      buf[ptr + 2] = rInner;
      buf[ptr + 3] = rOuter;
      buf[ptr + 4] = rgba[0];
      buf[ptr + 5] = rgba[1];
      buf[ptr + 6] = rgba[2];
      buf[ptr + 7] = rgba[3];
      ptr += FLOATS_PER_INSTANCE;
    };

    renderData.visibleGenomes.forEach((genomeId, i) => {
      const geneMap = renderData.genomeGenes.get(genomeId);
      if (!geneMap) return;

      const inner = wedge.blowInner + i * wedge.genomeWidth;
      const outer = inner + wedge.genomeWidth - 1;
      const rgba = cssColorToFloats(renderData.genomeColors.get(genomeId) || '#888888');

      renderData.referenceGenes.forEach((gene, geneId) => {
        if (!geneMap.has(geneId)) return;
        if (gene.endAngle <= gene.startAngle) return;
        push(gene.startAngle, gene.endAngle, inner, outer, rgba);
      });
    });

    if (renderData.annotActive && wedge.annotWidth > 0) {
      const inner = wedge.blowInner + wedge.numGenomes * wedge.genomeWidth;
      const outer = inner + wedge.annotWidth;
      renderData.referenceGenes.forEach((gene, geneId) => {
        if (gene.endAngle <= gene.startAngle) return;
        const cssColor = renderData.geneAnnotColors.get(geneId);
        if (!cssColor) return;
        push(gene.startAngle, gene.endAngle, inner, outer, cssColorToFloats(cssColor));
      });
    }

    numInstances = ptr / FLOATS_PER_INSTANCE;
    if (numInstances === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, ptr), gl.DYNAMIC_DRAW);
  }

  function renderFrame(time) {
    if (destroyed) return;
    rafId = requestAnimationFrame(renderFrame);

    const dt = lastTime ? time - lastTime : 0;
    lastTime = time;

    const zoom = state.zoom;
    zoom.tick(dt);
    zoom.setTargetRadiusScale(targetRadiusScale(state, canvas.width, canvas.height));

    // Ring pixel radii depend on displayRadiusScale, so a scale change invalidates
    // the GPU buffer as well as the Canvas 2D layer.
    const scaleDelta = Math.abs(zoom.displayRadiusScale - lastDisplayScale);
    const focusDelta = Math.abs(zoom.focusAngle - lastFocusAngle);
    const zoomDelta = Math.abs(zoom.zoomLevel - lastZoomLevel);
    if (scaleDelta > 0.002 || focusDelta > 0.001 || zoomDelta > 0.01) {
      lastDisplayScale = zoom.displayRadiusScale;
      lastFocusAngle = zoom.focusAngle;
      lastZoomLevel = zoom.zoomLevel;
      if (scaleDelta > 0.002 && renderData) dirty = true;
      if (onAnimate) onAnimate();
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!renderData || zoom.zoomLevel <= 1.05) return;

    if (dirty) {
      rebuildDataBuffer();
      dirty = false;
    }

    const wedge = wedgeGeometry(state, canvas.width, canvas.height, renderData);
    const wedgeHalfSpan = zoom.wedgeSpan * Math.PI;
    const dataHalfSpan = wedgeHalfSpan / zoom.zoomLevel;

    gl.useProgram(program);
    gl.uniform1f(locs.uFocusAngle, zoom.focusAngle);
    gl.uniform1f(locs.uDataHalfSpan, dataHalfSpan);
    gl.uniform1f(locs.uZoomLevel, zoom.zoomLevel);
    gl.uniform1f(locs.uWedgeHalfSpan, wedgeHalfSpan);
    gl.uniform2f(locs.uCenter, wedge.cx, wedge.cy);
    gl.uniform2f(locs.uResolution, canvas.width, canvas.height);

    if (numInstances > 0) {
      gl.bindVertexArray(dataVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_INSTANCE, numInstances);
    }

    // The indicator arc marks the zoomed span on the main circle, so it is drawn
    // with identity magnification uniforms.
    gl.bindBuffer(gl.ARRAY_BUFFER, indicatorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      zoom.focusAngle - dataHalfSpan, zoom.focusAngle + dataHalfSpan,
      wedge.outerRadius + 2, wedge.outerRadius + 6,
      ...INDICATOR_RGBA,
    ]), gl.DYNAMIC_DRAW);
    gl.uniform1f(locs.uZoomLevel, 1);
    gl.uniform1f(locs.uDataHalfSpan, Math.PI);
    gl.uniform1f(locs.uWedgeHalfSpan, Math.PI);
    gl.bindVertexArray(indicatorVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_INSTANCE, 1);

    gl.bindVertexArray(null);
  }

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    dirty = true;
  });
  resizeObserver.observe(container);

  rafId = requestAnimationFrame(renderFrame);

  return {
    available: true,
    canvas,

    setRenderData(next) {
      renderData = next;
      dirty = true;
    },

    markDirty() {
      dirty = true;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();

      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);
      gl.deleteVertexArray(dataVAO);
      gl.deleteVertexArray(indicatorVAO);
      gl.deleteBuffer(dataBuffer);
      gl.deleteBuffer(indicatorBuffer);
      gl.deleteProgram(program);

      // Deleting GPU objects does not free the context; only this does. Without
      // it the page accumulates contexts until the browser drops the oldest.
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();

      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();

      renderData = null;
      liveContexts -= 1;
    },
  };
}
