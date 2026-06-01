# Pangenome Viewer — Demo

A self-contained deployment of the Pangenome Viewer. All app code is loaded
from the jsDelivr CDN; only the data files live locally.

## Serve it

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser. The visualization loads automatically.

## Use your own data

Replace the files in `data/` with your own output from the
[gig-map](https://github.com/FredHutch/gig-map) pipeline:

| File | Required | Description |
|------|----------|-------------|
| `data/genomes.aln.csv.gz` | Yes | Alignment data (gzip-compressed CSV) |
| `data/genes.annot.csv.gz` | No | Per-gene annotations |
| `data/genomes.annot.csv.gz` | No | Per-genome metadata |

The app auto-loads `data/genomes.aln.csv.gz` on startup and auto-derives the
annotation file paths from the same prefix. If your alignment file has a
different name, pass it as a URL parameter:

```
http://localhost:8080/?data=data/myproject.genomes.aln.csv.gz
```

## Upgrading

The version pinned in `index.html` (`@v1.0.1`) can be updated to any later
release by replacing that string in every `<script>` and `<link>` tag.
Latest releases: https://github.com/sminot/gig-map-display-genome-organization/releases
