# Pangenome Circular Viewer — design

How this repository is put together and why. For usage, see [README.md](README.md).

## Two purposes, one codebase

This repository is **both** a standalone app deployed to GitHub Pages and a library
that other applications embed. Neither purpose may break the other.

| | Entry point | How it loads |
|---|---|---|
| Standalone app | `src/standalone.js`, via `index.html` | ES modules, no build step |
| Library | `src/index.js`, built to `dist/gig-map-display.js` | `vite build` |

The standalone app is a thin caller of `mount()`. It has no privileged path into the
rendering code: everything it does — loading data, choosing a reference genome,
setting the zoom — a library caller can do through `GenomeDisplayConfig`. That is
enforced by construction rather than by discipline, because there is only one
`mount()`.

The test for any change: *could the standalone app ship this and still make sense on
its own?* Anything specific to one consumer — a colour token, a fetch URL, a session
id — goes in through `config`, never hardcoded here.

### Why the app has no build step

`index.html` loads `src/standalone.js` as a module with relative imports, and an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)
resolves `d3` and `papaparse` to CDN ESM builds. Consequences:

- any static file server hosts the repository as-is (`python3 -m http.server`);
- the GitHub Pages workflow publishes the repository root with nothing to build;
- `pangenome-loader.js` can serve the whole app from jsDelivr at a pinned tag;
- the same source, with the same bare specifiers, is bundled for the library by
  Vite, which resolves them from `node_modules` instead.

Adding an app build step would make the standalone app *harder* to serve than it is
now, and would put a compile between the source and what the browser runs. `vite
build` therefore produces only the library.

## Instance-scoped state

**There is no module-level mutable state anywhere in `src/`.** This is the single most
important invariant in the codebase, and it is load-bearing for the library purpose.

Until v2, `data-contract.js` declared `AppState`, `GeneAnnotationState` and
`GenomeAnnotationState` as script-scope `const` singletons, and every other script
read and wrote them through `window`. Its header said *"Loaded first by index.html;
every other script may read these objects."* That contract is gone. It had two
consequences that made the library purpose impossible:

1. there was nothing to import — the public surface was a set of `window` properties
   installed as a side effect of script order;
2. **two displays on one page shared one state object** and corrupted each other.

Now `createState()` returns a fresh object per mount, and every function that reads
or writes state takes it as an argument:

```js
// src/state.js
export function createState() {
  return {
    rows, allGenomes, referenceGenome, visibleGenomes, customGenomeOrder,
    sourceUrl, theme,
    geneAnnot: createGeneAnnotationState(),
    genomeAnnot: createGenomeAnnotationState(),
    zoom: createZoomState(),
  };
}
```

Each subsystem is a factory that closes over one instance's `state` and `refs` and
returns an object with a `destroy()`: `createCanvasRenderer`, `createWebGLRenderer`,
`attachZoomInteraction`, `createControls`. `mount()` owns them and is the only thing
that wires them together.

Two supporting rules follow from this and are just as binding:

- **DOM hooks are classes, never ids.** Ids are global; two displays cannot share
  them. Every ref is resolved by querying inside the instance's root element, never
  through `document`. The handful of ids that accessibility genuinely needs
  (`label[for]`, `aria-controls`) are suffixed with a per-instance counter in
  `src/dom.js`.
- **CSS is scoped under `.gmd-root`.** `style.css` used to style `:root`, `html` and
  `body`; it would have fought a host application's own stylesheet. Every selector is
  now prefixed, the design tokens live on `.gmd-root`, the theme attribute is set on
  the instance root rather than `documentElement`, and the one keyframe animation is
  namespaced (`gmd-spin`).

`test/unit/state-isolation.test.js` and `test/browser/isolation.spec.js` pin all of
this: they mount two displays and mutate one.

## The mount contract

```ts
function mount(el: HTMLElement, config?: GenomeDisplayConfig): DisplayHandle;

interface DisplayHandle {
  update(config: GenomeDisplayConfig): void;   // re-render in place; never remounts
  toSVG(): string;                             // vector export
  toPNG(scale?: number): Promise<Blob>;        // raster snapshot, for thumbnails
  destroy(): void;                             // release context, listeners, observers

  getConfig(): GenomeDisplayConfig;            // what is on screen right now
  onChange(fn): () => void;                    // config changed, e.g. via the sidebar
}
```

`getConfig()` and `onChange()` are additions beyond the shared contract. Without them
a host application can see a display but cannot persist what the user did to it.

Four properties are load-bearing:

**`destroy()` must release the WebGL context.** This matters more here than anywhere
else in the codebase. `src/webgl-renderer.js` holds a WebGL2 context per instance, and
a browser allows only a handful of live contexts — roughly 16 in Chrome — before
silently dropping the oldest. A display whose context was dropped goes blank with no
error and nothing in the console. Deleting the buffers, VAOs and program does *not*
free the context; only `WEBGL_lose_context.loseContext()` does. `destroy()` cancels
the animation frame, disconnects both `ResizeObserver`s, deletes every GPU object,
forces context loss, and detaches the canvas. `liveContextCount()` is exported so a
test can assert non-accumulation, which `test/browser/lifecycle.spec.js` does over 40
mount/destroy cycles.

**`update()` must not remount.** Rehydrating a config and then adjusting one control
should not tear down and rebuild the visualization. `update()` never touches the DOM
structure, the canvas, or the WebGL context; the browser tests assert node identity
across an update. The one exception is toggling `controls`, which would require
rebuilding the markup — that throws rather than silently remounting.

**`toSVG()` is vector for every layer**, not a canvas readback. See below.

**`config` is the whole render-affecting state.** See below.

## GenomeDisplayConfig

`schema/genome-display-config.schema.json` is the normative definition;
`types/index.d.ts` mirrors it for TypeScript callers, and `validateConfig()` enforces
it. A unit test asserts the schema and `defaultConfig()` describe the same properties,
so the three cannot drift apart.

The rule the config exists to satisfy: **a stored config plus the referenced data
reproduces a display exactly, not approximately.** `test/browser/export.spec.js`
asserts a rehydrated display produces byte-identical canvas pixels *and* a
byte-identical SVG export.

### Data is referenced, not embedded

`config.data` carries either URLs, which the display fetches, or rows, which the
caller supplies. Rows win, so a host whose backend has already subset the alignment
never triggers a fetch. This matters at real scale: the demo alignment is 3.5 MB
gzipped, but the *Escherichia* equivalent is 205 MB and 7.9M rows, and a browser must
never see that whole. `configFromState()` never writes rows out, so a persisted config
stays small.

### Render-affecting state that is not in the config

Everything in the config is a *choice*. Three kinds of state are deliberately absent
because they are not choices:

**Derived, so rebuilt rather than stored.** The d3 ordinal colour scales
(`geneAnnot.scale`, `genomeAnnot.scale`, `genomeAnnot.groupScale`, and the default
genome scale) are functions and cannot be serialized. They are rebuilt from the
palette name, the active column and the annotation rows. That reconstruction has to be
*deterministic*, or rehydration would only be approximate — which is why gene category
values are ordered by descending count **and then ascending value**. Before v2 the tie
break was the order rows happened to arrive in, so the same data in a different order
could produce different colours. `zoom.displayRadiusScale` is likewise derived, from
`zoomLevel` and `wedgeHeightScale`.

**Transient input state.** `zoom.isHovering`, tooltip visibility, whether the
reference-genome combobox is open, and the two sidebar filter boxes. None of these
changes the figure; the filter boxes narrow which *controls* are listed, not which
genomes are drawn.

**The canvas pixel size.** The display is responsive: it follows its container through
a `ResizeObserver`. Pinning pixel dimensions in the config would fight that. A
consequence worth knowing: a rehydrated display reproduces the same figure, but at
whatever size its container gives it.

Animated zoom values are a special case. `zoomLevel`, `focusAngle` and
`displayRadiusScale` are spring-interpolated toward targets. The config stores the
**targets**, and `applyConfigToState()` calls `snapToTargets()` so rehydration
reproduces the view instead of animating into it from wherever the defaults were.

### Config versioning

`version` is an integer, currently `1`. The policy:

- A reader **rejects** a config whose `version` is greater than the version it was
  built against, loudly. A newer field it does not understand could change the figure,
  so a silently degraded render is worse than an error.
- Adding an optional field with a backward-compatible default is **not** a version
  bump. `applyConfigToState()` merges over `defaultConfig()`, so an older config
  simply gets the new default.
- Renaming, removing, or changing the meaning of a field **is** a version bump, and
  ships with a migration from the previous version. Migrations run oldest-first, so
  only adjacent-version steps ever need writing.
- Unknown properties are rejected outright, which is what makes the first rule
  enforceable.

## Rendering

Three layers stack in `.viz-container`, all sized to the container:

| Layer | Technology | Owner | Draws |
|---|---|---|---|
| `.gmd-canvas` | Canvas 2D | `src/canvas-renderer.js` | the full circle |
| `.gmd-webgl` | WebGL2 | `src/webgl-renderer.js` | the magnified wedge |
| `.gmd-overlay` | SVG | `src/canvas-renderer.js` | contig labels |

Canvas 2D rather than SVG for the circle because SVG DOM degrades past ~10k elements
and a 70-genome view is hundreds of thousands of arcs; one rasterized pass handles it.
WebGL for the wedge because it re-projects every arc through an angular magnification
every frame, which is a per-vertex transform.

`src/geometry.js` is the single source of the ring layout in pixels. Four consumers
have to agree on those numbers — the Canvas 2D renderer, the WebGL renderer, pointer
hit-testing and the SVG exporter — and before v2 three of them computed it separately.

`buildRenderData()` resolves annotation colours up front, so neither renderer has to
know the annotation modules exist.

### Vector export

`toSVG()` emits geometry for **every** layer; nothing is rasterised, and there is no
`<image>` or data URI in the output:

| Layer | As |
|---|---|
| Contig ring, genome rings, annotation track | annulus sectors (`A` arc commands) |
| Contig labels | `<text>` |
| Zoom wedge | annulus sectors, with the vertex shader's angular magnification re-derived in JS |
| Zoom indicator | annulus sector |

The wedge is the interesting one. The shader maps a genome angle to a screen angle by
`clamp((geo − focus) × zoom, ±wedgeHalfSpan)` and discards vertices beyond
`dataHalfSpan`. `src/svg-export.js` reproduces that mapping on each arc's endpoints.
Because the mapping is linear in angle, a true arc through the transformed endpoints is
*more* accurate than the shader's 16-segment tessellation, not less.

Arcs are written directly rather than through `d3.arc()`, because output size is the
binding constraint: one `<path>` per ring with one-decimal coordinates is what keeps a
70-genome export large rather than unusable. It is still large — see README.

`toPNG()` is a raster snapshot of the composited layers, for thumbnails. A `scale`
above 1 resamples rather than re-rendering; `toSVG()` is the path for output that has
to scale.

## Repository layout

```
index.html          standalone shell: import map, #app, one module script
src/
  standalone.js     app entry — mount() plus query-string persistence
  index.js          library entry — the public exports
  mount.js          mount(), the DisplayHandle, data loading
  config.js         GenomeDisplayConfig: defaults, apply, extract, validate
  state.js          createState() — instance-scoped state
  dom.js            the markup, and per-instance refs
  geometry.js       ring layout in pixels, shared by all four consumers
  render-data.js    state -> RenderData; reference selection; gene-content ordering
  canvas-renderer.js Canvas 2D circle, hit-testing, tooltip
  webgl-renderer.js  WebGL2 wedge, and the context lifecycle
  zoom-state.js     per-instance spring-animated zoom
  zoom-interaction.js wheel and drag
  gene-annotation.js  gene highlight state
  genome-annotation.js ring colour, grouping, sort order
  export.js         raster composite and download helpers
  svg-export.js     vector export
  controls.js       the sidebar
  url-state.js      query-string <-> config, standalone only
  palettes.js       named d3 palettes
schema/             the JSON Schema for GenomeDisplayConfig
types/              TypeScript declarations
test/unit/          node --test, no browser
test/browser/       Playwright: isolation, lifecycle, export
data/               demo dataset the app auto-loads
demo/               self-hosting example, pinned to a CDN tag
```

## Input data

`data/genomes.aln.csv.gz` — gzip-compressed CSV, BLAST-style alignment output from
[gig-map](https://github.com/FredHutch/gig-map). One row per gene-to-genome alignment.

| Column | Meaning |
|---|---|
| `qseqid` | contig / chromosome id within the genome |
| `sseqid` | gene / protein id |
| `pident` | percent identity |
| `length` | alignment length |
| `qstart`, `qend` | gene position on the contig |
| `qlen` | contig length |
| `sstart`, `send` | alignment position within the gene |
| `slen` | gene length |
| `genome` | genome id |
| `coverage` | percent of the gene covered |

Where the same gene aligns more than once to a genome, the highest-coverage hit wins.
Genes whose `endAngle <= startAngle` are on the reverse strand and are not drawn.

## Layout

- **Outermost**: the gene annotation track, when a category column is active.
- **Next**: the reference genome's contig ring, contigs as indigo bands with a 1.5°
  gap; contigs of at least 50 kbp get a label.
- **Inward**: one ring per visible genome. An arc is drawn where a gene present in the
  reference is also present in that genome; gaps are absences.
- **Ring order**: group column, then sort column, then the gene-content order, then
  alphabetical.
- **The wedge** sits outside the circle when zoomed. Its outer edge is pinned at 97%
  of the viewport radius and the circle shrinks to make room, so a taller wedge means
  a smaller circle rather than an overflowing one.

## Errors

Errors propagate. They are caught in exactly two places, both of which can act on the
failure:

- `mount()` turns a failed fetch or parse into the sidebar's error message, or rethrows
  when there is no sidebar to show it in.
- The sibling-annotation guess (`genomes.aln.csv.gz` -> `genes.annot.csv.gz`) is
  optional by construction: a 404 there means "this dataset has no annotations", which
  is normal.

Everything else — a bad shader, an unparseable config, a method called after
`destroy()` — throws with context.

## Open questions

- Filtering genes by a `pident` or `coverage` threshold.
- Colouring arcs by `pident` rather than presence/absence.
- Continuous (numeric) gene annotations; the track is categorical today.
- The animation loop runs a `requestAnimationFrame` per instance even at rest. It does
  almost nothing when nothing is animating, but a host with many simultaneous displays
  would be better served by a shared loop.
