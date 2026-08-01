/**
 * Library entry point.
 *
 * The standalone app is `standalone.js`, which is a thin caller of `mount()`. Both
 * purposes go through the same code, so a change that breaks one breaks the other
 * visibly rather than silently.
 *
 * Styles are not injected automatically. Import them once per page:
 *   import 'gig-map-display-genome-organization/style.css';
 * Every rule is scoped under `.gmd-root`, so nothing leaks into the host app.
 */

export { mount } from './mount.js';
export {
  CONFIG_VERSION, defaultConfig, validateConfig, configFromState, applyConfigToState,
} from './config.js';
export { PALETTE_NAMES } from './palettes.js';
export { liveContextCount } from './webgl-renderer.js';
