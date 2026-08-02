/**
 * Ring geometry, in canvas pixels.
 *
 * Four consumers must agree on these numbers: the Canvas 2D renderer, the WebGL
 * wedge renderer, pointer hit-testing, and the SVG exporter. They all call in
 * here rather than each recomputing the layout.
 */

const REFERENCE_RING_WIDTH = 18;
const ANNOTATION_RING_WIDTH = 20;
const ANNOTATION_RING_GAP = 4;
const MAX_GENOME_RING_WIDTH = 20;

/** Rings of the main circle. */
export function mainGeometry(state, width, height, renderData) {
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.min(cx, cy) * 0.92 * state.zoom.displayRadiusScale;

  const referenceRingOuter = outerRadius;
  const referenceRingInner = outerRadius - REFERENCE_RING_WIDTH;

  // The annotation track sits outside the reference ring, so genome rings are
  // unaffected by whether it is present.
  const annotActive = renderData.annotActive;
  const annotRingInner = annotActive ? referenceRingOuter + ANNOTATION_RING_GAP : referenceRingOuter;
  const annotRingOuter = annotActive ? annotRingInner + ANNOTATION_RING_WIDTH : referenceRingOuter;

  const numGenomes = Math.max(1, renderData.visibleGenomes.length);
  const geneRingWidth = Math.min(
    (outerRadius - REFERENCE_RING_WIDTH - 20) / numGenomes,
    MAX_GENOME_RING_WIDTH,
  );

  return {
    cx,
    cy,
    outerRadius,
    referenceRingOuter,
    referenceRingInner,
    annotRingOuter,
    annotRingInner,
    geneRingWidth,
    genomeRingBounds(i) {
      const outer = referenceRingInner - i * geneRingWidth - 2;
      return { outer, inner: outer - geneRingWidth + 2 };
    },
  };
}

/**
 * Rings of the magnified wedge.
 *
 * The wedge's outer edge is pinned at 97% of the viewport radius; the main circle
 * shrinks (via `displayRadiusScale`) to make room, so a taller wedge means a
 * smaller circle rather than an overflowing one.
 */
export function wedgeGeometry(state, width, height, renderData) {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(cx, cy);

  const outerRadius = R * 0.92 * state.zoom.displayRadiusScale;
  const blowInner = outerRadius + state.zoom.wedgeGap;
  const blowOuter = R * 0.97;

  const numGenomes = renderData.visibleGenomes.length;
  const available = Math.max(0, blowOuter - blowInner);
  const annotWidth = renderData.annotActive ? Math.min(12, available * 0.25) : 0;
  const genomeWidth = numGenomes > 0 ? (available - annotWidth) / numGenomes : 0;

  return { cx, cy, R, outerRadius, blowInner, blowOuter, annotWidth, genomeWidth, numGenomes };
}

/**
 * Radius scale the wedge needs at the current zoom, for `setTargetRadiusScale`.
 * Returns 1 when the wedge is hidden.
 */
export function targetRadiusScale(state, width, height) {
  const R = Math.min(width / 2, height / 2);
  if (state.zoom.zoomLevel <= 1.05) return 1;
  const wedgeFraction = Math.min(0.8, 0.15 * state.zoom.wedgeHeightScale);
  return (R * 0.97 * (1 - wedgeFraction)) / (R * 0.92);
}
