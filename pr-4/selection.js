/**
 * selection.js — Click-and-drag arc selection interaction for the circular
 * genome visualization canvas.
 *
 * Manages SelectionState (defined in data-contract.js).
 * Does NOT render anything — rendering is handled by genome-viz.js.
 *
 * Exposes on window:
 *   initSelectionInteraction()
 *   isDragActive()
 *   clearAllSelections()
 *   removeSelection(id)
 *   hitTestSelections(theta)
 */

(function () {
  'use strict';

  // ─── Module-level drag tracking ──────────────────────────────────────────────

  // Stored on mousedown; cleared on mouseup / mouseleave.
  var _mouseDownClientPos = null;

  // Whether the 5 px movement threshold has been crossed for the current drag.
  var _dragThresholdMet = false;

  // ─── Angle conversion ─────────────────────────────────────────────────────────

  /**
   * Convert a pointer event into an angle [0, 2π) measured clockwise from 12 o'clock.
   * Matches the convention used throughout genome-viz.js.
   *
   * @param {MouseEvent} event
   * @param {HTMLCanvasElement} canvas
   * @returns {number} theta in [0, 2π)
   */
  function pointerToTheta(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    var mx = event.clientX - rect.left - canvas.width / 2;
    var my = event.clientY - rect.top  - canvas.height / 2;
    var theta = Math.atan2(my, mx) + Math.PI / 2;
    if (theta < 0) theta += 2 * Math.PI;
    if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;
    return theta;
  }

  // ─── Button helper ────────────────────────────────────────────────────────────

  /**
   * Sync the #clear-selections-btn element to the current selection count.
   * No-ops gracefully when the element is absent.
   */
  function updateClearButton() {
    var btn = document.getElementById('clear-selections-btn');
    if (!btn) return;
    var n = SelectionState.selections.length;
    btn.hidden = (n === 0);
    btn.textContent = '× Clear ' + n + ' selection' + (n === 1 ? '' : 's');
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Returns true while a drag gesture is in progress.
   * @returns {boolean}
   */
  window.isDragActive = function () {
    return SelectionState.dragState !== null;
  };

  /**
   * Remove all selections and any in-progress drag.
   * Updates the clear button and triggers a re-render.
   */
  window.clearAllSelections = function () {
    SelectionState.selections = [];
    SelectionState.dragState = null;
    _mouseDownClientPos = null;
    _dragThresholdMet = false;
    updateClearButton();
    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  };

  /**
   * Remove the selection whose id matches.
   * @param {number} id
   */
  window.removeSelection = function (id) {
    SelectionState.selections = SelectionState.selections.filter(function (s) {
      return s.id !== id;
    });
    updateClearButton();
    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  };

  /**
   * Return the index of the first selection whose arc contains theta, or -1.
   * Handles seam-crossing arcs (theta1 > theta2 in stored form).
   *
   * @param {number} theta — angle in [0, 2π)
   * @returns {number} index into SelectionState.selections, or -1
   */
  window.hitTestSelections = function (theta) {
    for (var i = 0; i < SelectionState.selections.length; i++) {
      var sel = SelectionState.selections[i];
      var t1 = sel.theta1;
      var t2 = sel.theta2;
      var hit;
      if (t1 <= t2) {
        // Normal arc — does not cross the 0/2π seam.
        hit = (theta >= t1 && theta <= t2);
      } else {
        // Seam-crossing arc: spans from t1 up to 2π and from 0 up to t2.
        hit = (theta >= t1 || theta <= t2);
      }
      if (hit) return i;
    }
    return -1;
  };

  // ─── Event handlers ───────────────────────────────────────────────────────────

  function onMouseDown(e) {
    var canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    // Require left button only.
    if (e.button !== 0) return;

    // Geometry guard: must have a valid last geometry to know the ring boundaries.
    var geometry = (typeof window.getLastGeometry === 'function')
      ? window.getLastGeometry()
      : null;
    if (!geometry) return;

    // Compute radius from canvas centre.
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left - canvas.width / 2;
    var my = e.clientY - rect.top  - canvas.height / 2;
    var r = Math.sqrt(mx * mx + my * my);

    // Ignore clicks well inside the centre or well outside the reference ring.
    if (r < 10 || r > geometry.referenceRingOuter + 30) return;

    var theta = pointerToTheta(e, canvas);

    SelectionState.dragState = { startTheta: theta, currentTheta: theta };
    _mouseDownClientPos = { x: e.clientX, y: e.clientY };
    _dragThresholdMet = false;
  }

  function onMouseMove(e) {
    if (!_mouseDownClientPos) return;

    var canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    // Check whether the 5 px movement threshold has been crossed.
    if (!_dragThresholdMet) {
      var dx = e.clientX - _mouseDownClientPos.x;
      var dy = e.clientY - _mouseDownClientPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      _dragThresholdMet = true;
    }

    var theta = pointerToTheta(e, canvas);
    if (SelectionState.dragState) {
      SelectionState.dragState.currentTheta = theta;
    }

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  function onMouseUp(e) {
    if (!_mouseDownClientPos) return;

    var canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    var dragWasActive = _dragThresholdMet && SelectionState.dragState !== null;

    if (dragWasActive) {
      var theta = pointerToTheta(e, canvas);
      var startTheta = SelectionState.dragState.startTheta;

      // ── Compute the shorter arc span (≤ π) ───────────────────────────────
      var raw = Math.abs(theta - startTheta);
      // If raw > π we want the complement arc.
      var span = (raw > Math.PI) ? (2 * Math.PI - raw) : raw;

      if (span > 0.04) {
        // Determine which direction gives the shorter arc so that theta1 is
        // the clockwise-earlier boundary and theta2 = theta1 + span.
        var ccwDiff = ((theta - startTheta) + 2 * Math.PI) % (2 * Math.PI);
        var cwSpanFromStart = (ccwDiff <= Math.PI) ? ccwDiff : (2 * Math.PI - ccwDiff);

        var theta1, theta2;
        if (ccwDiff <= Math.PI) {
          // Going clockwise from start to end is the shorter path.
          theta1 = startTheta;
          theta2 = startTheta + cwSpanFromStart;
        } else {
          // Going clockwise from end to start is the shorter path.
          theta1 = theta;
          theta2 = theta + cwSpanFromStart;
        }

        // Normalize both to [0, 2π).
        theta1 = theta1 % (2 * Math.PI);
        if (theta1 < 0) theta1 += 2 * Math.PI;
        theta2 = theta2 % (2 * Math.PI);
        if (theta2 < 0) theta2 += 2 * Math.PI;

        // Cap at 5 simultaneous selections.
        if (SelectionState.selections.length < 5) {
          SelectionState.selections.push({
            id: SelectionState._nextId++,
            theta1: theta1,
            theta2: theta2,
          });
        }
      }
    } else if (!dragWasActive && SelectionState.dragState !== null) {
      // Pure click (threshold never crossed): hit-test existing selections.
      var clickTheta = pointerToTheta(e, canvas);
      var hitIdx = window.hitTestSelections(clickTheta);
      if (hitIdx !== -1) {
        var hitId = SelectionState.selections[hitIdx].id;
        // removeSelection triggers onStateChanged internally, so skip the
        // duplicate call at the bottom for this branch.
        SelectionState.selections = SelectionState.selections.filter(function (s) {
          return s.id !== hitId;
        });
        updateClearButton();
        SelectionState.dragState = null;
        _mouseDownClientPos = null;
        _dragThresholdMet = false;
        if (typeof window.onStateChanged === 'function') {
          window.onStateChanged();
        }
        return;
      }
    }

    // Common teardown.
    SelectionState.dragState = null;
    _mouseDownClientPos = null;
    _dragThresholdMet = false;
    updateClearButton();

    if (typeof window.onStateChanged === 'function') {
      window.onStateChanged();
    }
  }

  function onMouseLeave() {
    if (SelectionState.dragState !== null || _mouseDownClientPos !== null) {
      SelectionState.dragState = null;
      _mouseDownClientPos = null;
      _dragThresholdMet = false;
      if (typeof window.onStateChanged === 'function') {
        window.onStateChanged();
      }
    }
  }

  function onDocumentKeyDown(e) {
    if (e.key !== 'Escape') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    window.clearAllSelections();
  }

  // ─── Initialization ───────────────────────────────────────────────────────────

  /**
   * Attach all interaction listeners.
   * Call once after the DOM is ready.
   */
  window.initSelectionInteraction = function () {
    var canvas = document.getElementById('main-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown',  onMouseDown);
    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    document.addEventListener('keydown', onDocumentKeyDown);

    // Wire up the clear-selections button if it already exists in the DOM.
    var btn = document.getElementById('clear-selections-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        window.clearAllSelections();
      });
    }

    // Initialise button visibility.
    updateClearButton();
  };
})();
