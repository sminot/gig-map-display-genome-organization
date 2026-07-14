import { useMemo, useState } from 'react';
import { functionModules, getFunctionModule } from './functions';
import type { FunctionModule } from './functions';
import { SchemaForm } from './forms/SchemaForm';
import { defaultsFor } from './schema/fields';
import * as api from './api/client';
import type { Bookmark, RunResult } from './api/client';
import { BookmarksPanel } from './session/BookmarksPanel';
import { ExportBar } from './session/ExportBar';
import { ExportProvider } from './session/exports';

function groupByCategory(modules: FunctionModule[]): [string, FunctionModule[]][] {
  const groups = new Map<string, FunctionModule[]>();
  for (const m of modules) {
    const list = groups.get(m.category) ?? [];
    list.push(m);
    groups.set(m.category, list);
  }
  return [...groups.entries()];
}

export default function App() {
  const categories = useMemo(() => groupByCategory(functionModules), []);
  const [selectedId, setSelectedId] = useState(functionModules[0].id);
  const selected = getFunctionModule(selectedId)!;

  const [paramValues, setParamValues] = useState<Record<string, unknown>>(() =>
    defaultsFor(selected.params),
  );
  const [lastRunParams, setLastRunParams] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFunction = (id: string) => {
    const mod = getFunctionModule(id)!;
    setSelectedId(id);
    setParamValues(defaultsFor(mod.params));
    setResult(null);
    setLastRunParams(null);
    setError(null);
  };

  const run = async (params: Record<string, unknown>) => {
    setRunning(true);
    setError(null);
    try {
      const body = selected.toRequest ? selected.toRequest(params) : params;
      const res = await api.runFunction(selected.id, body as Record<string, unknown>);
      setResult(res);
      setLastRunParams(params);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const loadBookmark = (b: Bookmark) => {
    const mod = getFunctionModule(b.functionId);
    if (!mod) {
      setError(`Unknown function in bookmark: ${b.functionId}`);
      return;
    }
    setSelectedId(mod.id);
    setParamValues({ ...defaultsFor(mod.params), ...b.params });
    setResult(null);
    setLastRunParams(null);
    setError(null);
  };

  const Renderer = selected.Renderer;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="app-title">Pangenome Explorer</h1>
        <nav className="launcher">
          {categories.map(([category, mods]) => (
            <div key={category} className="launcher-group">
              <h3>{category}</h3>
              <ul>
                {mods.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={m.id === selectedId ? 'launch active' : 'launch'}
                      onClick={() => selectFunction(m.id)}
                    >
                      {m.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <section className="params">
          <h2>{selected.title}</h2>
          <p className="fn-desc">{selected.description}</p>
          <SchemaForm
            key={selected.id}
            def={selected.params}
            value={paramValues}
            onChange={setParamValues}
            onSubmit={run}
          />
        </section>

        <BookmarksPanel
          currentFunctionId={selected.id}
          currentParams={paramValues}
          onLoad={loadBookmark}
        />
      </aside>

      <main className="viewport">
        <ExportProvider>
          <ExportBar functionId={selected.id} params={lastRunParams} disabled={!result} />
          <div className="render-area">
            {running && <p className="status">Running…</p>}
            {error && <p className="sf-error" role="alert">{error}</p>}
            {!running && !error && !result && (
              <p className="status">Select a function, set parameters, and Run.</p>
            )}
            {result && <Renderer params={lastRunParams ?? {}} result={result} />}
          </div>
        </ExportProvider>
      </main>
    </div>
  );
}
