/**
 * pangenome-loader.js
 *
 * Single-script bootstrap for self-hosting the standalone app. Drop one <script>
 * tag into an otherwise-empty page and the whole application is loaded from
 * jsDelivr — no build step, no npm, no server-side logic.
 *
 *   <script src="https://cdn.jsdelivr.net/gh/sminot/gig-map-display-genome-organization@v2.0.0/pangenome-loader.js"></script>
 *
 * Since v2 the app is ES modules, so this injects an import map for d3 and Papa
 * Parse and then one module entry point, instead of a fixed list of classic
 * scripts. The import map has to be in the document before any module starts
 * loading, which is why this file is a classic script and does its work
 * synchronously.
 *
 * Data still comes from a `data/` folder next to the page, or from `?data=`.
 */
(function () {
  var VERSION = 'v2.0.0';
  var CDN = 'https://cdn.jsdelivr.net/gh/sminot/gig-map-display-genome-organization@' + VERSION;

  var IMPORTS = {
    d3: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm',
    papaparse: 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm',
  };

  if (document.querySelector('script[type="importmap"]')) {
    console.error(
      '[pangenome-loader] The page already declares an import map. '
      + 'Add "d3" and "papaparse" to it and load ' + CDN + '/src/standalone.js yourself.'
    );
    return;
  }

  var stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = CDN + '/style.css';
  document.head.appendChild(stylesheet);

  // The app fills its container, so the page has to give it a height.
  var pageStyle = document.createElement('style');
  pageStyle.textContent =
    'html,body{height:100%;margin:0;overflow:hidden;background:#1a1a2e}'
    + '#app{height:100%}';
  document.head.appendChild(pageStyle);

  var importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({ imports: IMPORTS });
  document.head.appendChild(importMap);

  var container = document.getElementById('app');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app';
    document.body.insertBefore(container, document.body.firstChild);
  }

  var entry = document.createElement('script');
  entry.type = 'module';
  entry.src = CDN + '/src/standalone.js';
  entry.onerror = function () {
    console.error('[pangenome-loader] Failed to load ' + entry.src);
  };
  document.head.appendChild(entry);
})();
