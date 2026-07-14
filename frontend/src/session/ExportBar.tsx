import { fetchExport } from '../api/client';
import { downloadBlob, downloadText, useExportHandlers } from './exports';

// Export bar (ARCHITECTURE.md §5/§8). Uses whatever handlers the active renderer
// registered. PNG/SVG require a renderer handler. CSV/JSON prefer a renderer
// handler but fall back to the backend `?format=` data-download path.

async function resolveToBlob(v: Blob | string, mime: string): Promise<Blob> {
  return v instanceof Blob ? v : new Blob([v], { type: mime });
}

export interface ExportBarProps {
  functionId: string;
  params: Record<string, unknown> | null;
  disabled: boolean;
}

export function ExportBar({ functionId, params, disabled }: ExportBarProps) {
  const handlers = useExportHandlers();

  const exportPng = async () => {
    if (!handlers.png) return;
    downloadBlob(await resolveToBlob(await handlers.png(), 'image/png'), `${functionId}.png`);
  };

  const exportSvg = async () => {
    if (!handlers.svg) return;
    downloadBlob(await resolveToBlob(await handlers.svg(), 'image/svg+xml'), `${functionId}.svg`);
  };

  const exportCsv = async () => {
    if (handlers.csv) {
      downloadBlob(await resolveToBlob(await handlers.csv(), 'text/csv'), `${functionId}.csv`);
    } else if (params) {
      downloadBlob(await fetchExport(functionId, params, 'csv'), `${functionId}.csv`);
    }
  };

  const exportJson = async () => {
    if (handlers.json) {
      downloadText(JSON.stringify(await handlers.json(), null, 2), `${functionId}.json`, 'application/json');
    } else if (params) {
      downloadBlob(await fetchExport(functionId, params, 'json'), `${functionId}.json`);
    }
  };

  return (
    <div className="export-bar">
      <span className="export-label">Export:</span>
      <button type="button" onClick={exportPng} disabled={disabled || !handlers.png}>
        PNG
      </button>
      <button type="button" onClick={exportSvg} disabled={disabled || !handlers.svg}>
        SVG
      </button>
      <button type="button" onClick={exportCsv} disabled={disabled || (!handlers.csv && !params)}>
        CSV
      </button>
      <button type="button" onClick={exportJson} disabled={disabled || (!handlers.json && !params)}>
        JSON
      </button>
    </div>
  );
}
