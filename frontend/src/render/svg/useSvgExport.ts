import type { RefObject } from 'react';
import { useRegisterExport } from '../../session/exports';
import { serializeSvgEl, svgElToPng } from '../../session/imageCapture';

// SVG/PNG export for the React+SVG renderers. SVG is the serialized <svg> node;
// PNG rasterizes that serialized SVG onto a canvas (shared with imageCapture).
// The renderers draw on an explicit light plotting surface with fixed colors
// (not CSS theme variables), so the PNG matches the screen regardless of theme.

/**
 * Register SVG + PNG (+ JSON) export for a renderer whose SVG element is held in
 * `ref`. Handlers read the ref at export time, so the ref need not be populated
 * on the first render.
 */
export function useSvgExport(
  ref: RefObject<SVGSVGElement | null>,
  json: () => unknown,
  deps: unknown[],
): void {
  useRegisterExport(
    {
      svg: () => {
        const el = ref.current;
        if (!el) throw new Error('SVG element is not mounted');
        return serializeSvgEl(el);
      },
      png: () => {
        const el = ref.current;
        if (!el) throw new Error('SVG element is not mounted');
        return svgElToPng(el);
      },
      json,
    },
    deps,
  );
}
