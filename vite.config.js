import { defineConfig } from 'vite';

/**
 * `vite build` produces the library bundle. It does not produce the standalone app.
 *
 * The app is deliberately buildless: index.html loads `src/standalone.js` as an ES
 * module with relative imports, and an import map resolves d3 and Papa Parse from a
 * CDN. Any static file server can host the repository as-is, which is what the
 * GitHub Pages deployment and the jsDelivr self-hosting path both rely on. Adding
 * an app build step would make the standalone app harder to serve, not easier.
 *
 * `vite dev` still serves index.html for contributors who have npm installed; Vite
 * resolves the bare specifiers from node_modules and ignores the import map.
 *
 * d3 and Papa Parse stay external so a host application dedupes them against its
 * own copy instead of shipping two.
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'gig-map-display.js',
    },
    rollupOptions: {
      external: ['d3', 'papaparse'],
    },
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true,
  },
});
