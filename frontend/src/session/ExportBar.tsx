import { useState } from 'react';
import { fetchExport, saveFigure } from '../api/client';
import { downloadBlob, downloadText, useExportHandlers } from './exports';
import { captureViewportImage } from './imageCapture';

// Export bar (ARCHITECTURE.md §5/§8). Uses whatever handlers the active renderer
// registered; PNG/SVG fall back to a generic capture of the live render area so
// every figure type is exportable/saveable without per-type handlers. CSV/JSON
// prefer a renderer handler but fall back to the backend `?format=` path. It also
// hosts the "Save figure" control (here so it can read the same export handlers):
// a figure is { figureType, params } plus whatever image formats are capturable.

async function resolveToBlob(v: Blob | string, mime: string): Promise<Blob> {
  return v instanceof Blob ? v : new Blob([v], { type: mime });
}

export interface ExportBarProps {
  functionId: string;
  params: Record<string, unknown> | null;
  disabled: boolean;
  onSaved: () => void;
}

export function ExportBar({ functionId, params, disabled, onSaved }: ExportBarProps) {
  const handlers = useExportHandlers();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Prefer a renderer's own handler; otherwise capture the live render area so
  // figures with no registered image handler (the Mosaic family) still export.
  const pngBlob = async (): Promise<Blob | null> =>
    handlers.png ? resolveToBlob(await handlers.png(), 'image/png') : captureViewportImage('png');
  const svgBlob = async (): Promise<Blob | null> =>
    handlers.svg ? resolveToBlob(await handlers.svg(), 'image/svg+xml') : captureViewportImage('svg');

  const exportPng = async () => {
    const blob = await pngBlob();
    if (blob) downloadBlob(blob, `${functionId}.png`);
  };

  const exportSvg = async () => {
    const blob = await svgBlob();
    if (blob) downloadBlob(blob, `${functionId}.svg`);
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

  // Capture whatever image formats the renderer advertises; the figure itself is
  // the type-agnostic { figureType, params } pair. No per-figure-type handling.
  const save = async () => {
    if (!params) return;
    setSaving(true);
    setSaveError(null);
    try {
      const images: { format: 'png' | 'svg'; blob: Blob }[] = [];
      const png = await pngBlob();
      if (png) images.push({ format: 'png', blob: png });
      const svg = await svgBlob();
      if (svg) images.push({ format: 'svg', blob: svg });
      await saveFigure({ figureType: functionId, title: title.trim() || functionId, params, images });
      setTitle('');
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="export-bar">
      <span className="export-label">Export:</span>
      <button type="button" onClick={exportPng} disabled={disabled}>
        PNG
      </button>
      <button type="button" onClick={exportSvg} disabled={disabled}>
        SVG
      </button>
      <button type="button" onClick={exportCsv} disabled={disabled || (!handlers.csv && !params)}>
        CSV
      </button>
      <button type="button" onClick={exportJson} disabled={disabled || (!handlers.json && !params)}>
        JSON
      </button>
      <span className="export-spacer" />
      <input
        type="text"
        className="save-title"
        autoComplete="off"
        data-lpignore="true"
        placeholder="Figure title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Figure title"
        disabled={disabled}
      />
      <button type="button" onClick={save} disabled={disabled || saving || !params}>
        Save figure
      </button>
      {saveError && (
        <span className="sf-error" role="alert">
          {saveError}
        </span>
      )}
    </div>
  );
}
