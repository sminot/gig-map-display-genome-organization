/**
 * zoom-contract.js — Interface contract for the WebGL zoom feature.
 *
 * This file is the source of truth for all inter-module interfaces.
 * Implementation modules must satisfy these signatures exactly.
 * Do NOT modify this file — update the implementations to match it.
 *
 * Module ownership:
 *   window.ZoomState        → zoom-state.js
 *   window.initWebGLRenderer,
 *   window.updateWebGLRenderData → webgl-renderer.js
 *   window.initZoomInteraction   → zoom-interaction.js
 *
 * Canvas IDs:
 *   #main-canvas   — Canvas 2D, owned by genome-viz.js (full circle)
 *   #webgl-canvas  — WebGL2,    owned by webgl-renderer.js (zoom wedge overlay)
 *   #overlay-svg   — SVG,       owned by genome-viz.js (contig labels)
 */

// ─── ZoomState ────────────────────────────────────────────────────────────────
// Owned and implemented by zoom-state.js.
// All other modules call only these public methods.

window.ZoomState = {
  // Read-only current animated values (updated each frame by tick()).
  // Do not mutate directly — use the setters below.
  focusAngle: 0,      // [0, 2π) — genome angle at wedge center
  zoomLevel:  1,      // [1, 50] — 1 = no wedge, N = N× magnification
  wedgeSpan:  1 / 3,  // (0, 1) — visual wedge fraction of full circle
  isHovering: false,  // true while mouse is over the main circle

  /**
   * Advance spring physics toward target values.
   * Called every rAF frame by webgl-renderer.js.
   * Updates focusAngle, zoomLevel in-place with spring easing.
   * @param {number} dt — milliseconds since last frame
   */
  tick: function (dt) {},

  /**
   * Set the genome angle the wedge should center on.
   * @param {number} angle — radians [0, 2π)
   */
  setFocusAngle: function (angle) {},

  /**
   * Set the zoom multiplier target.
   * @param {number} level — clamped internally to [1, 50]
   */
  setZoomLevel: function (level) {},

  /**
   * Set the visual wedge span fraction.
   * @param {number} span — clamped internally to [0.1, 0.5]
   */
  setWedgeSpan: function (span) {},

  /**
   * Signal that the mouse has entered or left the main circle.
   * When false and zoomLevel reaches ~1, the renderer hides the wedge.
   * @param {boolean} hovering
   */
  setHovering: function (hovering) {},

  /**
   * Animate zoom back to level 1 (hide the wedge).
   * Called by the "Reset" button and by mouseleave.
   */
  resetZoom: function () {},
};

// ─── WebGL Renderer ───────────────────────────────────────────────────────────
// Owned and implemented by webgl-renderer.js.

/**
 * Create #webgl-canvas, get WebGL2 context, compile shaders,
 * and start the rAF animation loop.
 * Must be called once after DOMContentLoaded.
 */
window.initWebGLRenderer = function () {};

/**
 * Pass new render geometry to the WebGL renderer.
 * Called by buildRenderData() in app.js after any data or state change.
 * The renderer stores this and uses it on every subsequent frame.
 * @param {object} renderData — see data-contract.js RenderData shape
 */
window.updateWebGLRenderData = function (renderData) {};

// ─── Zoom Interaction ─────────────────────────────────────────────────────────
// Owned and implemented by zoom-interaction.js.

/**
 * Attach mousemove, wheel, mouseenter, mouseleave to #main-canvas.
 * Must be called once after DOMContentLoaded.
 * Reads ring geometry via window.getLastGeometry() (from genome-viz.js).
 * Mutates ZoomState via its public setters only.
 */
window.initZoomInteraction = function () {};
