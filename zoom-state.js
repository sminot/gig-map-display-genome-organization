(function () {
  var _targetFocusAngle = 0;
  var _targetZoomLevel = 1;
  var _targetRadiusScale = 1;

  window.ZoomState = {
    focusAngle: 0,
    zoomLevel: 1,
    wedgeSpan: 1 / 3,
    isHovering: false,
    displayRadiusScale: 1,

    tick: function (dt) {
      var zoomAlpha  = 1 - Math.exp(-dt / 120);
      var focusAlpha = 1 - Math.exp(-dt / 200);
      var scaleAlpha = 1 - Math.exp(-dt / 150);

      this.zoomLevel += (_targetZoomLevel - this.zoomLevel) * zoomAlpha;
      this.displayRadiusScale += (_targetRadiusScale - this.displayRadiusScale) * scaleAlpha;

      var diff = _targetFocusAngle - this.focusAngle;
      if (diff > Math.PI)  diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      this.focusAngle = (this.focusAngle + diff * focusAlpha + 2 * Math.PI) % (2 * Math.PI);
    },

    _targetFocusAngle: 0,
    setFocusAngle: function (angle) {
      _targetFocusAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      this._targetFocusAngle = _targetFocusAngle;
    },

    setZoomLevel: function (level) {
      _targetZoomLevel = Math.max(1, Math.min(50, level));
      this._targetZoomLevel = _targetZoomLevel;
    },

    setTargetRadiusScale: function (scale) {
      _targetRadiusScale = Math.max(0.3, Math.min(1.0, scale));
    },

    setWedgeSpan: function (span) {
      this.wedgeSpan = Math.max(0.1, Math.min(0.5, span));
    },

    wedgeGap: 6,
    setWedgeGap: function (px) {
      this.wedgeGap = Math.max(0, Math.min(80, px));
    },

    wedgeHeightScale: 2.0,
    setWedgeHeightScale: function (scale) {
      this.wedgeHeightScale = Math.max(2.0, Math.min(10.0, scale));
    },

    setHovering: function (hovering) {
      this.isHovering = hovering;
    },

    resetZoom: function () {
      _targetZoomLevel = 1;
      this._targetZoomLevel = 1;
      _targetRadiusScale = 1;
    },

    _targetZoomLevel: 1,
  };
})();
