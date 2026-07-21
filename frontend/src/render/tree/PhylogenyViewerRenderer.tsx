import { useCallback, useRef } from 'react';
import type { RendererProps } from '../../figures/types';
import { useRegisterExport } from '../../session/exports';
import { serializeSvgEl, svgElToPng } from '../../session/imageCapture';
import { PhylogenyView } from './PhylogenyView';

// Renders the phylogeny_viewer result: a single bin's Newick tree drawn by the
// vendored D3 engine. Export registers svg/png from the live <svg> and json from
// the result. This figure has no bin brushing, so selectedBin/onSelectBin are unused.

interface PhylogenyResult {
  bin: string;
  newick: string;
  nLeaves: number;
}

function isPhylogenyResult(data: unknown): data is PhylogenyResult {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.bin === 'string' && typeof d.newick === 'string' && typeof d.nLeaves === 'number';
}

export function PhylogenyViewerRenderer({ result }: RendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onSvgReady = useCallback((svg: SVGSVGElement | null) => {
    svgRef.current = svg;
  }, []);

  const data = result.kind === 'json' && isPhylogenyResult(result.data) ? result.data : null;

  useRegisterExport(
    {
      svg: () => {
        const el = svgRef.current;
        if (!el) throw new Error('Tree SVG is not mounted');
        return serializeSvgEl(el);
      },
      png: () => {
        const el = svgRef.current;
        if (!el) throw new Error('Tree SVG is not mounted');
        return svgElToPng(el);
      },
      json: () => data,
    },
    [data],
  );

  if (!data) {
    return <div className="mosaic-error">expected a phylogeny result (bin, newick, nLeaves)</div>;
  }

  return (
    <div className="svg-render">
      <div style={{ marginBottom: 8, color: 'var(--text)' }}>
        <strong>{data.bin}</strong> — {data.nLeaves} leaves
      </div>
      <PhylogenyView newick={data.newick} onSvgReady={onSvgReady} />
    </div>
  );
}
