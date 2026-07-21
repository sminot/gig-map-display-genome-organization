import { useEffect, useRef, useState } from 'react';
import { drawTree } from './draw';
import type { LayoutType } from './types';
import '../mosaic/mosaic.css';

// React wrapper around the vendored D3 tree engine (./draw). Mounts the engine
// into a ref'd <div>, redraws on newick/layout change, and cleans up on unmount.
// Zoom/pan live in the engine; this component only owns the layout toggle and
// exposes the rendered <svg> to the parent (for export) via onSvgReady.

interface PhylogenyViewProps {
  newick: string;
  onSvgReady?: (svg: SVGSVGElement | null) => void;
}

const LAYOUTS: LayoutType[] = ['rectangular', 'radial'];

export function PhylogenyView({ newick, onSvgReady }: PhylogenyViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<LayoutType>('rectangular');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const { svg, destroy } = drawTree(container, newick, layout);
      setError(null);
      onSvgReady?.(svg);
      return () => {
        onSvgReady?.(null);
        destroy();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onSvgReady?.(null);
    }
    // onSvgReady is a stable callback from the parent; redraw only on data/layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newick, layout]);

  return (
    <div className="phylogeny-view" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="mosaic-toolbar">
        {LAYOUTS.map((l) => (
          <button
            key={l}
            type="button"
            className={layout === l ? 'active' : ''}
            onClick={() => setLayout(l)}
          >
            {l === 'rectangular' ? 'Rectangular' : 'Radial'}
          </button>
        ))}
      </div>
      {error && <div className="mosaic-error">Could not render tree: {error}</div>}
      <div
        ref={containerRef}
        className="phylogeny-canvas"
        style={{ overflow: 'auto', maxHeight: '70vh', display: error ? 'none' : 'block' }}
      />
    </div>
  );
}
