# gig-map figure generator — project rules

Full-stack app that turns gig-map output folders into figures. FastAPI backend
(`backend/`) + React/TS/Vite frontend (`frontend/`). Architecture & API contract:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Running: [`docs/RUNNING.md`](docs/RUNNING.md).

## Universal figure serialization (HARD RULE — no special-casing by figure type)

Every figure type is defined solely by its `defineParams` schema
(`frontend/src/schema/fields.ts`). A figure's settings serialize as a single,
uniform shape and there is exactly **one** save path and **one** load path shared
by all figure types:

- **Record shape:** `{ figureType, params }` (persisted as a `FigureRecord`:
  `{ id, figureType, title, params, createdAt, images }`).
- **Save:** `ExportBar` → `api.saveFigure(...)` → `POST /api/figures` into the
  current output folder. The image is captured generically from the render area
  (`session/imageCapture.ts`), not per figure type.
- **Load:** `App.loadFigure(record)` → `getFigureModule(record.figureType)` +
  `setParamValues({ ...defaultsFor(mod.params), ...record.params })`, which
  auto-runs. Type-agnostic.

Do **NOT**:
- add per-figure-type save/load/serialize code, or any `figureType === '...'`
  branch, in the figure-record / output-folder / export infrastructure
  (`session/`, `api/client.ts`, `forms/SchemaForm.tsx`, `backend/app/figures_store.py`);
- give a figure type a bespoke settings format or a custom form — every form is
  rendered by the one `SchemaForm` from the schema.

A new figure type must save and load with **zero** changes to that
infrastructure. This is enforced by `frontend/src/session/figures.roundtrip.test.ts`,
which iterates `figureModules` and round-trips every registered type generically —
a new type is covered automatically, and any type-specific serialization breaks it.

## Conventions

- Backend: snake_case, type hints on signatures, pydantic params, figures follow
  the `FigureSpec` registry pattern (`backend/app/registry.py`, `backend/app/figures/`);
  handlers return `DataFrame` (→ Arrow) | `dict` (→ JSON) | `TableResult`. Raise
  exceptions on error — do not swallow and continue as if it succeeded.
- Frontend: React function components, camelCase / PascalCase, explicit interfaces,
  `import type` for types, tabular payloads via Arrow, sparse why-focused comments.
- Tests must stay green: `cd backend && DATASETS_DIR=../datasets SESSION_DIR=../session ./.venv/bin/python -m pytest`
  and `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`.
