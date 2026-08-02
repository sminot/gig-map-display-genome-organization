/**
 * Standalone app entry point.
 *
 * Mounts one display over the whole page with the sidebar enabled, seeds it from
 * the query string, and writes user changes back to the query string. Everything
 * it does is available to a library caller too — it holds no privileged path.
 */

import { mount } from './mount.js';
import { configFromUrl, urlFromConfig } from './url-state.js';

const THEME_STORAGE_KEY = 'theme';

function storedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // Private-mode or a blocked storage partition: fall back to the default.
    return 'dark';
  }
}

function rememberTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the theme is not worth failing a render over.
  }
}

export function startStandaloneApp(container = document.getElementById('app') || document.body) {
  const handle = mount(container, configFromUrl(window.location.search, { theme: storedTheme() }));

  handle.onChange((config) => {
    rememberTheme(config.theme);
    const query = urlFromConfig(config);
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  });

  return handle;
}

startStandaloneApp();
