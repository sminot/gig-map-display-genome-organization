/**
 * Instance isolation.
 *
 * The state singletons this library used to keep at module scope meant two displays
 * on one page shared one state object and corrupted each other. These tests mount two
 * and mutate one.
 */

import { test, expect } from '@playwright/test';

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

test('two displays on one page keep separate state', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mount } = window.gmd;
    const { alignmentRows, geneAnnotationRows, genomeAnnotationRows } = window.fixtures;
    const data = {
      rows: alignmentRows(),
      geneAnnotationRows: geneAnnotationRows(),
      genomeAnnotationRows: genomeAnnotationRows(),
    };

    const a = mount(document.getElementById('a'), { data, controls: true });
    const b = mount(document.getElementById('b'), { data, controls: true });
    await new Promise((r) => requestAnimationFrame(r));

    const bBefore = b.getConfig();
    const bCanvasBefore = document.querySelector('#b .gmd-canvas').toDataURL();

    // Change everything render-affecting on A only.
    a.update({
      data,
      referenceGenome: 'genome_03',
      visibleGenomes: ['genome_00', 'genome_01'],
      geneAnnotation: { categoryColumn: 'bin', selectedCategories: ['Bin 2'] },
      genomeAnnotation: { colorColumn: 'source', sortColumn: 'depth', sortAscending: false, palette: 'Set1' },
      zoom: { zoomLevel: 7, focusAngle: 1.1 },
      theme: 'light',
      controls: true,
    });
    await new Promise((r) => requestAnimationFrame(r));

    const aConfig = a.getConfig();
    const bAfter = b.getConfig();
    const bCanvasAfter = document.querySelector('#b .gmd-canvas').toDataURL();

    const out = {
      aReference: aConfig.referenceGenome,
      aTheme: aConfig.theme,
      aZoom: aConfig.zoom.zoomLevel,
      aVisible: aConfig.visibleGenomes,
      bConfigUnchanged: JSON.stringify(bBefore) === JSON.stringify(bAfter),
      bCanvasUnchanged: bCanvasBefore === bCanvasAfter,
      aThemeAttr: document.getElementById('a').getAttribute('data-theme'),
      bThemeAttr: document.getElementById('b').getAttribute('data-theme'),
      aToggleCount: document.querySelectorAll('#a .genome-toggle-label').length,
      bToggleCount: document.querySelectorAll('#b .genome-toggle-label').length,
      aCategoryChecked: [...document.querySelectorAll('#a .category-checkbox')]
        .filter((c) => c.checked).map((c) => c.value),
      bCategoryChecked: [...document.querySelectorAll('#b .category-checkbox')]
        .filter((c) => c.checked).map((c) => c.value),
      // The two canvases must not be the same node, and neither may the WebGL layers.
      distinctCanvases: document.querySelector('#a .gmd-canvas') !== document.querySelector('#b .gmd-canvas'),
      distinctWebgl: document.querySelector('#a .gmd-webgl') !== document.querySelector('#b .gmd-webgl'),
      contexts: window.gmd.liveContextCount(),
    };
    a.destroy();
    b.destroy();
    return out;
  });

  expect(result.aReference).toBe('genome_03');
  expect(result.aTheme).toBe('light');
  expect(result.aZoom).toBe(7);
  expect(result.aVisible).toEqual(['genome_00', 'genome_01']);
  expect(result.aThemeAttr).toBe('light');
  expect(result.bThemeAttr).toBe('dark');
  expect(result.aCategoryChecked).toEqual(['Bin 2']);
  expect(result.bCategoryChecked).toEqual([]);
  expect(result.distinctCanvases).toBe(true);
  expect(result.distinctWebgl).toBe(true);
  expect(result.contexts).toBe(2);

  expect(result.bConfigUnchanged, "B's config survived A's update").toBe(true);
  expect(result.bCanvasUnchanged, "B's pixels survived A's update").toBe(true);
});

test('sidebar interaction in one display does not reach the other', async ({ page }) => {
  await page.evaluate(async () => {
    const { mount } = window.gmd;
    const { alignmentRows, genomeAnnotationRows } = window.fixtures;
    const data = { rows: alignmentRows(), genomeAnnotationRows: genomeAnnotationRows() };
    window.__a = mount(document.getElementById('a'), { data });
    window.__b = mount(document.getElementById('b'), { data });
    await new Promise((r) => requestAnimationFrame(r));
  });

  // Untick the first two genome toggles in display A, through real clicks.
  const aToggles = page.locator('#a .genome-toggle-checkbox');
  await aToggles.nth(0).uncheck();
  await aToggles.nth(1).uncheck();

  const state = await page.evaluate(() => ({
    aVisible: window.__a.getConfig().visibleGenomes,
    bVisible: window.__b.getConfig().visibleGenomes,
    bChecked: [...document.querySelectorAll('#b .genome-toggle-checkbox')].every((c) => c.checked),
  }));

  expect(state.aVisible).not.toBeNull();
  expect(state.aVisible.length).toBe(3);
  expect(state.bVisible, "B still shows every genome").toBeNull();
  expect(state.bChecked).toBe(true);

  await page.evaluate(() => { window.__a.destroy(); window.__b.destroy(); });
});

test('the theme toggle in one display leaves the other alone', async ({ page }) => {
  await page.evaluate(async () => {
    const { mount } = window.gmd;
    const data = { rows: window.fixtures.alignmentRows() };
    window.__a = mount(document.getElementById('a'), { data });
    window.__b = mount(document.getElementById('b'), { data });
    await new Promise((r) => requestAnimationFrame(r));
  });

  await page.locator('#a .gmd-theme').click();

  expect(await page.getAttribute('#a', 'data-theme')).toBe('light');
  expect(await page.getAttribute('#b', 'data-theme')).toBe('dark');

  await page.evaluate(() => { window.__a.destroy(); window.__b.destroy(); });
});

test('style.css does not leak outside a mounted display', async ({ page }) => {
  const styles = await page.evaluate(async () => {
    const { mount } = window.gmd;
    const handle = mount(document.getElementById('a'), { data: { rows: window.fixtures.alignmentRows() } });
    await new Promise((r) => requestAnimationFrame(r));

    const outside = getComputedStyle(document.getElementById('outside-scope'));
    const inside = getComputedStyle(document.querySelector('#a .app-title'));
    const body = getComputedStyle(document.body);
    const out = {
      // The harness element carries .app-title and .control-section-heading but sits
      // outside .gmd-root, so the library's rules must not touch it.
      outsideColor: outside.color,
      outsideTransform: outside.textTransform,
      outsideLetterSpacing: outside.letterSpacing,
      insideColor: inside.color,
      insideLetterSpacing: inside.letterSpacing,
      // style.css must not restyle the page itself any more.
      bodyBackground: body.backgroundColor,
      bodyOverflow: body.overflow,
    };
    handle.destroy();
    return out;
  });

  expect(styles.insideColor).toBe('rgb(226, 232, 240)');
  expect(styles.insideLetterSpacing).not.toBe('normal');
  expect(styles.outsideColor).not.toBe(styles.insideColor);
  expect(styles.outsideLetterSpacing).toBe('normal');
  expect(styles.bodyBackground).toBe('rgb(16, 16, 24)');
  expect(styles.bodyOverflow).toBe('visible');
});
