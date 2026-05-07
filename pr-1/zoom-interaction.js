(function () {
  'use strict';

  const ZOOM_FACTOR = 1.15;
  let _dragging = false;

  function getCanvas() {
    return document.getElementById('main-canvas');
  }

  function pointerToTheta(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left - canvas.width / 2;
    const my = event.clientY - rect.top  - canvas.height / 2;
    let theta = Math.atan2(my, mx) + Math.PI / 2;
    if (theta < 0)            theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    return theta;
  }

  function handleMouseDown(e) {
    const canvas = getCanvas();
    if (!canvas) return;
    _dragging = true;
    window.ZoomState.setFocusAngle(pointerToTheta(e, canvas));
    window.ZoomState.setHovering(true);
  }

  function handleMouseMove(e) {
    if (!window.ZoomState) return;
    window.ZoomState.setHovering(true);
    if (!_dragging) return;
    const canvas = getCanvas();
    if (!canvas) return;
    window.ZoomState.setFocusAngle(pointerToTheta(e, canvas));
  }

  function handleMouseUp() {
    _dragging = false;
  }

  function handleWheel(e) {
    e.preventDefault();
    if (!window.ZoomState || !window.ZoomState.isHovering) return;
    const cur = window.ZoomState.zoomLevel;
    window.ZoomState.setZoomLevel(e.deltaY < 0 ? cur * ZOOM_FACTOR : cur / ZOOM_FACTOR);
  }

  function handleMouseLeave() {
    _dragging = false;
    if (window.ZoomState) window.ZoomState.setHovering(false);
  }

  function handleMouseEnter() {
    if (window.ZoomState) window.ZoomState.setHovering(true);
  }

  window.initZoomInteraction = function () {
    const canvas = getCanvas();
    if (!canvas) { console.warn('initZoomInteraction: #main-canvas not found'); return; }
    canvas.addEventListener('mousedown',  handleMouseDown);
    canvas.addEventListener('mousemove',  handleMouseMove);
    canvas.addEventListener('mouseup',    handleMouseUp);
    canvas.addEventListener('wheel',      handleWheel, { passive: false });
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mouseenter', handleMouseEnter);
  };
}());
