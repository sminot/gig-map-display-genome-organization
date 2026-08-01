import { tableFromIPC, type Table } from 'apache-arrow';
import type { DatasetType } from '../schema/fields';

// Typed fetch wrappers for the backend contract (ARCHITECTURE.md §4).
// All tabular endpoints return Arrow IPC streams; structured endpoints return
// JSON. runFunction() distinguishes arrow / json / plotly by Content-Type.

const API_BASE = '/api';
const ARROW_MIME = 'application/vnd.apache.arrow.stream';

export interface DatasetSummary {
  id: string;
  name: string;
  type: DatasetType | 'unknown';
  organism: string;
  path: string;
  source: string;
}

export interface DatasetDetail extends DatasetSummary {
  counts: Record<string, number>;
}

export interface BinRow {
  bin: string;
  n_genes: number;
  n_genomes: number;
}

export interface GenomeRow {
  genome: string;
  [key: string]: unknown;
}

export interface FigureInfo {
  id: string;
  title: string;
  category: string;
  description: string;
}

// The output directory figures are written to. `exists` reflects whether the
// path is present on disk; `path` is null when none has been set.
export interface OutputDir {
  path: string | null;
  exists: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: DirEntry[];
}

// A saved figure: fully described by { figureType, params } plus the rendered
// image(s). Round-trips through save/load with no per-figure-type handling.
export interface FigureRecord {
  id: string;
  figureType: string;
  title: string;
  params: Record<string, unknown>;
  createdAt: string;
  images: { format: 'png' | 'svg'; filename: string }[];
}

export type RunResult =
  | { kind: 'arrow'; table: Table }
  | { kind: 'json'; data: unknown }
  | { kind: 'plotly'; figure: unknown };

// JSON sidecar for genome_organization (ARCHITECTURE.md §4.1). Fetched by the
// WebGL renderer from POST /api/run/genome_organization/meta with the SAME body
// as the main Arrow call (the generic runFunction only returns the table).
export interface GenomeOrgContig {
  genome: string;
  contig: string;
  len: number;
}

export interface GenomeOrganizationMeta {
  genomes: string[];
  contigs: GenomeOrgContig[];
  bins: string[];
  colorBy: string | null;
  overlayByBin?: Record<string, number>;
  overlayChannel?: 'arcColor' | 'outerTrack';
}

// Contrast -> reference-pangenome link (inferred, user-overridable).
export interface DatasetLink {
  contrastId: string;
  referencePangenomeId: string | null;
  candidates: string[];
  ambiguous: boolean;
  source: 'inferred' | 'user';
}

// Per-bin detail shown in the bin inspector drawer.
export interface BinDossier {
  bin: string;
  pangenomeId: string;
  nGenes: number;
  nGenomes: number;
  totalGenomes: number;
  prevalence: number;
  isCore: boolean;
  presence: { genome: string; prop: number }[];
  enrichedTerms: { term: string; oddsRatio: number; qvalue: number }[];
  synteny: { length: number; nGenes: number; nGroups: number } | null;
  contrasts: {
    contrastId: string;
    name: string;
    estimate: number | null;
    pvalue: number | null;
    qvalue: number | null;
  }[];
  phylogeny: { phylogenyId: string; concordance: number | null; sharedLeaves: number } | null;
}

// Aborted fetches reject with a DOMException named 'AbortError' (not always an
// Error subclass across environments), so match on the name; callers swallow it.
export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

async function assertOk(res: Response): Promise<Response> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${res.statusText} — ${detail}`);
  }
  return res;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await assertOk(await fetch(`${API_BASE}${path}`, { signal }));
  return (await res.json()) as T;
}

export async function getDatasets(type?: DatasetType): Promise<DatasetSummary[]> {
  const q = type ? `?type=${encodeURIComponent(type)}` : '';
  return getJson<DatasetSummary[]>(`/datasets${q}`);
}

export async function getDataset(id: string): Promise<DatasetDetail> {
  return getJson<DatasetDetail>(`/datasets/${encodeURIComponent(id)}`);
}

export async function getBins(id: string): Promise<BinRow[]> {
  return getJson<BinRow[]>(`/datasets/${encodeURIComponent(id)}/bins`);
}

export async function getGenomes(id: string): Promise<GenomeRow[]> {
  return getJson<GenomeRow[]>(`/datasets/${encodeURIComponent(id)}/genomes`);
}

export async function getFunctions(): Promise<FigureInfo[]> {
  return getJson<FigureInfo[]>('/functions');
}

export async function runFunction(
  functionId: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await assertOk(
    await fetch(`${API_BASE}/run/${encodeURIComponent(functionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    }),
  );
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('arrow')) {
    return { kind: 'arrow', table: tableFromIPC(new Uint8Array(await res.arrayBuffer())) };
  }
  const data = await res.json();
  if (data && typeof data === 'object' && (data as { kind?: string }).kind === 'plotly') {
    return { kind: 'plotly', figure: (data as { figure: unknown }).figure };
  }
  return { kind: 'json', data };
}

// Structured sidecar for a function that emits one (currently genome_organization).
// Must be called with the same body used for the main Arrow run.
export async function runFunctionMeta<T = unknown>(
  functionId: string,
  body: unknown,
): Promise<T> {
  const res = await assertOk(
    await fetch(`${API_BASE}/run/${encodeURIComponent(functionId)}/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as T;
}

// Data-download path for exports: re-run the function forcing a CSV/JSON body
// (ARCHITECTURE.md §5, `?format=`).
export async function fetchExport(
  functionId: string,
  params: Record<string, unknown>,
  format: 'csv' | 'json',
): Promise<Blob> {
  const res = await assertOk(
    await fetch(`${API_BASE}/run/${encodeURIComponent(functionId)}?format=${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: format === 'csv' ? 'text/csv' : 'application/json' },
      body: JSON.stringify(params),
    }),
  );
  return res.blob();
}

export async function getOutputDir(): Promise<OutputDir> {
  return getJson<OutputDir>('/output-dir');
}

export async function setOutputDir(path: string): Promise<OutputDir> {
  const res = await assertOk(
    await fetch(`${API_BASE}/output-dir`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
  return (await res.json()) as OutputDir;
}

export async function browseDir(path?: string): Promise<BrowseResult> {
  const q = path ? `?path=${encodeURIComponent(path)}` : '';
  return getJson<BrowseResult>(`/browse${q}`);
}

export async function listFigures(): Promise<FigureRecord[]> {
  return getJson<FigureRecord[]>('/figures');
}

export async function deleteFigure(id: string): Promise<void> {
  await assertOk(
    await fetch(`${API_BASE}/figures/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

export function figureImageUrl(id: string, format: 'png' | 'svg'): string {
  return `${API_BASE}/figures/${encodeURIComponent(id)}/image?format=${format}`;
}

// Persist the current figure. A figure is fully described by { figureType,
// params }; the rendered image(s) travel as multipart file parts.
export async function saveFigure(input: {
  figureType: string;
  title: string;
  params: Record<string, unknown>;
  images: { format: 'png' | 'svg'; blob: Blob }[];
}): Promise<FigureRecord> {
  const form = new FormData();
  form.append('figureType', input.figureType);
  form.append('title', input.title);
  form.append('params', JSON.stringify(input.params));
  for (const img of input.images) {
    form.append(img.format === 'png' ? 'image_png' : 'image_svg', img.blob);
  }
  const res = await assertOk(
    await fetch(`${API_BASE}/figures`, { method: 'POST', body: form }),
  );
  return (await res.json()) as FigureRecord;
}

export async function getLinks(): Promise<DatasetLink[]> {
  return getJson<DatasetLink[]>('/links');
}

export async function setLink(contrastId: string, pangenomeId: string): Promise<DatasetLink> {
  const res = await assertOk(
    await fetch(`${API_BASE}/links/${encodeURIComponent(contrastId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pangenomeId }),
    }),
  );
  return (await res.json()) as DatasetLink;
}

export async function clearLink(contrastId: string): Promise<DatasetLink> {
  const res = await assertOk(
    await fetch(`${API_BASE}/links/${encodeURIComponent(contrastId)}`, { method: 'DELETE' }),
  );
  return (await res.json()) as DatasetLink;
}

export async function getBinDossier(
  pangenomeId: string,
  bin: string,
  signal?: AbortSignal,
): Promise<BinDossier> {
  return getJson<BinDossier>(
    `/pangenome/${encodeURIComponent(pangenomeId)}/bin/${encodeURIComponent(bin)}`,
    signal,
  );
}

export { ARROW_MIME };
