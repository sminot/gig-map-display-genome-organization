(function () {
  var _targetFocusAngle = 0;
  var _targetZoomLevel = 1;

  window.ZoomState = {
    focusAngle: 0,
    zoomLevel: 1,
    wedgeSpan: 1 / 3,
    isHovering: false,

    tick: function (dt) {
      var zoomAlpha = 1 - Math.exp(-dt / 120);
      var focusAlpha = 1 - Math.exp(-dt / 200);

      this.zoomLevel += (this._targetZoomLevel - this.zoomLevel) * zoomAlpha;

      var diff = _targetFocusAngle - this.focusAngle;
      // shortest angular path
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      this.focusAngle = (this.focusAngle + diff * focusAlpha + 2 * Math.PI) % (2 * Math.PI);
    },

    setFocusAngle: function (angle) {
      _targetFocusAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    },

    setZoomLevel: function (level) {
      this._targetZoomLevel = Math.max(1, Math.min(50, level));
    },

    setWedgeSpan: function (span) {
      this.wedgeSpan = Math.max(0.1, Math.min(0.5, span));
    },

    setHovering: function (hovering) {
      this.isHovering = hovering;
      if (!hovering && this._targetZoomLevel <= 1) {
        this.resetZoom();
      }
    },

    resetZoom: function () {
      this._targetZoomLevel = 1;
    },

    _targetZoomLevel: 1,
  };
})();
