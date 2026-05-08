# Pangenome Circular Viewer — Design Specification

## Overview

A static single-page web application for visualizing gene presence/absence across a collection of genomes in a pangenome. Users drag-and-drop a `genomes.aln.csv.gz` file; the app parses it entirely client-side and renders an interactive circular genome browser.

## Input Data Format

**File**: `genomes.aln.csv.gz` — gzip-compressed CSV, BLAST-style alignment output.

| Column | Name | Description |
|--------|------|-------------|
| 0 | *(index)* | Row number |
| 1 | `qseqid` | Contig/chromosome ID within the genome |
| 2 | `sseqid` | Gene/protein ID (the gene being searched) |
| 3 | `pident` | Percent identity of the alignment |
| 4 | `length` | Alignment length |
| 5 | `qstart` | Start position of the gene on the contig |
| 6 | `qend` | End position of the gene on the contig |
| 7 | `qlen` | Total length of the contig |
| 8 | `sstart` | Start position within the gene sequence |
| 9 | `send` | End position within the gene sequence |
| 10 | `slen` | Total gene length |
| 11 | `genome` | Genome identifier |
| 12 | `coverage` | Fraction of the gene covered by the alignment |

Each row = one gene (`sseqid`) found at position `qstart`–`qend` on contig `qseqid` within genome `genome`.

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Geometry / data binding | D3.js v7 (CDN) | Best-in-class arc math, scales, quadtrees; ISC license, actively maintained |
| Rendering | HTML5 Canvas | SVG DOM degrades past ~10k elements; Canvas handles 60k arcs in one rasterized pass |
| Tooltip / label overlay | SVG (thin layer over Canvas) | Clean hit-testing; no DOM overhead for arcs |
| Gzip decompression | Native `DecompressionStream` API | No dependency; 92%+ browser support; falls back to pako |
| CSV parsing | Papa Parse (CDN) | Battle-tested, handles edge cases |
| Framework | Vanilla JS | No build step; deploys directly as static files; D3 data-join idiom fights React/Vue lifecycle |
| Deployment | GitHub Pages (`gh-pages` branch) | Static, no server required |

## File Structure

```
index.html       — HTML shell, CDN imports, drag-drop zone, layout scaffold
style.css        — Layout, drag-drop styling, controls, tooltip, color palette
app.js           — File ingestion, gzip decompression, CSV parsing, app state
genome-viz.js    — D3/Canvas circular visualization engine
controls.js      — Genome selector, ring toggles, event wiring
```

## Shared Data Contract

This interface is agreed upon by all modules. `app.js` produces it; `genome-viz.js` and `controls.js` consume it.

### `AppState` object (module-level singleton)

```javascript
const AppState = {
  // Raw parsed rows
  rows: [],   // Array of row objects (see column map above)

  // All genome IDs found in the file
  allGenomes: [],   // string[]

  // Currently selected reference genome
  referenceGenome: null,   // string | null

  // Genomes toggled visible (excludes reference)
  visibleGenomes: new Set(),   // Set<string>
};
```

### `RenderData` object (computed from AppState, passed to genome-viz.js)

```javascript
const RenderData = {
  // Reference genome contigs in display order, with cumulative base offsets
  contigs: [
    // { id: string, length: number, cumStart: number }
  ],
  totalLength: 0,   // sum of all reference contig lengths (for angle mapping)

  // Genes present in the reference genome
  referenceGenes: new Map(),
  // key = sseqid (gene ID)
  // value = { contigId, qstart, qend, startAngle, endAngle, midAngle }

  // For each non-reference genome: Set of gene IDs present
  genomeGenes: new Map(),
  // key = genome ID
  // value = Set<string> of sseqid values

  // Ordered list of visible genome IDs (for ring assignment)
  visibleGenomes: [],   // string[]

  // Color scale: genome ID → CSS color string
  colorScale: null,   // d3 scale
};
```

## Visualization Layout

```
                  ┌──────────────────────────────────────────┐
                  │           Genome Ring Legend              │
                  │                                           │
                  │        [ring N] Genome N                  │
                  │        [ring 1] Genome 1                  │
                  │    ╔═══════════════════════╗              │
                  │    ║  ╔═══════════════╗    ║              │
                  │    ║  ║  ╔═══════╗   ║    ║              │
                  │    ║  ║  ║ ref   ║   ║    ║              │
                  │    ║  ║  ╚═══════╝   ║    ║              │
                  │    ║  ╚═══════════════╝    ║              │
                  │    ╚═══════════════════════╝              │
                  └──────────────────────────────────────────┘
```

- **Innermost ring**: Reference genome contig map. Contigs are colored bands; inter-contig gaps are small dark gaps. Contig names rendered as arc labels.
- **Rings 1..N (outward)**: One ring per visible non-reference genome. Each ring spans the full 360°. An arc is drawn (filled with the genome's color) wherever a gene present in the reference genome is also present in this genome. Where a gene is absent there is no arc.
- **Ring ordering**: Alphabetical by genome ID (consistent across reference changes).
- **Color scheme**: D3 categorical palette (`d3.schemeTableau10` extended), one color per genome.
- **Ring width**: Computed dynamically so all rings fit within the canvas.

## Interactions

| Interaction | Behavior |
|-------------|----------|
| Drag-and-drop `.csv.gz` onto upload zone | Parse file, build state, render visualization |
| Reference genome `<select>` | Recompute `RenderData`, re-render |
| Genome toggle checkboxes | Update `visibleGenomes`, re-render (fast Canvas repaint) |
| Mouseover arc | Tooltip: gene ID, genome ID, position, pident, coverage |
| Mouseout | Hide tooltip |

### Tooltip content
```
Gene:     WP_020807245.1
Genome:   GCF_000014425.1_ASM1442v1_genomic.fna.gz
Position: NC_008530.1:132–1493
Identity: 99.8%
Coverage: 100.0%
```

## Hit Detection

On `mousemove` over the Canvas:
1. Convert `(mouseX, mouseY)` to polar coordinates `(r, θ)` relative to canvas center.
2. Determine which ring (which genome) by `r`.
3. Determine which gene arc by `θ` (binary search over sorted reference gene angles).
4. Look up alignment details for that (genome, gene) pair.

## Performance Notes

- All rendering on Canvas (no SVG arc elements).
- Full Canvas repaint on toggle (~60k arcs, <16ms at this scale).
- CSV parsing in the main thread is fine for files up to a few hundred MB; no Worker needed.
- `DecompressionStream` streams the gzip bytes; Papa Parse parses the resulting text.

## Deployment

- No build step. All dependencies loaded from CDN.
- `index.html`, `style.css`, `app.js`, `genome-viz.js`, `controls.js` are committed to `gh-pages` branch.
- PR preview builds are served from the GitHub Pages URL for the branch.

## Open Questions / Future Extensions

- Filtering genes by `pident` or `coverage` threshold (slider UI).
- Zooming into a contig region.
- Exporting the visualization as a PNG or SVG.
- Coloring arcs by `pident` instead of presence/absence.
