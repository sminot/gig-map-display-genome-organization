import { useEffect, useRef, useState } from 'react';
import type { RendererProps } from '../../figures/types';
import * as api from '../../api/client';
import type { GenomeOrganizationMeta, GenomeRow } from '../../api/client';
import { useRegisterExport } from '../../session/exports';
import {
  arrowToAlignmentRows,
  baseGenomeRingBounds,
  buildArcInstances,
  buildRenderData,
  buildRequestBody,
  computeBaseLayout,
  computeWedgeLayout,
  ordinalColor,
  wedgeGenomeRingBounds,
  wedgeOuterTrackBounds,
  type BaseLayout,
  type RenderData,
  type ReferenceGene,
  type Rgba,
  type WedgeLayout,
} from './renderData';

// WebGL2 circular genome-organization renderer, ported from the legacy
// webgl-renderer.js + genome-viz.js + zoom-*.js. The base circle (reference
// contig ring + one ring per genome) is always drawn; scrolling zooms an
// angular wedge outward for detail. Hover shows a per-gene tooltip.

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
  gl_Position = vec4(x / uResolution.x * 2.0 - 1.0, 1.0 - y / uResolution.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}
`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`;

const VERTS_PER_ARC = 16 * 6;
const PI = Math.PI;
const TWO_PI = 2 * Math.PI;

interface Locs {
  aGeoStart: number;
  aGeoEnd: number;
  aRingInner: number;
  aRingOuter: number;
  aColor: number;
  uFocusAngle: WebGLUniformLocation | null;
  uDataHalfSpan: WebGLUniformLocation | null;
  uZoomLevel: WebGLUniformLocation | null;
  uWedgeHalfSpan: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
}

interface Zoom {
  focusAngle: number;
  zoomLevel: number;
  displayRadiusScale: number;
  wedgeSpan: number;
  wedgeGap: number;
  // Outer wedge arc's share of the plot radius; the inner base circle gets the
  // rest, so this sets the inner:outer radial size ratio.
  wedgeFraction: number;
  isHovering: boolean;
  targetFocus: number;
  targetZoom: number;
  targetScale: number;
}

function createZoom(): Zoom {
  return {
    focusAngle: 0,
    zoomLevel: 1,
    displayRadiusScale: 1,
    wedgeSpan: 1 / 3,
    wedgeGap: 6,
    wedgeFraction: 0.3,
    isHovering: false,
    targetFocus: 0,
    targetZoom: 1,
    targetScale: 1,
  };
}

function tickZoom(z: Zoom, dt: number) {
  const zoomAlpha = 1 - Math.exp(-dt / 120);
  const focusAlpha = 1 - Math.exp(-dt / 200);
  const scaleAlpha = 1 - Math.exp(-dt / 150);
  z.zoomLevel += (z.targetZoom - z.zoomLevel) * zoomAlpha;
  z.displayRadiusScale += (z.targetScale - z.displayRadiusScale) * scaleAlpha;
  let diff = z.targetFocus - z.focusAngle;
  if (diff > PI) diff -= TWO_PI;
  if (diff < -PI) diff += TWO_PI;
  z.focusAngle = (z.focusAngle + diff * focusAlpha + TWO_PI) % TWO_PI;
}

interface Scene {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  locs: Locs;
  baseBuffer: WebGLBuffer;
  wedgeBuffer: WebGLBuffer;
  indBuffer: WebGLBuffer;
  baseVAO: WebGLVertexArrayObject;
  wedgeVAO: WebGLVertexArrayObject;
  indVAO: WebGLVertexArrayObject;
  baseCount: number;
  wedgeCount: number;
  zoom: Zoom;
  rd: RenderData | null;
  selectedBin: string | null;
  dirty: boolean;
  lastScale: number;
  lastW: number;
  lastH: number;
  lastGeom: { base: BaseLayout; wedge: WedgeLayout } | null;
  raf: number;
  lastTime: number;
}

interface TooltipState {
  x: number;
  y: number;
  gene: string;
  genome: string;
  genomeLabel: string | null;
  position: string;
  pident: string;
  coverage: string;
  bin: string;
  overlayStat: string | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader compile error: ${log}`);
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function makeVAO(gl: WebGL2RenderingContext, buffer: WebGLBuffer, locs: Locs): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = 8 * 4;
  const attr = (loc: number, size: number, offset: number) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  };
  attr(locs.aGeoStart, 1, 0);
  attr(locs.aGeoEnd, 1, 4);
  attr(locs.aRingInner, 1, 8);
  attr(locs.aRingOuter, 1, 12);
  attr(locs.aColor, 4, 16);
  gl.bindVertexArray(null);
  return vao;
}

// Cursor angle in the plot's convention (0 = top, clockwise).
function pointerTheta(mx: number, my: number): number {
  let theta = Math.atan2(my, mx) + PI / 2;
  if (theta < 0) theta += TWO_PI;
  if (theta >= TWO_PI) theta -= TWO_PI;
  return theta;
}

function bandDist(r: number, lo: number, hi: number): number {
  return r < lo ? lo - r : r > hi ? r - hi : 0;
}

// Nearest reference gene to `searchAngle`, within ~3°. Handles the 0/2π seam.
function nearestGene(rd: RenderData, searchAngle: number): ReferenceGene | null {
  const SNAP = 0.05;
  let best = SNAP;
  let hit: ReferenceGene | null = null;
  for (const gene of rd.referenceGenes.values()) {
    if (gene.endAngle <= gene.startAngle) continue;
    const sa = gene.startAngle < 0 ? gene.startAngle + TWO_PI : gene.startAngle;
    const ea = gene.endAngle < 0 ? gene.endAngle + TWO_PI : gene.endAngle;
    const inside = sa <= ea ? searchAngle >= sa && searchAngle <= ea : searchAngle >= sa || searchAngle <= ea;
    let d: number;
    if (inside) {
      d = 0;
    } else {
      const dSa = Math.min(Math.abs(searchAngle - sa), TWO_PI - Math.abs(searchAngle - sa));
      const dEa = Math.min(Math.abs(searchAngle - ea), TWO_PI - Math.abs(searchAngle - ea));
      d = Math.min(dSa, dEa);
    }
    if (d < best) {
      best = d;
      hit = gene;
    }
  }
  return hit;
}

export function GenomeOrganizationRenderer({ params, result, selectedBin, onSelectBin }: RendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const genomeMetaRef = useRef<Map<string, GenomeRow>>(new Map());
  // The GL/interaction effect runs once; mirror the latest click callback into a
  // ref so its click handler always calls the current onSelectBin.
  const onSelectBinRef = useRef(onSelectBin);
  onSelectBinRef.current = onSelectBin;
  const [status, setStatus] = useState<string | null>('Loading…');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [highlightLegend, setHighlightLegend] = useState<{ bin: string; color: string }[]>([]);

  // GL setup + render loop + interaction — created once for the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      setStatus('WebGL2 is not available in this browser.');
      return;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const program = createProgram(gl);
    const locs: Locs = {
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

    const baseBuffer = gl.createBuffer()!;
    const wedgeBuffer = gl.createBuffer()!;
    const indBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, indBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 8 * 4, gl.DYNAMIC_DRAW);

    const scene: Scene = {
      gl,
      program,
      locs,
      baseBuffer,
      wedgeBuffer,
      indBuffer,
      baseVAO: makeVAO(gl, baseBuffer, locs),
      wedgeVAO: makeVAO(gl, wedgeBuffer, locs),
      indVAO: makeVAO(gl, indBuffer, locs),
      baseCount: 0,
      wedgeCount: 0,
      zoom: createZoom(),
      rd: null,
      selectedBin: null,
      dirty: false,
      lastScale: -1,
      lastW: 0,
      lastH: 0,
      lastGeom: null,
      raf: 0,
      lastTime: 0,
    };
    sceneRef.current = scene;

    const sizeCanvas = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(container);

    const setUniforms = (
      focus: number,
      dataHalfSpan: number,
      wedgeHalfSpan: number,
      zoomLevel: number,
      cx: number,
      cy: number,
    ) => {
      gl.uniform1f(locs.uFocusAngle, focus);
      gl.uniform1f(locs.uDataHalfSpan, dataHalfSpan);
      gl.uniform1f(locs.uZoomLevel, zoomLevel);
      gl.uniform1f(locs.uWedgeHalfSpan, wedgeHalfSpan);
      gl.uniform2f(locs.uCenter, cx, cy);
      gl.uniform2f(locs.uResolution, canvas.width, canvas.height);
    };

    const frame = (time: number) => {
      const s = sceneRef.current;
      if (!s) return;
      const dt = s.lastTime ? time - s.lastTime : 0;
      s.lastTime = time;
      const z = s.zoom;
      tickZoom(z, dt);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(cx, cy);

      if (z.zoomLevel > 1.05) {
        const wedgeFraction = Math.min(0.8, z.wedgeFraction);
        const targetOuter = R * 0.97 * (1 - wedgeFraction);
        z.targetScale = Math.max(0.1, Math.min(1.0, targetOuter / (R * 0.92)));
      } else {
        z.targetScale = 1.0;
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (!s.rd) {
        s.raf = requestAnimationFrame(frame);
        return;
      }

      const hasOuterTrack = !!s.rd.overlayByBin && s.rd.overlayChannel === 'outerTrack';
      const hasHighlightTrack = s.rd.highlightBins.length > 0;
      const nGenomes = s.rd.visibleGenomes.length;
      const base = computeBaseLayout(w, h, nGenomes, {
        scale: z.displayRadiusScale,
        hasOuterTrack,
        hasHighlightTrack,
      });
      const wedge = computeWedgeLayout(w, h, nGenomes, {
        scale: z.displayRadiusScale,
        wedgeGap: z.wedgeGap,
        hasOuterTrack,
      });
      s.lastGeom = { base, wedge };

      const scaleChanged = Math.abs(z.displayRadiusScale - s.lastScale) > 0.002;
      const sizeChanged = w !== s.lastW || h !== s.lastH;
      if (s.dirty || scaleChanged || sizeChanged) {
        const baseData = buildArcInstances(s.rd, base, wedge, 'base', s.selectedBin);
        const wedgeData = buildArcInstances(s.rd, base, wedge, 'wedge', s.selectedBin);
        s.baseCount = baseData.length / 8;
        s.wedgeCount = wedgeData.length / 8;
        gl.bindBuffer(gl.ARRAY_BUFFER, s.baseBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, baseData, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, s.wedgeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, wedgeData, gl.DYNAMIC_DRAW);
        s.dirty = false;
        s.lastScale = z.displayRadiusScale;
        s.lastW = w;
        s.lastH = h;
      }

      gl.useProgram(program);

      // Base pass — identity transform draws the full circle.
      setUniforms(z.focusAngle, PI, PI, 1, cx, cy);
      if (s.baseCount > 0) {
        gl.bindVertexArray(s.baseVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_ARC, s.baseCount);
      }

      // Wedge pass — angular magnification about the focus angle.
      if (z.zoomLevel > 1.05) {
        const wedgeHalfSpan = z.wedgeSpan * PI;
        const dataHalfSpan = wedgeHalfSpan / z.zoomLevel;
        setUniforms(z.focusAngle, dataHalfSpan, wedgeHalfSpan, z.zoomLevel, cx, cy);
        if (s.wedgeCount > 0) {
          gl.bindVertexArray(s.wedgeVAO);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_ARC, s.wedgeCount);
        }
        // Indicator arc on the base reference ring marking the zoomed slice.
        const indInner = base.referenceRingOuter + 2;
        const indOuter = base.referenceRingOuter + 6;
        const ind = new Float32Array([
          z.focusAngle - dataHalfSpan, z.focusAngle + dataHalfSpan, indInner, indOuter,
          1.0, 0.85, 0.1, 0.9,
        ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, s.indBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ind, gl.DYNAMIC_DRAW);
        setUniforms(z.focusAngle, PI, PI, 1, cx, cy);
        gl.bindVertexArray(s.indVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_ARC, 1);
      }

      gl.bindVertexArray(null);
      s.raf = requestAnimationFrame(frame);
    };
    scene.raf = requestAnimationFrame(frame);

    // ── Interaction ──────────────────────────────────────────────────────────
    const ZOOM_FACTOR = 1.15;
    const CLICK_SLOP = 4; // px of pointer travel below which a press counts as a click
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let moved = false;
    const relTheta = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return pointerTheta(e.clientX - rect.left - canvas.width / 2, e.clientY - rect.top - canvas.height / 2);
    };
    const setFocus = (angle: number) => {
      scene.zoom.targetFocus = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    };

    const onDown = (e: MouseEvent) => {
      dragging = true;
      moved = false;
      downX = e.clientX;
      downY = e.clientY;
      scene.zoom.isHovering = true;
      setFocus(relTheta(e));
    };
    // A press that didn't turn into a drag selects the bin under the cursor.
    const onUp = (e: MouseEvent) => {
      if (dragging && !moved) {
        const pick = pickGene(e);
        if (pick) onSelectBinRef.current?.(pick.gene.bin);
      }
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!scene.zoom.isHovering) return;
      if (scene.zoom.targetZoom <= 1.01 && e.deltaY < 0) setFocus(relTheta(e));
      const cur = scene.zoom.zoomLevel;
      scene.zoom.targetZoom = Math.max(1, Math.min(50, e.deltaY < 0 ? cur * ZOOM_FACTOR : cur / ZOOM_FACTOR));
    };
    const onEnter = () => {
      scene.zoom.isHovering = true;
    };
    const onLeave = () => {
      dragging = false;
      scene.zoom.isHovering = false;
      setTooltip(null);
    };
    const onMove = (e: MouseEvent) => {
      scene.zoom.isHovering = true;
      if (dragging) {
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP) moved = true;
        setFocus(relTheta(e));
      }
      updateTooltip(e);
    };

    // Map a pointer event to the reference gene (and hit genome, if any) under
    // the cursor, reusing the same ring hit-testing the tooltip relies on. Shared
    // by the tooltip and click-to-select so both stay in sync.
    const pickGene = (e: MouseEvent): { gene: ReferenceGene; hitGenome: string | null } | null => {
      const s = sceneRef.current;
      if (!s || !s.rd || !s.lastGeom) return null;
      const { base, wedge } = s.lastGeom;
      const z = s.zoom;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - base.cx;
      const my = e.clientY - rect.top - base.cy;
      const r = Math.hypot(mx, my);
      const theta = pointerTheta(mx, my);
      const SNAP = 12;

      let hitGenome: string | null = null;
      let isReference = false;
      let isOuterTrack = false;
      let searchAngle = theta;

      const inWedge = z.zoomLevel > 1.05 && r >= wedge.blowInner - SNAP;
      if (inWedge) {
        if (r > wedge.blowOuter + SNAP) {
          return null;
        }
        const wedgeHalfSpan = z.wedgeSpan * PI;
        let localAngle = theta - z.focusAngle;
        if (localAngle > PI) localAngle -= TWO_PI;
        if (localAngle < -PI) localAngle += TWO_PI;
        if (Math.abs(localAngle) > wedgeHalfSpan + 0.05) {
          return null;
        }
        searchAngle = (((z.focusAngle + localAngle / z.zoomLevel) % TWO_PI) + TWO_PI) % TWO_PI;
        let best = SNAP;
        for (let i = 0; i < s.rd.visibleGenomes.length; i++) {
          const b = wedgeGenomeRingBounds(wedge, i);
          const d = bandDist(r, b.inner, b.outer);
          if (d < best) {
            best = d;
            hitGenome = s.rd.visibleGenomes[i];
            isOuterTrack = false;
          }
        }
        if (wedge.outerTrackWidth > 0) {
          const t = wedgeOuterTrackBounds(wedge);
          if (bandDist(r, t.inner, t.outer) < best) {
            isOuterTrack = true;
            hitGenome = null;
          }
        }
        if (!hitGenome && !isOuterTrack) {
          return null;
        }
      } else {
        let best = SNAP;
        const dRef = bandDist(r, base.referenceRingInner, base.referenceRingOuter);
        if (dRef < best) {
          best = dRef;
          isReference = true;
        }
        if (base.hasOuterTrack) {
          const dTrack = bandDist(r, base.outerTrackInner, base.outerTrackOuter);
          if (dTrack < best) {
            best = dTrack;
            isReference = false;
            isOuterTrack = true;
          }
        }
        for (let i = 0; i < s.rd.visibleGenomes.length; i++) {
          const b = baseGenomeRingBounds(base, i);
          const d = bandDist(r, b.inner, b.outer);
          if (d < best) {
            best = d;
            isReference = false;
            isOuterTrack = false;
            hitGenome = s.rd.visibleGenomes[i];
          }
        }
        if (!isReference && !isOuterTrack && !hitGenome) {
          return null;
        }
      }

      const gene = nearestGene(s.rd, searchAngle);
      if (!gene) return null;
      return { gene, hitGenome };
    };

    const updateTooltip = (e: MouseEvent) => {
      const pick = pickGene(e);
      const s = sceneRef.current;
      if (!pick || !s || !s.rd) {
        setTooltip(null);
        return;
      }
      const { gene, hitGenome } = pick;

      let pident = gene.pident;
      let coverage = gene.coverage;
      let genomeName = 'Reference';
      if (hitGenome) {
        genomeName = hitGenome;
        const hit = s.rd.genomeGenes.get(hitGenome)?.get(gene.gene);
        if (hit) {
          pident = hit.pident;
          coverage = hit.coverage;
        }
      }

      const metaRow = hitGenome ? genomeMetaRef.current.get(hitGenome) : undefined;
      const label = metaRow
        ? (metaRow.organism_organismName as string | undefined) ??
          (metaRow.assemblyInfo_biosample_strain as string | undefined) ??
          null
        : null;

      let overlayStat: string | null = null;
      if (s.rd.overlayByBin) {
        const v = s.rd.overlayByBin.get(gene.bin);
        if (v !== undefined) overlayStat = v.toFixed(3);
      }

      setTooltip({
        x: e.clientX,
        y: e.clientY,
        gene: gene.gene,
        genome: genomeName,
        genomeLabel: label,
        position: `${gene.contig}:${gene.qstart}-${gene.qend}`,
        pident: `${pident.toFixed(1)}%`,
        coverage: `${coverage.toFixed(1)}%`,
        bin: gene.bin,
        overlayStat,
      });
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseenter', onEnter);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(scene.raf);
      ro.disconnect();
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseenter', onEnter);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      gl.deleteBuffer(baseBuffer);
      gl.deleteBuffer(wedgeBuffer);
      gl.deleteBuffer(indBuffer);
      gl.deleteProgram(program);
      sceneRef.current = null;
    };
  }, []);

  // Data effect — fetch the meta sidecar + genome metadata and build render data.
  useEffect(() => {
    if (result.kind !== 'arrow') {
      setStatus('Unexpected result type for genome_organization.');
      return;
    }
    let cancelled = false;
    setStatus('Loading…');
    const body = buildRequestBody(params);
    const pangenomeId = typeof params.pangenomeId === 'string' ? params.pangenomeId : '';
    (async () => {
      const [meta, genomeRows] = await Promise.all([
        api.runFunctionMeta<GenomeOrganizationMeta>('genome_organization', body),
        pangenomeId ? api.getGenomes(pangenomeId).catch(() => [] as GenomeRow[]) : Promise.resolve([] as GenomeRow[]),
      ]);
      if (cancelled) return;
      genomeMetaRef.current = new Map(genomeRows.map((g) => [g.genome, g]));
      const rows = arrowToAlignmentRows(result.table as never);
      const rd = buildRenderData(rows, meta, params);
      const s = sceneRef.current;
      if (s) {
        s.rd = rd;
        s.dirty = true;
      }
      const overlayNote =
        rd.overlayByBin && rd.overlayChannel
          ? ` · overlay: ${rd.overlayChannel}`
          : '';
      setCaption(
        `ref: ${rd.reference} · ${rd.visibleGenomes.length} genomes · color: ${rd.colorBy}${overlayNote} · scroll to zoom`,
      );
      setHighlightLegend(
        rd.highlightBins.map((bin) => ({ bin, color: rgbaCss(ordinalColor(rd.binIndex.get(bin) ?? -1)) })),
      );
      setStatus(rd.referenceGenes.size === 0 ? 'No reference-genome alignments to plot.' : null);
    })().catch((err) => {
      if (!cancelled) setStatus(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [result, params]);

  // Zoomed-wedge geometry from params: angular width (fraction of the full
  // circle) and radial height (fraction of the plot radius, i.e. inner:outer ratio).
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const width = typeof params.sliceWidth === 'number' ? params.sliceWidth : NaN;
    if (Number.isFinite(width) && width > 0) s.zoom.wedgeSpan = width;
    const height = typeof params.sliceHeight === 'number' ? params.sliceHeight : NaN;
    if (Number.isFinite(height) && height > 0) s.zoom.wedgeFraction = height;
  }, [params]);

  // Push the selected bin into the render loop so the next frame rebuilds the
  // arc buffers with the non-selected bins dimmed.
  useEffect(() => {
    const s = sceneRef.current;
    if (s) {
      s.selectedBin = selectedBin ?? null;
      s.dirty = true;
    }
  }, [selectedBin]);

  useRegisterExport(
    {
      png: () => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('canvas not ready');
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
        });
      },
    },
    [result],
  );

  return (
    <div className="webgl-genome-org" ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: onSelectBin ? 'pointer' : 'default' }}
      />
      {caption && (
        <div className="webgl-caption" style={captionStyle}>
          {caption}
        </div>
      )}
      {highlightLegend.length > 0 && (
        <div style={legendStyle}>
          {highlightLegend.map(({ bin, color }) => (
            <div key={bin} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: color, borderRadius: 2, flex: '0 0 auto' }} />
              <span>{bin}</span>
            </div>
          ))}
        </div>
      )}
      {status && (
        <div className="webgl-status" style={statusStyle} role="status">
          {status}
        </div>
      )}
      {tooltip && <Tooltip t={tooltip} />}
    </div>
  );
}

function rgbaCss(c: Rgba): string {
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
}

const captionStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  fontSize: 12,
  opacity: 0.75,
  pointerEvents: 'none',
};

const legendStyle: React.CSSProperties = {
  position: 'absolute',
  top: 32,
  left: 8,
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  pointerEvents: 'none',
};

const statusStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
};

function Tooltip({ t }: { t: TooltipState }) {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(t.x + 12, window.innerWidth - 240),
    top: Math.min(t.y + 12, window.innerHeight - 180),
    background: 'var(--tooltip-bg, rgba(17,24,39,0.95))',
    color: 'var(--tooltip-fg, #f8fafc)',
    padding: '6px 8px',
    borderRadius: 4,
    fontSize: 12,
    pointerEvents: 'none',
    maxWidth: 260,
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  };
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div style={style}>
      {row('Gene', t.gene)}
      {t.genomeLabel && row('Name', t.genomeLabel)}
      {row('Genome', t.genome)}
      {row('Position', t.position)}
      {row('Identity', t.pident)}
      {row('Coverage', t.coverage)}
      {row('Bin', t.bin)}
      {t.overlayStat !== null && row('Overlay', t.overlayStat)}
    </div>
  );
}
