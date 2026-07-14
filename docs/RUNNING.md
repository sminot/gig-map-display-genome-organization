# Running the Pangenome Explorer (Docker app)

The **Pangenome Explorer** is a full-stack interactive app (Python/FastAPI backend +
React/WebGL/Mosaic frontend) that reads gig-map output folders from a `datasets/`
directory and serves seven analysis views. It supersedes the static single-page viewer
(the legacy files at the repo root are kept and still deploy to GitHub Pages).

Architecture and the backend↔frontend contract are documented in
[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).

## Quick start

```bash
docker compose up --build
```

Then open **http://localhost:8080** — wait, the compose file maps host ports to avoid
clashing with other local dev servers:

- Frontend (the app): **http://localhost:18080**
- Backend API (direct): **http://localhost:18000** (also proxied at `/api` from the frontend)

Stop with `docker compose down`.

## Pointing at your own data

By default the app reads the committed fixture in `./datasets/` (a small *Ruminococcus
torques* pangenome + phylogeny + two contrasts). To use a different folder of gig-map
outputs, set `DATASETS_HOST` to its path:

```bash
DATASETS_HOST=/path/to/your/datasets docker compose up --build
# e.g. the full study set:
DATASETS_HOST=/Users/sminot/Documents/GitHub/fredricks-gvhd-microbiome-pangenome-association-1/datasets \
  docker compose up
```

Each immediate subfolder is treated as one gig-map output; its **type is inferred from
the files it contains** (not its name):

| Type | Signature (under `<folder>/data/`) |
|------|-----------------------------------|
| Pangenome | `bin_pangenome/gene_bins.csv` |
| Contrast | `association/association.csv` |
| Phylogenies | `raxml/*.bestTree` |

The datasets volume is mounted **read-only**; the app never writes to it.

## Session data & bookmarks

Saved/bookmarked view parameters are written as JSON to the host `./session/bookmarks/`
directory (mounted read-write). Delete files there to remove bookmarks. Views can also be
exported directly from the browser as PNG / SVG / CSV / JSON via the Export bar.

## Changing ports

Edit the `ports:` entries in `docker-compose.yml` (`18080:8080` for the frontend,
`18000:8000` for the backend).

## The gig_map_io dependency

The backend depends on the `gig_map_io` library. Its git remote
(`github.com/sminot/gig-map-io`) does **not currently publish the package tree** (only a
README/LICENSE are on `main`), so the library source is **vendored** under
`backend/vendor/gig-map-io/` (pinned commit recorded in `SOURCE_COMMIT.txt`) and installed
from there in `backend/Dockerfile`. Once the package is pushed to the remote, the Dockerfile
can switch back to the commented git install and the vendored copy can be removed.

## Local development (without Docker)

```bash
# backend
cd backend && uv venv --python 3.12 .venv && .venv/bin/python -m pip install -e ./vendor/gig-map-io -e '.[test]'
DATASETS_DIR=../datasets SESSION_DIR=../session .venv/bin/python -m uvicorn app.main:app --port 8000

# frontend (separate shell; proxies /api -> :8000)
cd frontend && npm install && npm run dev
```

## Tests

- Backend: `cd backend && .venv/bin/python -m pytest` (17 tests; asserts type inference,
  core-genome = `Bin 4`, every endpoint, Arrow round-trip, bookmarks).
- Frontend unit: `cd frontend && npx vitest run` (56 tests; schema/form engine + renderer helpers).
- End-to-end (Chromium): start the backend + `npm run dev` (or point at Docker), then
  `cd frontend && npx playwright test --config e2e/playwright.config.ts`. Override the target
  with `E2E_BASE_URL=http://localhost:18080` to test the composed app. Screenshots land in
  `frontend/e2e/screenshots/`.
