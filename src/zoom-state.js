/**
 * Per-instance zoom state for the magnifying wedge.
 *
 * `zoomLevel`, `focusAngle` and `displayRadiusScale` are spring-animated: the
 * `*Target` fields are the authoritative values a config round-trip stores, and
 * the un-suffixed fields are the current frame's interpolation toward them.
 * `snapToTargets()` collapses the animation so rehydrating a config reproduces a
 * view exactly instead of animating into it.
 */

const TWO_PI = 2 * Math.PI;

export const ZOOM_LIMITS = {
  zoomLevel: [1, 50],
  wedgeSpan: [0.1, 0.5],
  wedgeGap: [0, 80],
  wedgeHeightScale: [2, 10],
  radiusScale: [0.3, 1],
};

function clamp(value, [lo, hi]) {
  return Math.max(lo, Math.min(hi, value));
}

export function createZoomState() {
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
    isHovering: false,

    tick(dt) {
      const zoomAlpha = 1 - Math.exp(-dt / 120);
      const focusAlpha = 1 - Math.exp(-dt / 200);
      const scaleAlpha = 1 - Math.exp(-dt / 150);

      this.zoomLevel += (this.zoomLevelTarget - this.zoomLevel) * zoomAlpha;
      this.displayRadiusScale += (this.radiusScaleTarget - this.displayRadiusScale) * scaleAlpha;

      let diff = this.focusAngleTarget - this.focusAngle;
      if (diff > Math.PI) diff -= TWO_PI;
      if (diff < -Math.PI) diff += TWO_PI;
      this.focusAngle = (this.focusAngle + diff * focusAlpha + TWO_PI) % TWO_PI;
    },

    setFocusAngle(angle) {
      this.focusAngleTarget = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    },

    setZoomLevel(level) {
      this.zoomLevelTarget = clamp(level, ZOOM_LIMITS.zoomLevel);
    },

    setTargetRadiusScale(scale) {
      this.radiusScaleTarget = clamp(scale, ZOOM_LIMITS.radiusScale);
    },

    setWedgeSpan(span) {
      this.wedgeSpan = clamp(span, ZOOM_LIMITS.wedgeSpan);
    },

    setWedgeGap(px) {
      this.wedgeGap = clamp(px, ZOOM_LIMITS.wedgeGap);
    },

    setWedgeHeightScale(scale) {
      this.wedgeHeightScale = clamp(scale, ZOOM_LIMITS.wedgeHeightScale);
    },

    setHovering(hovering) {
      this.isHovering = hovering;
    },

    resetZoom() {
      this.zoomLevelTarget = 1;
      this.radiusScaleTarget = 1;
    },

    snapToTargets() {
      this.zoomLevel = this.zoomLevelTarget;
      this.focusAngle = this.focusAngleTarget;
      this.displayRadiusScale = this.radiusScaleTarget;
    },
  };
}
