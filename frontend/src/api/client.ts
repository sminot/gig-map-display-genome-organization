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

export interface FunctionInfo {
  id: string;
  title: string;
  category: string;
  description: string;
}

export interface Bookmark {
  id: string;
  functionId: string;
  title: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export type RunResult =
  | { kind: 'arrow'; table: Table }
  | { kind: 'json'; data: unknown }
  | { kind: 'plotly'; figure: unknown };

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

async function getJson<T>(path: string): Promise<T> {
  const res = await assertOk(await fetch(`${API_BASE}${path}`));
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

export async function getFunctions(): Promise<FunctionInfo[]> {
  return getJson<FunctionInfo[]>('/functions');
}

export async function runFunction(
  functionId: string,
  params: Record<string, unknown>,
): Promise<RunResult> {
  const res = await assertOk(
    await fetch(`${API_BASE}/run/${encodeURIComponent(functionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
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

export async function listBookmarks(): Promise<Bookmark[]> {
  return getJson<Bookmark[]>('/bookmarks');
}

export async function createBookmark(input: {
  functionId: string;
  title: string;
  params: Record<string, unknown>;
}): Promise<Bookmark> {
  const res = await assertOk(
    await fetch(`${API_BASE}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return (await res.json()) as Bookmark;
}

export async function deleteBookmark(id: string): Promise<void> {
  await assertOk(
    await fetch(`${API_BASE}/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

export { ARROW_MIME };
