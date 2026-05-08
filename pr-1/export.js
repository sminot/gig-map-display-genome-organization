/**
 * export.js — Export utilities for the Pangenome Viewer.
 *
 * Provides three export modes:
 *   - PNG  : composites the canvas + SVG overlay into a single raster image.
 *   - PDF  : injects print-media CSS so only the viz container is visible,
 *            then triggers window.print().
 *   - HTML : produces a self-contained HTML file embedding the canvas as a
 *            data URL and the SVG overlay as inline markup.
 *
 * All public symbols are attached to `window`.  No ES modules, no build step,
 * no external dependencies beyond what index.html already loads.
 */
(function () {
  'use strict';

  // ─── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Return the element by id, or null (never throws).
   * Callers are responsible for early-return guards.
   */
  function getEl(id) {
    return document.getElementById(id);
  }

  /**
   * Trigger a file download from a URL (data URL or object URL).
   *
   * @param {string} url       - The href for the anchor.
   * @param {string} filename  - The suggested filename.
   */
  function triggerDownload(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ─── exportAsPNG ────────────────────────────────────────────────────────────

  /**
   * Composite the main canvas and the SVG overlay into a single PNG download.
   *
   * The function is async because converting SVG to an Image requires waiting
   * for the image's `onload` event before drawing it onto the offscreen canvas.
   *
   * @returns {Promise<void>}
   */
  async function exportAsPNG() {
    var canvas = getEl('main-canvas');
    if (!canvas) {
      console.error('exportAsPNG: #main-canvas not found');
      return;
    }

    var svg = getEl('overlay-svg');
    var width = canvas.width;
    var height = canvas.height;

    // Create an offscreen canvas of the same pixel dimensions.
    var offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    var offCtx = offscreen.getContext('2d');

    // 1. Paint the dark background that matches the app theme.
    offCtx.fillStyle = '#1a1a2e';
    offCtx.fillRect(0, 0, width, height);

    // 2. Draw the main canvas content.
    offCtx.drawImage(canvas, 0, 0);

    // 2b. Draw the WebGL zoom-wedge overlay (if visible).
    var webglCanvas = getEl('webgl-canvas');
    if (webglCanvas) offCtx.drawImage(webglCanvas, 0, 0);

    // 3. Overlay the SVG — only if it actually contains children.
    if (svg && svg.childElementCount > 0) {
      // Ensure the SVG carries explicit width/height so browsers render it
      // at the correct size when loaded as an Image.
      var hadWidth = svg.hasAttribute('width');
      var hadHeight = svg.hasAttribute('height');
      if (!hadWidth) svg.setAttribute('width', width);
      if (!hadHeight) svg.setAttribute('height', height);

      var svgStr = new XMLSerializer().serializeToString(svg);

      // Restore original attribute state so we don't mutate the live DOM.
      if (!hadWidth) svg.removeAttribute('width');
      if (!hadHeight) svg.removeAttribute('height');

      var blob = new Blob([svgStr], { type: 'image/svg+xml' });
      var blobUrl = URL.createObjectURL(blob);

      await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          offCtx.drawImage(img, 0, 0);
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.onerror = function (err) {
          URL.revokeObjectURL(blobUrl);
          console.error('exportAsPNG: failed to load SVG as image', err);
          // Resolve instead of reject so the PNG is still downloaded
          // even if the SVG overlay couldn't be drawn.
          resolve();
        };
        img.src = blobUrl;
      });
    }

    // 4. Download the composited image.
    var dataUrl = offscreen.toDataURL('image/png');
    triggerDownload(dataUrl, 'pangenome.png');
  }

  // ─── exportAsPDF ────────────────────────────────────────────────────────────

  /**
   * Use the browser's built-in print-to-PDF capability.
   *
   * A temporary <style> tag hides everything except #viz-container during
   * printing, then is removed two seconds after the print dialog opens
   * (the dialog itself is modal, so the removal happens after the user
   * dismisses it).
   */
  function exportAsPDF() {
    var styleId = 'print-override';

    // Remove any stale injection from a previous call.
    var existing = document.getElementById(styleId);
    if (existing) existing.parentNode.removeChild(existing);

    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '@media print {',
      '  body * { visibility: hidden; }',
      '  #viz-container, #viz-container * { visibility: visible; }',
      '  #viz-container {',
      '    position: fixed;',
      '    left: 0;',
      '    top: 0;',
      '    width: 100%;',
      '    height: 100%;',
      '  }',
      '}'
    ].join('\n');

    document.head.appendChild(style);

    window.print();

    // Clean up after the print dialog has been handled.
    setTimeout(function () {
      var el = document.getElementById(styleId);
      if (el) el.parentNode.removeChild(el);
    }, 2000);
  }

  // ─── exportAsHTML ────────────────────────────────────────────────────────────

  /**
   * Generate a fully self-contained HTML file that re-renders the
   * visualization using an embedded canvas data URL and inline SVG.
   */
  function exportAsHTML() {
    var canvas = getEl('main-canvas');
    if (!canvas) {
      console.error('exportAsHTML: #main-canvas not found');
      return;
    }

    var svgEl = getEl('overlay-svg');
    var width = canvas.width;
    var height = canvas.height;

    // Composite main canvas + WebGL overlay into a single image for HTML export.
    var exportOffscreen = document.createElement('canvas');
    exportOffscreen.width = width;
    exportOffscreen.height = height;
    var exportCtx = exportOffscreen.getContext('2d');
    exportCtx.fillStyle = '#1a1a2e';
    exportCtx.fillRect(0, 0, width, height);
    exportCtx.drawImage(canvas, 0, 0);
    var webglCanvasHtml = getEl('webgl-canvas');
    if (webglCanvasHtml) exportCtx.drawImage(webglCanvasHtml, 0, 0);
    var canvasDataUrl = exportOffscreen.toDataURL('image/png');

    var svgContent = '';
    if (svgEl) {
      svgContent = new XMLSerializer().serializeToString(svgEl);
    }

    var timestamp = new Date().toLocaleString();

    var html = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <title>Pangenome Viewer Export</title>',
      '  <style>',
      '    body { margin: 0; background: #1a1a2e; display: flex; justify-content: center; align-items: center; min-height: 100vh; }',
      '    .export-container { position: relative; display: inline-block; }',
      '    .export-container img { display: block; }',
      '    .export-container svg { position: absolute; top: 0; left: 0; pointer-events: none; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="export-container">',
      '    <img src="' + canvasDataUrl + '" width="' + width + '" height="' + height + '" alt="Pangenome visualization">',
      '    ' + svgContent,
      '  </div>',
      '  <p style="color:#94a3b8;text-align:center;font-family:sans-serif;font-size:12px">',
      '    Generated by Pangenome Viewer — ' + timestamp,
      '  </p>',
      '</body>',
      '</html>'
    ].join('\n');

    var blob = new Blob([html], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, 'pangenome-export.html');

    // Object URLs for HTML blobs should be revoked after the download
    // is initiated.  A short delay gives the browser time to start the
    // download before the URL is invalidated.
    setTimeout(function () {
      URL.revokeObjectURL(blobUrl);
    }, 10000);
  }

  // ─── initExportButtons ──────────────────────────────────────────────────────

  /**
   * Wire click handlers onto the export buttons declared in index.html.
   * Safe to call before or after the buttons exist in the DOM — if a button
   * is not present at call time it is silently skipped.
   */
  function initExportButtons() {
    var pngBtn = getEl('export-png-btn');
    var pdfBtn = getEl('export-pdf-btn');
    var htmlBtn = getEl('export-html-btn');

    if (pngBtn) {
      pngBtn.addEventListener('click', function () {
        exportAsPNG();
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        exportAsPDF();
      });
    }

    if (htmlBtn) {
      htmlBtn.addEventListener('click', function () {
        exportAsHTML();
      });
    }
  }

  // ─── Expose on window ───────────────────────────────────────────────────────

  window.initExportButtons = initExportButtons;
  window.exportAsPNG = exportAsPNG;
  window.exportAsPDF = exportAsPDF;
  window.exportAsHTML = exportAsHTML;

})();
