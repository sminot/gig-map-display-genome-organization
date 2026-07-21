import { useEffect, useRef, useState } from 'react';
import { getMosaic, type VG } from './mosaicClient';
import './mosaic.css';

// Mounts a vgplot-built DOM node (plot()/hconcat()/vconcat() return elements)
// into a React-managed host. `build` runs after the DuckDB/coordinator boot and
// re-runs whenever `deps` change; the previous node is cleared on rebuild.
interface MosaicChartProps {
  build: (vg: VG) => Promise<HTMLElement> | HTMLElement;
  deps: unknown[];
}

export function MosaicChart({ build, deps }: MosaicChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Booting DuckDB-WASM and running the plot query takes seconds (especially the
  // first chart of a session). Show a pending hint so the blank host doesn't
  // read as a broken render.
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPending(true);
    (async () => {
      try {
        const { vg } = await getMosaic();
        const node = await build(vg);
        if (cancelled) return;
        host.current?.replaceChildren(node);
        setPending(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPending(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      host.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (error) return <div className="mosaic-error">chart error: {error}</div>;
  return (
    <>
      {pending && <p className="mosaic-loading">Rendering…</p>}
      <div ref={host} className="mosaic-chart" />
    </>
  );
}
