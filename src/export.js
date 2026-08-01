/**
 * Raster export and download helpers.
 *
 * `toPNGBlob` composites the live layers — Canvas 2D, the WebGL wedge, and the
 * SVG label overlay — into one image. It is a screen-resolution snapshot, meant
 * for thumbnails; `renderSVG` in svg-export.js is the path for output that has to
 * scale. A `scale` above 1 resamples the snapshot rather than re-rendering.
 */

const BACKGROUND = { dark: '#1a1a2e', light: '#ffffff' };

function svgOverlayImage(svg, width, height) {
  if (!svg || svg.childElementCount === 0) return null;

  // Browsers need explicit dimensions to rasterise a detached SVG string.
  const hadWidth = svg.hasAttribute('width');
  const hadHeight = svg.hasAttribute('height');
  if (!hadWidth) svg.setAttribute('width', width);
  if (!hadHeight) svg.setAttribute('height', height);
  const markup = new XMLSerializer().serializeToString(svg);
  if (!hadWidth) svg.removeAttribute('width');
  if (!hadHeight) svg.removeAttribute('height');

  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Composite every visible layer into a new canvas. */
async function compositeToCanvas({ state, refs, webglCanvas }, scale = 1) {
  const source = refs.canvas;
  const width = source.width;
  const height = source.height;

  const flat = document.createElement('canvas');
  flat.width = width;
  flat.height = height;
  const ctx = flat.getContext('2d');

  ctx.fillStyle = BACKGROUND[state.theme] || BACKGROUND.dark;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0);
  if (webglCanvas) ctx.drawImage(webglCanvas, 0, 0);

  const overlay = await svgOverlayImage(refs.overlay, width, height);
  if (overlay) ctx.drawImage(overlay, 0, 0);

  if (scale === 1) return flat;

  const scaled = document.createElement('canvas');
  scaled.width = Math.max(1, Math.round(width * scale));
  scaled.height = Math.max(1, Math.round(height * scale));
  scaled.getContext('2d').drawImage(flat, 0, 0, scaled.width, scaled.height);
  return scaled;
}

export async function toPNGBlob(target, scale = 1) {
  const canvas = await compositeToCanvas(target, scale);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas could not be encoded as PNG.'));
    }, 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Copy text to the clipboard, falling back to a hidden textarea. */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or a non-secure context — fall through.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;border:none';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return ok;
}
