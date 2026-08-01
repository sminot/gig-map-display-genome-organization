/**
 * Export and rehydration.
 *
 * toSVG() must be a real vector export, not a canvas readback dressed as SVG, and
 * rehydrating a stored config must reproduce a display exactly rather than
 * approximately.
 */

import { test, expect } from '@playwright/test';

const FULL_CONFIG = {
  referenceGenome: 'genome_02',
  visibleGenomes: ['genome_00', 'genome_03', 'genome_05'],
  geneAnnotation: {
    categoryColumn: 'bin',
    labelColumn: 'name',
    selectedCategories: ['Bin 1', 'Bin 3'],
    customColors: { 'Bin 3': '#ff00ff' },
    displayMode: 'bars',
  },
  genomeAnnotation: {
    colorColumn: 'source',
    labelColumn: 'source',
    tooltipColumns: ['depth'],
    sortColumn: 'depth',
    sortAscending: false,
    palette: 'Set2',
  },
  zoom: {
    focusAngle: 1.4, zoomLevel: 6, wedgeSpan: 0.4, wedgeGap: 12, wedgeHeightScale: 3,
  },
  theme: 'dark',
  controls: false,
};

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // A failed fetch is a status the code handles, not a defect; the tests that
    // provoke one assert on the handling. Everything else must stay silent.
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      errors.push(m.text());
    }
  });
  await page.goto('/test/browser/harness.html');
  await page.waitForFunction(() => window.gmdReady === true);
  page.__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, 'the page logged no errors').toEqual([]);
});

test('toSVG() emits vector geometry for every layer, including the zoom wedge', async ({ page }) => {
  const svg = await page.evaluate(async (config) => {
    const { alignmentRows, geneAnnotationRows, genomeAnnotationRows } = window.fixtures;
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      ...config,
      data: {
        rows: alignmentRows(),
        geneAnnotationRows: geneAnnotationRows(),
        genomeAnnotationRows: genomeAnnotationRows(),
      },
    });
    await new Promise((r) => requestAnimationFrame(r));
    const out = handle.toSVG();
    handle.destroy();
    return out;
  }, FULL_CONFIG);

  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);

  // No raster anywhere: no <image>, no embedded data URI, no foreignObject escape hatch.
  expect(svg).not.toContain('<image');
  expect(svg).not.toContain('data:image');
  expect(svg).not.toContain('foreignObject');

  const paths = svg.match(/<path /g) || [];
  // Three visible genome rings on the circle plus three in the wedge, the contig
  // ring, the annotation track and its highlights, and the zoom indicator.
  expect(paths.length).toBeGreaterThanOrEqual(11);
  expect(svg).toContain('<text ');
  // Arc commands, not polygon approximations of arcs.
  expect(svg).toMatch(/ d="M[^"]*A/);
  // The custom colour override and the wedge indicator both reach the output.
  expect(svg.toLowerCase()).toContain('#ff00ff');
  expect(svg).toContain('rgba(255,217,26,0.9)');
});

test('the exported SVG parses as XML and every path has geometry', async ({ page }) => {
  const parsed = await page.evaluate(async (config) => {
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      ...config,
      data: {
        rows: window.fixtures.alignmentRows(),
        geneAnnotationRows: window.fixtures.geneAnnotationRows(),
        genomeAnnotationRows: window.fixtures.genomeAnnotationRows(),
      },
    });
    await new Promise((r) => requestAnimationFrame(r));
    const svg = handle.toSVG();
    handle.destroy();

    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const error = doc.querySelector('parsererror');
    const paths = [...doc.querySelectorAll('path')];
    return {
      parseError: error ? error.textContent.slice(0, 200) : null,
      pathCount: paths.length,
      allHaveFill: paths.every((p) => !!p.getAttribute('fill')),
      allHaveData: paths.every((p) => (p.getAttribute('d') || '').length > 0),
      hasBackgroundRect: !!doc.querySelector('rect'),
      viewBox: doc.documentElement.getAttribute('viewBox'),
    };
  }, FULL_CONFIG);

  expect(parsed.parseError).toBeNull();
  expect(parsed.pathCount).toBeGreaterThan(0);
  expect(parsed.allHaveFill).toBe(true);
  expect(parsed.allHaveData).toBe(true);
  expect(parsed.hasBackgroundRect).toBe(true);
  expect(parsed.viewBox).toBe('0 0 640 480');
});

test('the SVG rasterises to something close to the live canvas', async ({ page }) => {
  const diff = await page.evaluate(async (config) => {
    const host = document.getElementById('scratch');
    const handle = window.gmd.mount(host, {
      ...config,
      zoom: { ...config.zoom, zoomLevel: 1 },
      data: {
        rows: window.fixtures.alignmentRows(),
        geneAnnotationRows: window.fixtures.geneAnnotationRows(),
        genomeAnnotationRows: window.fixtures.genomeAnnotationRows(),
      },
    });
    await new Promise((r) => requestAnimationFrame(r));

    const svg = handle.toSVG();
    const canvas = host.querySelector('.gmd-canvas');
    const { width, height } = canvas;

    const live = document.createElement('canvas');
    live.width = width; live.height = height;
    const lx = live.getContext('2d');
    lx.fillStyle = '#1a1a2e';
    lx.fillRect(0, 0, width, height);
    lx.drawImage(canvas, 0, 0);

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('the exported SVG did not load as an image'));
      i.src = url;
    });
    const vector = document.createElement('canvas');
    vector.width = width; vector.height = height;
    vector.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const a = lx.getImageData(0, 0, width, height).data;
    const b = vector.getContext('2d').getImageData(0, 0, width, height).data;
    let differing = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(
        Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]),
      );
      // Antialiasing differs between the canvas rasteriser and the SVG one.
      if (d > 40) differing++;
    }
    handle.destroy();
    return { pctDiffering: (100 * differing) / (a.length / 4) };
  }, FULL_CONFIG);

  // Arc edges land on slightly different subpixels; the figure itself must match.
  expect(diff.pctDiffering).toBeLessThan(4);
});

test('toPNG() returns a PNG, and scale changes its dimensions', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      data: { rows: window.fixtures.alignmentRows() },
      controls: false,
    });
    await new Promise((r) => requestAnimationFrame(r));

    async function dimensions(blob) {
      const bitmap = await createImageBitmap(blob);
      return [bitmap.width, bitmap.height];
    }
    const full = await handle.toPNG();
    const half = await handle.toPNG(0.5);
    const out = {
      fullType: full.type,
      fullDims: await dimensions(full),
      halfDims: await dimensions(half),
      canvasDims: [
        document.querySelector('#scratch .gmd-canvas').width,
        document.querySelector('#scratch .gmd-canvas').height,
      ],
    };
    handle.destroy();
    return out;
  });

  expect(result.fullType).toBe('image/png');
  expect(result.fullDims).toEqual(result.canvasDims);
  expect(result.halfDims).toEqual([result.canvasDims[0] / 2, result.canvasDims[1] / 2]);
});

test('a stored config rehydrates to identical pixels', async ({ page }) => {
  const result = await page.evaluate(async (config) => {
    const { mount } = window.gmd;
    const data = {
      rows: window.fixtures.alignmentRows(),
      geneAnnotationRows: window.fixtures.geneAnnotationRows(),
      genomeAnnotationRows: window.fixtures.genomeAnnotationRows(),
    };

    const first = mount(document.getElementById('a'), { ...config, data });
    await new Promise((r) => requestAnimationFrame(r));
    // What a host application would persist: the config, without the rows.
    const stored = JSON.parse(JSON.stringify({ ...first.getConfig(), data: {} }));
    const pixelsFirst = document.querySelector('#a .gmd-canvas').toDataURL();
    const svgFirst = first.toSVG();
    first.destroy();

    // Rehydrate in a different container, supplying the same rows alongside.
    const second = mount(document.getElementById('b'), { ...stored, data });
    await new Promise((r) => requestAnimationFrame(r));
    const pixelsSecond = document.querySelector('#b .gmd-canvas').toDataURL();
    const svgSecond = second.toSVG();
    const configSecond = { ...second.getConfig(), data: {} };
    second.destroy();

    return {
      pixelsMatch: pixelsFirst === pixelsSecond,
      svgMatch: svgFirst === svgSecond,
      configMatch: JSON.stringify(configSecond) === JSON.stringify(stored),
      stored,
    };
  }, FULL_CONFIG);

  expect(result.configMatch, 'the config survived a JSON round-trip').toBe(true);
  expect(result.pixelsMatch, 'rehydration reproduced the figure exactly').toBe(true);
  expect(result.svgMatch, 'rehydration reproduced the vector export exactly').toBe(true);
  // The stored config must carry no data, only a reference to it.
  expect(result.stored.data).toEqual({});
  expect(result.stored.zoom.zoomLevel).toBe(6);
});

test('a failed fetch reaches onError instead of vanishing', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const errors = [];
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      data: { alignmentUrl: '/no/such/alignment.csv.gz' },
      controls: false,
    });
    handle.onError((e) => errors.push(e.message));
    await new Promise((r) => setTimeout(r, 800));
    handle.destroy();
    return errors;
  });

  expect(result.length).toBe(1);
  expect(result[0]).toMatch(/404|HTTP/);
});

test('a failed fetch shows in the sidebar when there is one', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const host = document.getElementById('scratch');
    const handle = window.gmd.mount(host, {
      data: { alignmentUrl: '/no/such/alignment.csv.gz' },
      controls: true,
    });
    await new Promise((r) => setTimeout(r, 800));
    const el = host.querySelector('.gmd-error');
    const out = { text: el.textContent, hidden: el.hidden };
    handle.destroy();
    return out;
  });

  expect(message.hidden).toBe(false);
  expect(message.text).toMatch(/404|HTTP/);
});

test('mount() rejects a config the schema does not allow', async ({ page }) => {
  const errors = await page.evaluate(() => {
    const capture = (config) => {
      try {
        window.gmd.mount(document.getElementById('scratch'), config).destroy();
        return null;
      } catch (e) { return e.message; }
    };
    return {
      unknown: capture({ nope: true }),
      badZoom: capture({ zoom: { zoomLevel: 999 } }),
      badVersion: capture({ version: 99 }),
      noElement: (() => {
        try { window.gmd.mount(null, {}); return null; } catch (e) { return e.message; }
      })(),
    };
  });

  expect(errors.unknown).toMatch(/unknown property/);
  expect(errors.badZoom).toMatch(/zoom\.zoomLevel/);
  expect(errors.badVersion).toMatch(/understands up to/);
  expect(errors.noElement).toMatch(/must be an element/);
});
