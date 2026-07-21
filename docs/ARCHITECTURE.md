# gig-map figure generator — Architecture & Contract

> Rebrand note: the product is now the **gig-map figure generator**; the internal
> analysis-function concept is called a **figure** throughout the code (`figures/`
> packages, `FigureModule`/`FigureSpec`). The HTTP contract is unchanged — route paths
> (`/api/functions`, `/api/run/{functionId}`, …) and the `functionId`/`function_id`
> id field keep their names.

This is the single source of truth shared by all implementation agents. Backend and
frontend are built in parallel against the API contract defined here. Field names in
this document are normative — do not rename them on one side only.

## 0. Ground truth (from the committed `./datasets/` fixture — R. torques n=29)
- Pangenome "Ruminococcus torques (n=29)": **168 bins, 29 genomes, 5824 genes**.
- **Core-genome bin = `Bin 4`** (present in 28 genomes at prop_genes_detected≥0.9, 374 genes). Tests assert this.
- Contrast "GvHD Cohorts - Ruminococcus torques": 168 association features, 392 samples.
- Contrast "HallAB_2017 - Ruminococcus torques": present too (second contrast set → enables compare-contrasts for one organism).
- Phylogenies "Ruminococcus torques": 121 RAxML trees (`Bin N.msa.raxml.bestTree`).

## 1. Repository layout (new; on branch `feat/pangenome-explorer-app`)
Legacy static files at repo root (`app.js`, `genome-viz.js`, `webgl-renderer.js`, `zoom-*.js`,
`controls.js`, `annotation.js`, etc.) are KEPT. The genome-organization WebGL renderer is
PORTED from them into `frontend/src/render/webgl/`. New app lives in:
```
backend/            FastAPI + gig_map_io
  app/
    main.py            FastAPI app; mounts /api; serves frontend dist in prod
    datasets.py        scan DATASETS_DIR; infer type per folder FROM CONTENTS
    session.py         SESSION_DIR helper; output_dir.py + figures_store.py (saved figures)
    serialization.py   pandas.DataFrame -> Arrow IPC stream; JSON helpers
    figures/           one module per figure (see §4)
    registry.py        maps functionId -> handler + pydantic params model
  tests/               pytest against ./datasets fixture
  pyproject.toml
  Dockerfile
frontend/           Vite + React + TypeScript
  src/
    api/client.ts      fetch wrappers; Arrow decode (apache-arrow tableFromIPC)
    schema/            field-type system (zod) + special input types (§3)
    forms/SchemaForm.tsx  the ONE common form engine (§3)
    figures/           one module per figure: {id,title,category,schema,Renderer}
    figures/index.ts   registry: array of all figure modules
    render/webgl/      ported genome-organization renderer (§4.1)
    render/mosaic/     DuckDB-WASM + Mosaic charts (§4: heatmap, scatter, box)
    render/svg/        React+SVG trees, tanglegram, synteny (§4)
    session/           output-folder bar, figures panel, bin inspector + client
    App.tsx, main.tsx
  package.json, vite.config.ts, tsconfig.json, nginx.conf
  Dockerfile
docker-compose.yml
docs/ARCHITECTURE.md  (this file)
```

## 2. Runtime / env
- Backend env: `DATASETS_DIR` (default `/data/datasets`), `SESSION_DIR` (default `/data/session`).
  In dev (no docker) these default to `./datasets` and `./session` under repo CWD.
- Ports: backend uvicorn `:8000`; frontend nginx `:8080` proxies `/api/*` → `backend:8000`.
- docker-compose mounts: host `./datasets` → `/data/datasets:ro`; host `./session` → `/data/session:rw`.
  A `DATASETS_HOST` override lets the user point at the full 1.8GB set at
  `/Users/sminot/Documents/GitHub/fredricks-gvhd-microbiome-pangenome-association-1/datasets`.

## 3. Schema-driven UI (HARD RULE)
Every figure declares its inputs as a **zod schema** built from a small set of
branded field helpers in `schema/fields.ts`. `SchemaForm` renders ANY such schema — there are
NO per-figure bespoke forms. Field helpers (each carries UI metadata via `.describe()`/brand):
- `text(label)`, `number(label,{min,max,step})`, `bool(label)`, `enumSelect(label, options)`
- `binSelect(label)` — depends on a chosen pangenome; options fetched from `/api/datasets/{id}/bins`
- `binMultiSelect(label)` — set of bins
- `datasetSelect(label, type)` — type ∈ {"pangenome","contrast","phylogenies"}; options from `/api/datasets?type=`
- `datasetMultiSelect(label, type)` — e.g. a set of contrasts
- `genomeSelect(label)` — genomes of a chosen pangenome; from `/api/datasets/{id}/genomes`
- `statColumn(label)` — association stat column; options e.g. Estimate | signed_log10_qvalue | pvalue | qvalue | neg_log10_qvalue
Cross-field dependency: fields may declare `dependsOn: <otherFieldName>` so e.g. `binSelect`
knows which pangenome to query. `SchemaForm` resolves dependencies and lazy-loads options.
Params serialize to plain JSON via `schema.parse`; saved figure records store exactly this JSON.

## 4. Backend API contract
All under `/api`. Tabular payloads use Arrow IPC stream
(`Content-Type: application/vnd.apache.arrow.stream`); structured payloads use JSON.
`?format=csv|json` may override tabular responses for export.

- `GET /api/datasets?type=` → `[{id, name, type, organism, path, source}]`.
  `type` inferred FROM CONTENTS (not folder name): pangenome = has `data/bin_pangenome/gene_bins.csv`;
  contrast = has `data/association/association.csv`; phylogenies = has `data/raxml/*.bestTree`; else `unknown`.
  `id` = stable slug of folder name. `organism` parsed from name (strip "Pangenome - "/"Contrast - {cohort} - ",
  " (n=…) (hash)", " - disease - regress"); used for compare auto-matching.
- `GET /api/datasets/{id}` → details incl. counts.
- `GET /api/datasets/{id}/bins` → `[{bin, n_genes, n_genomes}]` (pangenome only).
- `GET /api/datasets/{id}/genomes` → `[{genome, ...metadata}]` (pangenome only).
- `GET /api/functions` → `[{id, title, category, description}]` for the launcher.
- `POST /api/run/{functionId}` body = params JSON → Arrow or JSON per function.
- `GET /api/output-dir` → `{path, exists}`; `PUT /api/output-dir` `{path}` sets the current output
  folder (any host path, `~`-expanded, `mkdir -p`); persisted in `SESSION_DIR/output_dir.json`.
- `GET /api/figures` → the `FigureRecord[]` saved in the current output folder (newest first; `[]` if
  none set). `POST /api/figures` (multipart: `figureType`, `title`, `params` JSON, optional `image_png`/`image_svg`)
  writes `<id>.json` + image files into that folder. `DELETE /api/figures/{id}` removes them.
  `GET /api/figures/{id}/image?format=png|svg` serves a stored image. A `FigureRecord` =
  `{id, figureType, title, params, createdAt, images:[{format, filename}]}` — the ONE universal
  serialization for every figure type (see CLAUDE.md; replaces the old bookmarks).
- `GET /api/links` → `[{contrastId, referencePangenomeId, candidates:[...], ambiguous, source:"inferred"|"user"}]`.
  Each contrast is linked to its reference pangenome by matching the contrast's association `feature`
  name-set to a pangenome's bin-name set (exact set equality; bin-COUNT equality as fallback), with
  `organism` as tiebreaker. `PUT /api/links/{contrastId}` `{pangenomeId}` sets a user override,
  `DELETE /api/links/{contrastId}` clears it; overrides persist under `SESSION_DIR/links/`.
- `GET /api/pangenome/{pangenomeId}/bin/{bin}` → the Bin Inspector dossier (JSON): `{bin, pangenomeId,
  nGenes, nGenomes, totalGenomes, prevalence, isCore, presence:[{genome,prop}], enrichedTerms:[{term,oddsRatio,qvalue}],
  synteny:{length,nGenes,nGroups}|null, contrasts:[{contrastId,name,estimate,pvalue,qvalue}], phylogeny:{phylogenyId,concordance,sharedLeaves}|null}`.
  Aggregates the per-bin views for the pangenome and its **linked** contrasts (optional sections degrade to null on error).

### Reactive UI additions (incremental, on top of §3/§6)
- **Auto-run**: `SchemaForm` has no Run button — it applies params on change (300ms debounce, cancels the
  in-flight request via `AbortController`), and only fires once every non-optional field is non-empty.
- **Shared selection**: `RendererProps` gains optional `selectedBin?: string|null` and
  `onSelectBin?: (bin|null)=>void`. Bin-level renderers highlight `selectedBin` and call `onSelectBin` on click.
  App holds `selectedBin`; clicking a bin opens the **Bin Inspector drawer** (dossier endpoint above). The
  selection and the shared params (pangenome, …) carry across view switches so brushing is visible across views;
  the selection resets only when the pangenome changes.

### Figures (functionId → params → output)
1. **`genome_organization`** — params `{pangenomeId, referenceGenome?, colorBy?, overlay?:{contrastId, stat, channel:"arcColor"|"outerTrack"}}`.
   Output: Arrow table of alignment rows `{gene, contig, genome, qstart, qend, qlen, pident, coverage, bin}` + a JSON sidecar
   at `/api/run/genome_organization/meta` (or embed meta in an `X-Meta` header/second call) with
   `{genomes:[...], contigs:[{genome,contig,len}], bins:[...], overlayByBin?:{bin:statValue}}`.
   Renderer: WebGL (§4.1).
2. **`compare_contrasts`** — params `{baseContrastIds:[...], comparatorContrastIds:[...], stat, fdr:bool, sigThresh, estimateThresh}`.
   Backend auto-matches base↔comparator by `organism`, builds two `ContrastMetagenomesSet`s (parameter="disease"),
   recomputes pooled BH FDR. Output JSON `{matches:[{organism, baseId, comparatorId}], chi2:{stat,p,dof}, categories:3x3,
   scatter:Arrow-or-inline [{organism,feature,base,comparator}]}`. Reuse `compare_sig_categories`,
   `compare_sig_scatter`, `compare_association_scatter`. Renderer: Mosaic scatter + a small stats panel.
3. **`bin_to_genomes`** — params `{pangenomeId, bin}` → Arrow `{genome, n_genes_detected, prop_genes_detected, present}`
   (present = prop≥0.5). Renderer: Mosaic bar/table.
4. **`bin_set_heatmap`** — params `{pangenomeId, bins:[...]}` → Arrow long `{bin, genome, prop, present}` +
   JSON `{binOrder, genomeOrder}` (hierarchical clustering order). Renderer: Mosaic heatmap.
5. **`synteny_layout`** — params `{pangenomeId, bin}` → JSON `{genes:[{gene_id,label,start,stop,dir:"fwd"|"rev",group}],
   groupOffsets:[...], length}` from `Pangenome._get_gene_coords`/`Coords`. Renderer: SVG gene-arrow map.
6. **`phylogeny_vs_core`** — params `{pangenomeId, phylogenyId, bin, coreBin?}` (coreBin default = auto core).
   Output JSON `{binNewick, coreNewick, concordance:spearman, sharedLeaves:int, binLayout, coreLayout}`.
   Renderer: SVG tanglegram (two trees + connectors). Fallback allowed: `{kind:"plotly", figure:{...}}` from
   `Phylogeny.compare` if native layout is impractical.
7. **`core_genome`** — params `{pangenomeId, propThreshold:0.9}` → JSON
   `{coreBin, nGenomes, nGenes, ranking:[{bin,n_genomes,n_genes}]}`. Must return `Bin 4` for the fixture.

Bonus figures (expose if cheap): `rarefaction`, `bin_size_histogram`, `enriched_terms` (Fisher),
`bin_stats` (AUC/odds-ratio/logistic). Same registry pattern.

## 5. Figures, output folder & export
- The user sets a current **output folder** (`/api/output-dir`). Saving a figure (ExportBar "Save figure")
  writes a `FigureRecord` (`<id>.json`) plus the rendered image(s) into that folder via `POST /api/figures`.
- A `FigureRecord` = `{id, figureType, title, params, createdAt, images:[{format, filename}]}` — the ONE
  universal serialization for every figure type. Load = pick `figureType` + set `params` (auto-runs); there
  is exactly one save path and one load path, no per-figure-type code (HARD RULE — see `CLAUDE.md`,
  enforced by `frontend/src/session/figures.roundtrip.test.ts`). This replaces the former bookmarks.
- Frontend: an `OutputFolderBar` (shows/changes the folder) + a `FiguresPanel` listing saved figures with
  thumbnails/timestamps; clicking one loads it. Export current view: PNG/SVG (renderer handler, else a generic
  capture of the render area — `session/imageCapture.ts`) and CSV/JSON (renderer handler or `?format=`).

## 6. Rendering assignments
- WebGL2 (`render/webgl/`): figure 1 (ported from legacy `webgl-renderer.js` + `genome-viz.js` +
  `app.js` buildRenderData + `zoom-*.js`). Keep scroll-zoom wedge + hover tooltips. Add optional overlay.
- Mosaic + DuckDB-WASM (`render/mosaic/`): figures 2,3,4 + volcano/box/scatter + bonus tables.
  Fetch Arrow from backend, register into DuckDB-WASM, drive `@uwdata/mosaic` vgplot marks.
- React+SVG (`render/svg/`): figures 5,6,7 (synteny arrows, tanglegram, core-genome summary).

## 7. Non-negotiables
- Type inference reads FILE CONTENTS, never folder-name prefixes alone.
- One `SchemaForm`; every figure routed through it.
- Reuse gig_map_io algorithms — do not re-derive synteny/phylogeny/FDR.
- Tests must EXERCISE behavior end-to-end; core_genome test asserts `Bin 4`.
