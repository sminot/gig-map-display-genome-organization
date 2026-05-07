(function () {
  'use strict';

  const ZOOM_FACTOR = 1.15;

  function pointerToTheta(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left - canvas.width / 2;
    const my = event.clientY - rect.top  - canvas.height / 2;
    let theta = Math.atan2(my, mx) + Math.PI / 2;
    if (theta < 0) theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    return theta;
  }

  function pointerRadius(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left - canvas.width / 2;
    const my = event.clientY - rect.top  - canvas.height / 2;
    return Math.sqrt(mx * mx + my * my);
  }

  function isOverRing(r) {
    const geometry = window.getLastGeometry ? window.getLastGeometry() : null;
    if (!geometry) return false;
    return !(r < 10 || r > geometry.referenceRingOuter + 10);
  }

  function handleMouseMove(e) {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    const r = pointerRadius(e, canvas);
    const overRing = isOverRing(r);

    if (overRing) {
      const theta = pointerToTheta(e, canvas);
      window.ZoomState.setFocusAngle(theta);
      window.ZoomState.setHovering(true);
    } else {
      window.ZoomState.setHovering(false);
    }
  }

  function handleWheel(e) {
    e.preventDefault();

    const canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    const r = pointerRadius(e, canvas);
    if (!isOverRing(r)) return;

    const theta = pointerToTheta(e, canvas);
    window.ZoomState.setFocusAngle(theta);

    const currentLevel = window.ZoomState.zoomLevel;
    const newLevel = e.deltaY < 0
      ? currentLevel * ZOOM_FACTOR
      : currentLevel / ZOOM_FACTOR;
    window.ZoomState.setZoomLevel(newLevel);
  }

  function handleMouseLeave() {
    window.ZoomState.setHovering(false);
    window.ZoomState.resetZoom();
  }

  function handleMouseEnter() {
    if (window.ZoomState.zoomLevel > 1) {
      window.ZoomState.setHovering(true);
    }
  }

  window.initZoomInteraction = function () {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) {
      console.warn('initZoomInteraction: #main-canvas not found');
      return;
    }

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mouseenter', handleMouseEnter);
  };
}());
