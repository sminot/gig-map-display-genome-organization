# Pangenome Viewer

A browser-based tool for visualizing gene presence/absence patterns across a collection
of microbial genomes. Built on output from the
[gig-map](https://github.com/FredHutch/gig-map) alignment pipeline.

**Live app:** https://sminot.github.io/gig-map-display-genome-organization/

It is also an **embeddable library**: the same code mounts into a DOM node owned by
another application. See [Using it as a library](#using-it-as-a-library).

---

## Table of Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Features](#features)
- [Input file formats](#input-file-formats)
- [Self-hosting](#self-hosting)
- [Using it as a library](#using-it-as-a-library)
- [For developers](#for-developers)

---

## What it does

Pangenome Viewer renders gene presence/absence data as an interactive circular figure.
Each ring represents one genome:

- **Outer ring** — the reference genome you select. Contigs appear as indigo arcs;
  contigs of at least 50 kbp are labelled.
- **Inner rings** — the other genomes. Where a gene aligns to the reference at that
  position, the arc is filled with that genome's colour. Where no alignment exists,
  there is a gap.

This makes it easy to see:

- **Core genes** — filled arcs across every ring
- **Accessory genes** — present in some genomes, absent in others
- **Unique genes** — present only in the reference, or only in one other genome

No data is uploaded anywhere. All processing happens in your browser.

---

## Quick start

Open https://sminot.github.io/gig-map-display-genome-organization/ — it loads a
*Fusobacterium* demo dataset.

To view your own data, see [Self-hosting](#self-hosting): put your files in a `data/`
folder next to a copy of `index.html` and serve the folder. To point the hosted app at
a file you already serve somewhere with CORS enabled, pass it as a URL parameter:

```
?data=https://example.org/my-project.genomes.aln.csv.gz
```

---

## Features

### Reference genome

Search and pick the reference in the sidebar. The circular layout reorganises around
that genome's contigs. Any genome in the dataset can serve as the reference.

### Genome selection and ordering

Each non-reference genome is a checkbox. Filter the list by name, or use **All** /
**None**. **Sort by gene content** reorders the rings so neighbouring rings share gene
content, by a greedy nearest-neighbour walk over gene-presence similarity — useful for
spotting clades without a tree.

### Gene annotations

Load a per-gene annotation table to highlight genes on an outer track.

- Pick a column with **Group by**; its values become selectable categories, each with a
  count of *(genes on the reference / genes in the table)*.
- Tick the categories to highlight. Click a swatch to override its colour.
- **Name col.** chooses which column supplies the gene name in the tooltip.

### Genome annotations

Load a per-genome metadata table to colour, group, sort and label the rings.

- **Color by** — colour rings by any column, using a selectable palette.
- **Group by** — group and sort rings by a column; overrides **Color by** and
  **Sort by**.
- **Name col.** — show a friendlier name than the genome id, in the sidebar and the
  tooltip.
- **Tooltip cols.** — extra columns to list in the tooltip.
- **Sort by** / **Order** — ring order, ascending or descending. Genomes missing from
  the table sort last either way.

### Zoom wedge

Hover the circle and scroll to magnify a region; the wedge outside the circle shows it
enlarged. Click and drag to move the wedge. **Wedge**, **Gap** and **Height** control
its width, its distance from the circle, and how much of the viewport it takes.
**Reset Zoom** or the **✕** on the region readout returns to the full circle. The
readout shows the region in base pairs.

### Tooltip

Hover any arc for the gene id, the genome, the position on the contig, percent identity
and coverage, plus any annotation columns you selected.

### Export

| Button | Result |
|---|---|
| **SVG** | Vector export. Every layer is real geometry — no embedded raster. |
| **PNG** | Raster snapshot at screen resolution. |
| **Embed** | Copies an `<iframe>` snippet for the current view to the clipboard. |

An SVG of a 70-genome view is a few megabytes: the figure genuinely contains hundreds
of thousands of arcs. Hide genomes you do not need before exporting if size matters.

### Shareable state

The URL always reflects what you are looking at — reference genome, visible genomes,
annotation columns and selected categories, colour overrides, palette, sort, theme,
zoom. Copy the address bar to share a view. Links made by earlier versions still work.

### Theme

The sun/moon button toggles light and dark. The choice is remembered and is part of the
shareable URL.

---

## Input file formats

### Main alignment file

`genomes.aln.csv.gz` — gzip-compressed CSV, the standard output of the gig-map
pipeline. One row per gene-to-genome alignment.

| Column | Description |
|---|---|
| `qseqid` | Contig or chromosome ID |
| `sseqid` | Gene or protein ID |
| `pident` | Percent identity of the alignment |
| `length` | Alignment length (bp) |
| `qstart` | Gene start position on the contig |
| `qend` | Gene end position on the contig |
| `qlen` | Total contig length |
| `sstart` | Alignment start within the gene |
| `send` | Alignment end within the gene |
| `slen` | Total gene length |
| `genome` | Genome identifier |
| `coverage` | Percent of the gene covered by the alignment |

### Gene annotation file

Optional. `genes.annot.csv.gz`, or CSV/TSV with or without gzip.

- **Column 1** — gene ID, matching `sseqid` in the alignment file.
- **Remaining columns** — annotation values, one column per annotation type.

### Genome annotation file

Optional. `genomes.annot.csv.gz`, or CSV/TSV with or without gzip.

- **Genome ID** — the `genome_id` column if present, otherwise column 1. Must match
  `genome` in the alignment file.
- **Remaining columns** — annotation values.

---

## Self-hosting

No build step, no npm, no server-side logic. One `index.html` loads the app from the
[jsDelivr](https://www.jsdelivr.com/) CDN; you supply the data.

1. **Copy `demo/index.html`.** It is 11 lines: a single `<script>` tag pointing at
   `pangenome-loader.js` at a pinned version tag.

2. **Add your data.** Create a `data/` folder next to `index.html` containing
   `genomes.aln.csv.gz`, and optionally `genes.annot.csv.gz` and
   `genomes.annot.csv.gz`. The app auto-loads them on startup. For a differently named
   alignment file, pass `?data=data/your-file.genomes.aln.csv.gz`.

3. **Serve the folder** with any static file server:
   ```bash
   python3 -m http.server 8080
   ```

4. **Open** http://localhost:8080.

To upgrade, change the version tag in that one `<script>` tag. Releases:
https://github.com/sminot/gig-map-display-genome-organization/releases

If your page already declares an import map, `pangenome-loader.js` will say so and
stop; add `d3` and `papaparse` to your own map and load `src/standalone.js` from the
CDN yourself.

---

## Using it as a library

Pin a **tag**, never a branch, so builds are reproducible:

```jsonc
// package.json
"dependencies": {
  "gig-map-display-genome-organization": "github:sminot/gig-map-display-genome-organization#v2.0.0"
}
```

```js
import { mount } from 'gig-map-display-genome-organization';
import 'gig-map-display-genome-organization/style.css';

const handle = mount(container, {
  // Data is referenced, not embedded. Hand over rows you already have…
  data: { rows: alignmentRows, geneAnnotationRows, genomeAnnotationRows },
  // …or a URL, and the display fetches and parses it itself.
  // data: { alignmentUrl: '/api/alignment.csv.gz' },

  referenceGenome: 'GCF_000158275.2_ASM15827v2_genomic.fna.gz',
  visibleGenomes: null,                 // null = every genome except the reference
  geneAnnotation: { categoryColumn: 'bin', selectedCategories: ['Bin 1'] },
  genomeAnnotation: { colorColumn: 'source', palette: 'Set2' },
  zoom: { zoomLevel: 6, focusAngle: 1.4 },
  theme: 'dark',
  controls: false,                      // mount the figure alone, no sidebar
});

handle.update({ ...config, theme: 'light' });   // re-render in place; never remounts
const svg = handle.toSVG();                     // vector export
const png = await handle.toPNG(0.25);           // thumbnail
handle.destroy();                               // required on unmount
```

`style.css` is scoped entirely under `.gmd-root`, so it cannot leak into your own
styles — including a Tailwind layer.

### `destroy()` is not optional

Each display holds a **WebGL context**. Browsers allow only a handful of live contexts
— roughly 16 in Chrome — and silently drop the oldest beyond that, at which point a
display goes blank with **no error**. If you mount and unmount on tab or selection
changes, call `destroy()` every time. `liveContextCount()` is exported so you can
assert this in your own tests.

### `GenomeDisplayConfig`

A display is fully described by a serializable config: store it, restore it, and you
get the same figure back — exactly, not approximately.

- **JSON Schema**: [`schema/genome-display-config.schema.json`](schema/genome-display-config.schema.json),
  importable as `gig-map-display-genome-organization/schema`.
- **TypeScript**: [`types/index.d.ts`](types/index.d.ts), wired into the `exports` map.
- **Validation**: `validateConfig(config)` throws on the first violation, including on
  unknown properties, so a config from a newer version fails loudly instead of
  rendering something subtly wrong.
- **Versioning**: `version` is an integer; the migration policy is in
  [DESIGN.md](DESIGN.md#config-versioning).

Two things the config does **not** contain, both by design: the derived d3 colour
scales (rebuilt deterministically from the palette, the column and the rows) and the
canvas pixel size (the display is responsive and follows its container). Full list and
rationale in [DESIGN.md](DESIGN.md#render-affecting-state-that-is-not-in-the-config).

### Reading state back

`mount()` returns the four contract methods plus two additions, because a host that
renders the sidebar needs to know what the user did:

```js
const config = handle.getConfig();              // what is on screen right now
const stop = handle.onChange((config) => save(config));   // fires on any change
```

### Bundling

`d3` and `papaparse` are `dependencies`, left external in the library build so your
bundler dedupes them against your own copies. The bundle is ~83 kB (~24 kB gzipped)
and is a good candidate for `lazy(() => import(...))`.

---

## For developers

### Stack

- [D3](https://d3js.org/) — arc geometry, scales, colour
- [Papa Parse](https://www.papaparse.com/) — CSV/TSV parsing
- Canvas 2D for the circle, WebGL2 for the zoom wedge, SVG for labels

### Running the app locally

No installation needed. Serve the repository root with any static file server:

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. The app is ES modules with an import map; there is no
build step and changes take effect on refresh. If you have npm, `npm run dev` serves
the same page through Vite instead.

### Building the library

```bash
npm install
npm run build        # -> dist/gig-map-display.js
```

`npm install` runs this automatically via `prepare`, which is also what makes a
`github:` dependency work for consumers.

### Tests

```bash
npm run test:unit      # node --test: config, state isolation, URL state
npm run test:browser   # Playwright: instance isolation, destroy(), export
npm test               # both
```

The browser tests need a real WebGL2 context; the Playwright config enables
SwiftShader so headless runs check the WebGL assertions rather than skipping them.

### Architecture

Read [DESIGN.md](DESIGN.md) before your first change. The two invariants most likely to
be broken by accident:

1. **No module-level mutable state, no DOM ids, and no `document`-wide queries.** Two
   displays must be able to coexist on one page.
2. **The standalone app and the library are the same code.** `src/standalone.js` is a
   thin caller of `mount()` with no privileged path. A change that helps one purpose
   and breaks the other is not done.

---

## License

See [LICENSE](LICENSE).
