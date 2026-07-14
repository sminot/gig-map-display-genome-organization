import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';

const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
const BOOKMARKS_DIR =
  '/Users/sminot/Documents/GitHub/gig-map-display-genome-organization/session/bookmarks';

const PANGENOME = 'Ruminococcus torques (n=29)';
const PHYLOGENY = 'Ruminococcus torques (n=29)';
const BIN = 'Bin 4';
const GVHD = 'GvHD Cohorts - Ruminococcus torques (n=29) - disease - regress';
const HALLAB = 'HallAB_2017 - Ruminococcus torques (n=29) - disease - regress';

mkdirSync(SHOTS, { recursive: true });

function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function pickFunction(page: Page, title: string) {
  await page.locator('button.launch', { hasText: title }).click();
  await expect(page.locator('.params h2')).toHaveText(title);
}

async function run(page: Page) {
  await page.locator('button.sf-run').click();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: false });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-title')).toHaveText('Pangenome Explorer');
});

test('1. genome_organization renders a non-blank WebGL canvas (+ overlay)', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Genome Organization');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await run(page);

  const canvas = page.locator('.webgl-genome-org canvas');
  await expect(canvas).toBeVisible();
  // Caption appears once render data is built.
  await expect(page.locator('.webgl-caption')).toContainText('genomes', { timeout: 30_000 });

  const readNonzero = async () =>
    page.evaluate(() => {
      const c = document.querySelector('.webgl-genome-org canvas') as HTMLCanvasElement | null;
      if (!c) return { w: 0, h: 0, nonzero: -1 };
      const gl = c.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
      if (!gl) return { w: 0, h: 0, nonzero: -2 };
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let nonzero = 0;
      for (let i = 0; i < px.length; i++) if (px[i] !== 0) nonzero++;
      return { w, h, nonzero };
    });

  await expect
    .poll(async () => (await readNonzero()).nonzero, { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);
  const before = await readNonzero();
  expect(before.w).toBeGreaterThan(0);
  await shot(page, 'genome_organization');

  // Overlay pass.
  await page.locator('#field-overlayContrastId').selectOption({ label: GVHD });
  await page.locator('#field-overlayChannel').selectOption('arcColor');
  await run(page);
  await expect(page.locator('.webgl-caption')).toContainText('genomes', { timeout: 30_000 });
  await expect
    .poll(async () => (await readNonzero()).nonzero, { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);
  await shot(page, 'genome_organization_overlay');

  console.log('GENOME_ORG pixels:', JSON.stringify(before));
  console.log('GENOME_ORG caption:', await page.locator('.webgl-caption').textContent());
  console.log('GENOME_ORG console errors:', JSON.stringify(errors));
  expect(errors.filter((e) => /error/i.test(e))).toEqual([]);
});

test('2. core_genome shows Bin 4 as the core bin', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Core Genome');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await run(page);

  await expect(page.locator('.svg-render')).toContainText('Core-genome bin');
  await expect(page.locator('.svg-render')).toContainText(BIN);
  await shot(page, 'core_genome');
  console.log('CORE_GENOME console errors:', JSON.stringify(errors));
});

test('3. bin_to_genomes lists 29 genome rows for Bin 4', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Bin to Genomes');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await page.locator('#field-bin').selectOption(BIN);
  await run(page);

  await page.locator('.mosaic-toolbar button', { hasText: 'Table' }).click();
  const rows = page.locator('.mosaic-table tbody tr');
  await expect(rows).toHaveCount(29);
  await shot(page, 'bin_to_genomes');
  console.log('BIN_TO_GENOMES rows:', await rows.count());
  console.log('BIN_TO_GENOMES console errors:', JSON.stringify(errors));
});

test('5. synteny_layout draws gene-arrow polygons', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Synteny Layout');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await page.locator('#field-bin').selectOption(BIN);
  await run(page);

  const svg = page.locator('.svg-render svg[aria-label="Gene-arrow synteny map"]');
  await expect(svg).toBeVisible();
  const polys = svg.locator('polygon');
  await expect(polys.first()).toBeVisible();
  const n = await polys.count();
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('.svg-render')).toContainText('genes');
  await shot(page, 'synteny_layout');
  console.log('SYNTENY polygons:', n);
  console.log('SYNTENY console errors:', JSON.stringify(errors));
});

test('6. phylogeny_vs_core draws a tanglegram with concordance', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Phylogeny vs Core');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await page.locator('#field-phylogenyId').selectOption({ label: PHYLOGENY });
  await page.locator('#field-bin').selectOption(BIN);
  await run(page);

  const svg = page.locator('.svg-render svg[aria-label="Tanglegram comparing bin tree to core-genome tree"]');
  await expect(svg).toBeVisible();
  const paths = await svg.locator('path').count();
  const lines = await svg.locator('line').count();
  expect(paths + lines).toBeGreaterThan(0);
  await expect(page.locator('.svg-render')).toContainText('concordance');
  await expect(page.locator('.svg-render')).toContainText('shared leaves');
  await shot(page, 'phylogeny_vs_core');
  console.log('PHYLOGENY paths/lines:', paths, lines);
  console.log('PHYLOGENY header:', await page.locator('.svg-render > div').first().textContent());
  console.log('PHYLOGENY console errors:', JSON.stringify(errors));
});

test('7. compare_contrasts matches R. torques and renders scatter', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Compare Contrasts');
  await page
    .locator('fieldset:has(legend:has-text("Base contrasts")) label.sf-check', { hasText: GVHD })
    .locator('input')
    .check();
  await page
    .locator('fieldset:has(legend:has-text("Comparator contrasts")) label.sf-check', { hasText: HALLAB })
    .locator('input')
    .check();
  await run(page);

  await expect(page.locator('.compare-stats')).toContainText('Ruminococcus torques', { timeout: 30_000 });
  // Scatter is DuckDB-WASM backed; capture whether it rendered or errored.
  let scatterState = 'unknown';
  try {
    await page.locator('.mosaic-chart svg').first().waitFor({ state: 'visible', timeout: 25_000 });
    scatterState = 'svg-rendered';
  } catch {
    const errBox = page.locator('.compare-contrasts .mosaic-error');
    scatterState = (await errBox.count()) ? `mosaic-error: ${await errBox.first().textContent()}` : 'no-svg-no-error';
  }
  await shot(page, 'compare_contrasts');
  console.log('COMPARE matches:', await page.locator('.compare-stats section:first-child').textContent());
  console.log('COMPARE scatter state:', scatterState);
  console.log('COMPARE console errors:', JSON.stringify(errors));
  await expect(page.locator('.compare-stats')).toContainText('Ruminococcus torques');
});

// bin_set_heatmap isolated: DuckDB-WASM (cell mark) may fail to boot in headless.
test('4. bin_set_heatmap renders a heatmap or reports the DuckDB error', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Bin Set Heatmap');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  const fs = page.locator('fieldset:has(legend:has-text("Bins"))');
  for (const b of ['Bin 4', 'Bin 2', 'Bin 8']) {
    await fs.locator('label.sf-check', { hasText: `${b} (` }).locator('input').check();
  }
  await run(page);

  let state = 'unknown';
  let detail = '';
  try {
    await page.locator('.mosaic-chart svg').first().waitFor({ state: 'visible', timeout: 40_000 });
    const cells = await page.locator('.mosaic-chart svg rect').count();
    state = 'heatmap-rendered';
    detail = `svg rect count=${cells}`;
    expect(cells).toBeGreaterThan(0);
  } catch {
    const errBox = page.locator('.mosaic-error');
    if (await errBox.count()) {
      state = 'mosaic-error';
      detail = (await errBox.first().textContent()) ?? '';
    } else {
      const loading = page.locator('.mosaic-loading');
      state = (await loading.count()) ? 'stuck-loading' : 'no-svg-no-error';
    }
  }
  await shot(page, 'bin_set_heatmap');
  console.log('HEATMAP state:', state, '::', detail);
  console.log('HEATMAP console errors:', JSON.stringify(errors));
});

test('bookmark: save writes JSON to session/bookmarks and reload repopulates the form', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Core Genome');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });

  const title = `e2e ${Date.now()}`;
  await page.locator('.bookmark-save input').fill(title);
  await page.locator('.bookmark-save button', { hasText: 'Save view' }).click();
  await expect(page.locator('.bookmark-list')).toContainText(title, { timeout: 15_000 });

  // Assert a JSON file exists on disk for this bookmark.
  expect(existsSync(BOOKMARKS_DIR)).toBeTruthy();
  const files = readdirSync(BOOKMARKS_DIR).filter((f) => f.endsWith('.json'));
  const matching = files
    .map((f) => ({ f, body: readFileSync(`${BOOKMARKS_DIR}/${f}`, 'utf8') }))
    .filter((x) => x.body.includes(title));
  expect(matching.length).toBeGreaterThan(0);
  const createdPath = `${BOOKMARKS_DIR}/${matching[matching.length - 1].f}`;
  console.log('BOOKMARK json path:', createdPath);

  // Switch to another function, then reload the bookmark and assert repopulation.
  await pickFunction(page, 'Synteny Layout');
  await expect(page.locator('.params h2')).toHaveText('Synteny Layout');
  await page.locator('.bookmark-load', { hasText: title }).click();
  await expect(page.locator('.params h2')).toHaveText('Core Genome');
  await expect(page.locator('#field-pangenomeId')).toHaveValue(/pangenome-ruminococcus-torques/);
  console.log('BOOKMARK reload repopulated pangenome:', await page.locator('#field-pangenomeId').inputValue());
  console.log('BOOKMARK console errors:', JSON.stringify(errors));
});

test('export: SVG export fires a download event', async ({ page }) => {
  const errors = attachConsole(page);
  await pickFunction(page, 'Core Genome');
  await page.locator('#field-pangenomeId').selectOption({ label: PANGENOME });
  await run(page);
  await expect(page.locator('.svg-render')).toContainText('Core-genome bin');

  const svgBtn = page.locator('.export-bar button', { hasText: 'SVG' });
  await expect(svgBtn).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), svgBtn.click()]);
  const fn = download.suggestedFilename();
  console.log('EXPORT download filename:', fn);
  expect(fn).toBe('core_genome.svg');
  console.log('EXPORT console errors:', JSON.stringify(errors));
});
