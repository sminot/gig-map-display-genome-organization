/**
 * mount(el, config) -> DisplayHandle
 *
 * One call owns one instance: its state, its DOM subtree, its Canvas 2D layer, its
 * WebGL context and its listeners. Nothing is shared with any other mounted
 * display, and destroy() releases all of it.
 */

import { createState } from './state.js';
import { buildLayout } from './dom.js';
import { createCanvasRenderer } from './canvas-renderer.js';
import { createWebGLRenderer } from './webgl-renderer.js';
import { attachZoomInteraction } from './zoom-interaction.js';
import { createControls } from './controls.js';
import { buildRenderData } from './render-data.js';
import { renderSVG } from './svg-export.js';
import { toPNGBlob } from './export.js';
import {
  fetchText, parseAlignmentCsv, setAlignmentRows, parseAnnotationCsv, annotationRowsToMap,
} from './data.js';
import { setGeneAnnotationData } from './gene-annotation.js';
import { setGenomeAnnotationData, GENOME_ANNOTATION_ID_FIELD } from './genome-annotation.js';
import { defaultConfig, validateConfig, applyConfigToState, configFromState } from './config.js';

const ALIGNMENT_SUFFIX = 'genomes.aln.csv.gz';
const GENE_ANNOTATION_SUFFIX = 'genes.annot.csv.gz';
const GENOME_ANNOTATION_SUFFIX = 'genomes.annot.csv.gz';

/** Sibling annotation URL for an alignment URL, or null when the name does not match. */
function siblingAnnotationUrl(alignmentUrl, suffix) {
  if (!alignmentUrl || !alignmentUrl.includes(ALIGNMENT_SUFFIX)) return null;
  return alignmentUrl.replace(ALIGNMENT_SUFFIX, suffix);
}

export function mount(el, config = {}) {
  if (!el || typeof el.querySelector !== 'function') {
    throw new Error('mount(el, config): el must be an element');
  }
  validateConfig(config);

  let current = { ...defaultConfig(), ...config };
  const state = createState();
  const { refs } = buildLayout(el, { controls: current.controls });

  const changeListeners = new Set();
  const errorListeners = new Set();
  let destroyed = false;
  let controlsCollapsed = false;

  const assertLive = (method) => {
    if (destroyed) throw new Error(`DisplayHandle.${method}() called after destroy()`);
  };

  const canvasRenderer = createCanvasRenderer({ state, refs });
  const webgl = createWebGLRenderer({
    state,
    refs,
    onAnimate: () => {
      canvasRenderer.draw();
      if (controls) controls.onAnimate();
    },
  });
  const zoomInteraction = attachZoomInteraction({
    state,
    refs,
    onSettled: () => emitChange(),
  });

  function emitChange() {
    if (destroyed) return;
    const snapshot = configFromState(state, { controls: current.controls, controlsCollapsed });
    for (const listener of changeListeners) listener(snapshot);
  }

  function render() {
    if (destroyed) return;
    refs.root.setAttribute('data-theme', state.theme);
    const renderData = buildRenderData(state);
    canvasRenderer.draw(renderData);
    webgl.setRenderData(renderData);
    if (controls) controls.refresh(renderData);
  }

  /**
   * Apply a config, redraw, then rebuild the sidebar from the new state — in that
   * order. The sidebar's column selects and genome toggles are built from state and
   * would otherwise still show what was selected before the config landed, and its
   * per-reference gene counts need the render data the redraw produces.
   */
  function applyAndRender(next) {
    applyConfigToState(state, next);
    render();
    if (controls) controls.syncFromState();
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  function setLoading(active) {
    if (refs.loading) refs.loading.hidden = !active;
  }

  /**
   * Surface a load failure. With the sidebar it becomes the visible error line; a
   * caller that mounted without controls hears about it through onError, and if it
   * subscribed to neither the error is rethrown rather than swallowed.
   */
  function reportError(error) {
    if (refs.errorMessage) {
      refs.errorMessage.textContent = error.message;
      refs.errorMessage.hidden = false;
    }
    for (const listener of errorListeners) listener(error);
    if (!refs.errorMessage && errorListeners.size === 0) throw error;
  }

  function clearError() {
    if (refs.errorMessage) {
      refs.errorMessage.textContent = '';
      refs.errorMessage.hidden = true;
    }
  }

  /**
   * Load an annotation table. `optional` marks a URL this code guessed rather than
   * one the caller asked for, where a 404 just means the dataset has no annotations.
   */
  async function loadAnnotation(url, { optional = false, genome = false } = {}) {
    try {
      const parsed = parseAnnotationCsv(await fetchText(url), genome ? GENOME_ANNOTATION_ID_FIELD : null);
      if (genome) setGenomeAnnotationData(state, parsed, url);
      else setGeneAnnotationData(state, parsed, url);
    } catch (err) {
      if (!optional) reportError(err);
    }
  }

  /**
   * Bring `state` in line with `config.data`, then apply the rest of the config.
   * Rows win over URLs, so a host that already has the data never triggers a fetch.
   */
  async function loadData(next) {
    const data = next.data || {};
    clearError();

    if (Array.isArray(data.rows)) {
      setAlignmentRows(state, data.rows, data.alignmentUrl || null);
    } else if (data.alignmentUrl) {
      setLoading(true);
      try {
        setAlignmentRows(state, parseAlignmentCsv(await fetchText(data.alignmentUrl)), data.alignmentUrl);
      } catch (err) {
        setLoading(false);
        reportError(err);
        return;
      }
      setLoading(false);
    }

    if (Array.isArray(data.geneAnnotationRows)) {
      setGeneAnnotationData(state, annotationRowsToMap(data.geneAnnotationRows), data.geneAnnotationUrl || null);
    } else if (data.geneAnnotationUrl) {
      await loadAnnotation(data.geneAnnotationUrl);
    } else if (data.alignmentUrl) {
      const sibling = siblingAnnotationUrl(data.alignmentUrl, GENE_ANNOTATION_SUFFIX);
      if (sibling) await loadAnnotation(sibling, { optional: true });
    }

    if (Array.isArray(data.genomeAnnotationRows)) {
      setGenomeAnnotationData(
        state,
        annotationRowsToMap(data.genomeAnnotationRows, null, GENOME_ANNOTATION_ID_FIELD),
        data.genomeAnnotationUrl || null,
      );
    } else if (data.genomeAnnotationUrl) {
      await loadAnnotation(data.genomeAnnotationUrl, { genome: true });
    } else if (data.alignmentUrl) {
      const sibling = siblingAnnotationUrl(data.alignmentUrl, GENOME_ANNOTATION_SUFFIX);
      if (sibling) await loadAnnotation(sibling, { optional: true, genome: true });
    }

    if (destroyed) return;
    applyAndRender(next);
    emitChange();
  }

  function dataDescriptorChanged(next) {
    const a = current.data || {};
    const b = next.data || {};
    return a.rows !== b.rows
      || a.geneAnnotationRows !== b.geneAnnotationRows
      || a.genomeAnnotationRows !== b.genomeAnnotationRows
      || a.alignmentUrl !== b.alignmentUrl
      || a.geneAnnotationUrl !== b.geneAnnotationUrl
      || a.genomeAnnotationUrl !== b.genomeAnnotationUrl;
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  const controls = current.controls
    ? createControls({
      state,
      refs,
      render,
      emitChange,
      getRenderData: () => canvasRenderer.getRenderData(),
      markWebGLDirty: () => webgl.markDirty(),
      exportPNG: () => toPNGBlob({ state, refs, webglCanvas: webgl.canvas }),
      exportSVG: () => handle.toSVG(),
      setCollapsed: (collapsed) => { controlsCollapsed = collapsed; emitChange(); },
    })
    : null;

  // ── Handle ────────────────────────────────────────────────────────────────

  const handle = {
    update(nextConfig = {}) {
      assertLive('update');
      validateConfig(nextConfig);
      const next = { ...defaultConfig(), ...nextConfig };

      if (next.controls !== current.controls) {
        throw new Error('update(): changing `controls` requires a remount — call destroy() and mount() again');
      }

      const reload = dataDescriptorChanged(next);
      current = next;
      controlsCollapsed = next.controlsCollapsed;
      if (controls) controls.setCollapsed(next.controlsCollapsed);

      if (reload) {
        loadData(next);
      } else {
        applyAndRender(next);
      }
    },

    toSVG() {
      assertLive('toSVG');
      return renderSVG({
        state,
        renderData: canvasRenderer.getRenderData(),
        width: refs.canvas.width,
        height: refs.canvas.height,
      });
    },

    toPNG(scale = 1) {
      assertLive('toPNG');
      return toPNGBlob({ state, refs, webglCanvas: webgl.canvas }, scale);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (controls) controls.destroy();
      zoomInteraction.destroy();
      webgl.destroy();
      canvasRenderer.destroy();
      changeListeners.clear();
      errorListeners.clear();
      refs.root.innerHTML = '';
      refs.root.classList.remove('gmd-root', 'gmd-no-controls');
      refs.root.removeAttribute('data-theme');
    },

    /** Current config, including anything the user changed through the sidebar. */
    getConfig() {
      assertLive('getConfig');
      return configFromState(state, { controls: current.controls, controlsCollapsed });
    },

    /** Subscribe to config changes. Returns an unsubscribe function. */
    onChange(listener) {
      assertLive('onChange');
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },

    /**
     * Subscribe to data-loading failures. Returns an unsubscribe function.
     * Only relevant when the config references data by URL; a caller that supplies
     * rows has already done its own loading.
     */
    onError(listener) {
      assertLive('onError');
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
  };

  controlsCollapsed = current.controlsCollapsed;
  if (controls) controls.setCollapsed(controlsCollapsed);

  const data = current.data || {};
  const hasData = Array.isArray(data.rows) || data.alignmentUrl;
  if (hasData) {
    loadData(current);
  } else {
    applyAndRender(current);
  }

  return handle;
}
