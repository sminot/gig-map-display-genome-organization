/**
 * Pointer-driven zoom: wheel to magnify, drag to move the wedge.
 * All listeners are on the instance's own canvas and are removed by destroy().
 */

const ZOOM_FACTOR = 1.15;
const SETTLE_DELAY_MS = 600;
const TWO_PI = 2 * Math.PI;

/**
 * @param {object} options
 * @param {object} options.state
 * @param {object} options.refs
 * @param {Function} [options.onSettled] called ~600ms after the last gesture, for
 *                                       callers that persist the zoom (URL, config)
 */
export function attachZoomInteraction({ state, refs, onSettled }) {
  const canvas = refs.canvas;
  const zoom = state.zoom;
  let dragging = false;
  let settleTimer = null;

  function scheduleSettled() {
    if (!onSettled) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { settleTimer = null; onSettled(); }, SETTLE_DELAY_MS);
  }

  function pointerToTheta(event) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left - canvas.width / 2;
    const my = event.clientY - rect.top - canvas.height / 2;
    let theta = Math.atan2(my, mx) + Math.PI / 2;
    if (theta < 0) theta += TWO_PI;
    if (theta >= TWO_PI) theta -= TWO_PI;
    return theta;
  }

  const handlers = {
    mousedown(event) {
      dragging = true;
      zoom.setFocusAngle(pointerToTheta(event));
      zoom.setHovering(true);
    },
    mousemove(event) {
      zoom.setHovering(true);
      if (dragging) zoom.setFocusAngle(pointerToTheta(event));
    },
    mouseup() {
      if (dragging) scheduleSettled();
      dragging = false;
    },
    wheel(event) {
      event.preventDefault();
      if (!zoom.isHovering) return;
      // Starting a fresh zoom-in anchors the wedge under the cursor.
      if (zoom.zoomLevelTarget <= 1.01 && event.deltaY < 0) {
        zoom.setFocusAngle(pointerToTheta(event));
      }
      zoom.setZoomLevel(event.deltaY < 0 ? zoom.zoomLevel * ZOOM_FACTOR : zoom.zoomLevel / ZOOM_FACTOR);
      scheduleSettled();
    },
    mouseleave() {
      dragging = false;
      zoom.setHovering(false);
    },
    mouseenter() {
      zoom.setHovering(true);
    },
  };

  for (const [type, handler] of Object.entries(handlers)) {
    canvas.addEventListener(type, handler, type === 'wheel' ? { passive: false } : undefined);
  }

  return {
    destroy() {
      if (settleTimer) clearTimeout(settleTimer);
      for (const [type, handler] of Object.entries(handlers)) {
        canvas.removeEventListener(type, handler);
      }
    },
  };
}
