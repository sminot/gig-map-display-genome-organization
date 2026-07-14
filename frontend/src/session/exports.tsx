import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// Per-renderer export plumbing (ARCHITECTURE.md §5/§8). A renderer registers how
// it can export the current view via useRegisterExport(); the App's export bar
// reads the registered handlers and drives the actual file download. For CSV/JSON
// the App falls back to the backend `?format=` path when a renderer registers none.

export interface ExportHandlers {
  png?: () => Promise<Blob> | Blob;
  svg?: () => Promise<Blob | string> | Blob | string;
  csv?: () => Promise<Blob | string> | Blob | string;
  json?: () => Promise<unknown> | unknown;
}

interface ExportContextValue {
  handlers: ExportHandlers;
  register: (h: ExportHandlers) => void;
  clear: () => void;
}

const ExportContext = createContext<ExportContextValue | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<ExportHandlers>({});
  const register = useCallback((h: ExportHandlers) => setHandlers(h), []);
  const clear = useCallback(() => setHandlers({}), []);
  const value = useMemo(() => ({ handlers, register, clear }), [handlers, register, clear]);
  return <ExportContext.Provider value={value}>{children}</ExportContext.Provider>;
}

function useExportContext(): ExportContextValue {
  const ctx = useContext(ExportContext);
  if (!ctx) throw new Error('useExport* must be used within <ExportProvider>');
  return ctx;
}

// Renderers call this to advertise which export formats they support.
export function useRegisterExport(handlers: ExportHandlers, deps: unknown[]) {
  const { register, clear } = useExportContext();
  useEffect(() => {
    register(handlers);
    return () => clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useExportHandlers(): ExportHandlers {
  return useExportContext().handlers;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string) {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
