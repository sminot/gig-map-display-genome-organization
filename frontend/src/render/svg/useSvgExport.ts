import type { RefObject } from 'react';
import { useRegisterExport } from '../../session/exports';

// SVG/PNG export for the React+SVG renderers. SVG is the serialized <svg> node;
// PNG rasterizes that serialized SVG onto a canvas. The renderers draw on an
// explicit light plotting surface with fixed colors (not CSS theme variables),
// so the rasterized PNG matches what is on screen regardless of the page theme.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PNG_SCALE = 2;

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  const body = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox.baseVal;
  const width = svg.width.baseVal.value || vb.width || svg.clientWidth;
  const height = svg.height.baseVal.value || vb.height || svg.clientHeight;
  return { width, height };
}

async function svgToPng(svg: SVGSVGElement): Promise<Blob> {
  const { width, height } = svgSize(svg);
  const url = URL.createObjectURL(
    new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG rasterization failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * PNG_SCALE);
    canvas.height = Math.ceil(height * PNG_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.scale(PNG_SCALE, PNG_SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
        return serializeSvg(el);
      },
      png: () => {
        const el = ref.current;
        if (!el) throw new Error('SVG element is not mounted');
        return svgToPng(el);
      },
      json,
    },
    deps,
  );
}
