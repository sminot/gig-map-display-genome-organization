# Pangenome Viewer

A browser-based tool for visualizing gene presence/absence patterns across a collection of microbial genomes. Built on output from the [gig-map](https://github.com/FredHutch/gig-map) alignment pipeline.

**Live app:** https://sminot.github.io/gig-map-display-genome-organization/

---

## Table of Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Features](#features)
  - [Loading data](#loading-data)
  - [Reference genome selection](#reference-genome-selection)
  - [Genome toggles](#genome-toggles)
  - [Gene annotations](#gene-annotations)
  - [Genome annotations](#genome-annotations)
  - [Region selection (blowout)](#region-selection-blowout)
  - [Export](#export)
- [Input file formats](#input-file-formats)
  - [Main alignment file](#main-alignment-file)
  - [Gene annotation file](#gene-annotation-file)
  - [Genome annotation file](#genome-annotation-file)
- [For developers](#for-developers)

---

## What it does

Pangenome Viewer renders gene presence/absence data as an interactive circular figure. Each ring in the figure represents one genome:

- **Outermost ring** — the reference genome you select. Contigs appear as colored arcs; large contigs are labeled by name.
- **Inner rings** — all other genomes. Where a gene aligns to the reference at that position, the arc is filled with that genome's color. Where no alignment exists, there is a gap.

This layout makes it easy to identify:

- **Core genes** — filled arcs across every ring
- **Accessory genes** — present in some genomes, absent in others
- **Unique genes** — present only in the reference (or only in one other genome)

No data is uploaded to any server. All processing happens in your browser.

---

## Quick start

1. Open the app at https://sminot.github.io/gig-map-display-genome-organization/
2. Drag and drop your `genomes.aln.csv.gz` file onto the page (or use the file picker).
3. The circular figure renders immediately. Use the sidebar to select a reference genome, toggle which genomes are shown, or upload annotation files.

An example dataset is available in the `example/` folder of this repository (`example/genomes.aln.csv.gz`).

---

## Features

### Loading data

Drag and drop a `genomes.aln.csv.gz` file (the output of the gig-map pipeline) anywhere on the page. The file is parsed entirely in your browser — nothing is sent to a server.

### Reference genome selection

Use the **Reference Genome** dropdown in the sidebar to select which genome is displayed as the outermost ring. The circular layout reorganizes around that genome's contigs. Any genome in the dataset can serve as the reference.

### Genome toggles

Each genome in your dataset appears as a checkbox in the sidebar. Check or uncheck individual genomes to show or hide their rings. Use the **All** and **None** buttons to toggle everything at once.

### Gene annotations

Upload a gene annotation file (CSV or TSV, optionally gzip-compressed) to overlay functional or other per-gene information on the figure.

- The first column must contain gene IDs matching the `sseqid` values in your alignment file.
- Additional columns are the annotation values. Select which column to display using the **Active annotation** control.

Rendering depends on value type:

| Value type | Rendering |
|---|---|
| Categorical (text) | Colored arcs per category; color legend in the sidebar |
| Continuous (numeric) | Radial bars with height proportional to value, colored with the viridis scale |

Hover over any arc to see the annotation value in a tooltip.

### Genome annotations

Upload a genome annotation file (CSV or TSV, optionally gzip-compressed) to color and sort genome rings by metadata such as isolation source, clade, or any categorical variable.

- The first column must contain genome IDs matching the `genome` values in your alignment file.
- Additional columns are categorical annotation values.

You can:

- **Color rings** by any annotation column using a selectable color palette (Tableau10, Set1, Set2, and others). A legend appears in the sidebar.
- **Sort rings** by any annotation column, ascending or descending.

### Region selection (blowout)

Click and drag on the circular figure to select an angular region. The selected region expands outward, magnifying the arcs in that zone and displaying gene ID labels.

- Multiple regions can be selected at the same time.
- Click a selected region to remove it.
- Press **Escape** to clear all selections.

### Export

Download the figure using the export controls in the sidebar:

| Format | Notes |
|---|---|
| PNG | Raster image at screen resolution |
| PDF | Opens the browser print dialog; choose "Save as PDF" |
| Standalone HTML | Self-contained file that can be opened offline and retains interactivity |

---

## Input file formats

### Main alignment file

**Filename:** `genomes.aln.csv.gz` (gzip-compressed CSV)

This is the standard output of the gig-map pipeline. Each row is one gene-to-genome alignment.

| Column | Description |
|---|---|
| `qseqid` | Contig or chromosome ID |
| `sseqid` | Gene or protein ID |
| `pident` | Percent identity of the alignment |
| `length` | Alignment length (bp) |
| `qstart` | Gene start position on the contig |
| `qend` | Gene end position on the contig |
| `qlen` | Total contig length |
| `sstart` | Alignment start position within the gene |
| `send` | Alignment end position within the gene |
| `slen` | Total gene length |
| `genome` | Genome identifier |
| `coverage` | Fraction of the gene covered by the alignment (%) |

### Gene annotation file

Optional. CSV or TSV, with or without gzip compression.

- **Column 1:** Gene ID — must match `sseqid` values in the alignment file.
- **Remaining columns:** Annotation values (one column per annotation type). Values can be text (categorical) or numeric (continuous).

### Genome annotation file

Optional. CSV or TSV, with or without gzip compression.

- **Column 1:** Genome ID — must match `genome` values in the alignment file.
- **Remaining columns:** Categorical annotation values (one column per annotation type).

---

## For developers

### Stack

The app is a fully static site with no build step. Dependencies are loaded from CDN:

- [D3.js v7](https://d3js.org/) — visualization and DOM manipulation
- [Papa Parse](https://www.papaparse.com/) — CSV/TSV parsing

### Source files

| File | Role |
|---|---|
| `index.html` | Page layout and DOM structure |
| `style.css` | Dark theme styles |
| `data-contract.js` | Shared application state definitions |
| `app.js` | Data loading and parsing |
| `annotation.js` | Gene annotation overlay rendering |
| `genome-viz.js` | Core D3/Canvas circular visualization |
| `controls.js` | UI event wiring |

### Running locally

No installation required. Serve the repo root with any static file server:

```bash
python3 -m http.server
```

Then open http://localhost:8000 in your browser.

### Contributing

Pull requests are welcome. Because there is no build system, changes take effect immediately when you refresh the page. The `example/` directory contains a sample dataset you can use to test your changes.

---

## License

See [LICENSE](LICENSE).
