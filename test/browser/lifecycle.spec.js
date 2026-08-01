/**
 * destroy() and update().
 *
 * A browser allows only a handful of live WebGL contexts — roughly 16 in Chrome —
 * and silently drops the oldest beyond that, at which point a display goes blank
 * with no error. A host application that mounts and unmounts on every tab change
 * hits that in seconds if destroy() only drops JS references. These tests assert the
 * context is genuinely released, and that update() re-renders without remounting.
 */

import { test, expect } from '@playwright/test';

const MOUNT_CYCLES = 40;

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

test('the harness has a real WebGL2 context, so these assertions mean something', async ({ page }) => {
  const available = await page.evaluate(() => {
    const probe = document.createElement('canvas');
    return !!probe.getContext('webgl2');
  });
  expect(available, 'WebGL2 unavailable — run with SwiftShader enabled').toBe(true);
});

test('destroy() loses the WebGL context rather than leaving it open', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mount, liveContextCount } = window.gmd;
    const before = liveContextCount();

    const handle = mount(document.getElementById('scratch'), {
      data: { rows: window.fixtures.alignmentRows() },
      controls: false,
    });
    await new Promise((r) => requestAnimationFrame(r));

    // Hold the element and its context so their state can be checked after destroy.
    const webglCanvas = document.querySelector('#scratch .gmd-webgl');
    const gl = webglCanvas.getContext('webgl2');
    const duringMount = liveContextCount();
    const lostDuringMount = gl.isContextLost();

    handle.destroy();
    await new Promise((r) => setTimeout(r, 100));

    return {
      before,
      duringMount,
      afterDestroy: liveContextCount(),
      lostDuringMount,
      lostAfterDestroy: gl.isContextLost(),
      canvasDetached: !webglCanvas.isConnected,
      containerEmptied: document.getElementById('scratch').innerHTML === '',
    };
  });

  expect(result.before).toBe(0);
  expect(result.duringMount).toBe(1);
  expect(result.lostDuringMount).toBe(false);

  expect(result.afterDestroy, 'the context count returns to zero').toBe(0);
  expect(result.lostAfterDestroy, 'the GPU context is actually lost').toBe(true);
  expect(result.canvasDetached).toBe(true);
  expect(result.containerEmptied).toBe(true);
});

test(`${MOUNT_CYCLES} mount/destroy cycles do not accumulate WebGL contexts`, async ({ page }) => {
  const result = await page.evaluate(async (cycles) => {
    const { mount, liveContextCount } = window.gmd;
    const rows = window.fixtures.alignmentRows();
    const host = document.getElementById('scratch');
    const counts = [];

    for (let i = 0; i < cycles; i++) {
      const handle = mount(host, { data: { rows }, controls: false });
      await new Promise((r) => requestAnimationFrame(r));
      counts.push(liveContextCount());
      handle.destroy();
    }
    await new Promise((r) => setTimeout(r, 200));

    // One more, to confirm a display mounted after all that churn still works.
    const final = mount(host, { data: { rows }, controls: false });
    await new Promise((r) => requestAnimationFrame(r));
    const canvas = host.querySelector('.gmd-webgl');
    const gl = canvas.getContext('webgl2');
    const finalHealthy = !gl.isContextLost();
    const finalRenders = host.querySelector('.gmd-canvas').toDataURL().length > 1000;
    final.destroy();

    return {
      maxConcurrent: Math.max(...counts),
      afterAll: liveContextCount(),
      finalHealthy,
      finalRenders,
    };
  }, MOUNT_CYCLES);

  // If destroy() leaked, this would climb to MOUNT_CYCLES instead of staying at one.
  expect(result.maxConcurrent, 'never more than one context alive at a time').toBe(1);
  expect(result.afterAll).toBe(0);
  expect(result.finalHealthy, 'a display mounted after 40 cycles has a live context').toBe(true);
  expect(result.finalRenders).toBe(true);
});

test('destroy() removes listeners and observers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mount } = window.gmd;
    const host = document.getElementById('scratch');
    const handle = mount(host, { data: { rows: window.fixtures.alignmentRows() }, controls: true });
    await new Promise((r) => requestAnimationFrame(r));

    const canvas = host.querySelector('.gmd-canvas');
    const tooltip = host.querySelector('.gmd-tooltip');
    const rect = canvas.getBoundingClientRect();

    const moveTo = (angle, radius) => canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + rect.width / 2 + radius * Math.sin(angle),
      clientY: rect.top + rect.height / 2 - radius * Math.cos(angle),
    }));

    // Sweep the reference ring rather than aiming at one gene: which angles carry a
    // gene depends on the fixture, and the point of this test is the listener, not
    // the hit-test geometry.
    const radius = Math.min(rect.width, rect.height) / 2 * 0.88;
    let tooltipShownWhileMounted = false;
    let hitAngle = 0;
    for (let i = 0; i < 180 && !tooltipShownWhileMounted; i++) {
      hitAngle = (i / 180) * 2 * Math.PI;
      moveTo(hitAngle, radius);
      tooltipShownWhileMounted = tooltip.getAttribute('aria-hidden') === 'false';
    }
    const tooltipText = tooltip.textContent;

    handle.destroy();

    // Nothing may throw, and no handler may still be listening on the old nodes.
    let threw = null;
    try {
      moveTo(hitAngle, radius);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      host.style.width = '320px';
      await new Promise((r) => setTimeout(r, 150));
      host.style.width = '640px';
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      threw = String(e);
    }

    return {
      tooltipShownWhileMounted,
      tooltipText,
      threw,
      tooltipDetached: !tooltip.isConnected,
      hostEmpty: host.innerHTML === '',
    };
  });

  expect(result.tooltipShownWhileMounted, 'the tooltip works before destroy').toBe(true);
  expect(result.tooltipText).toContain('Gene');
  expect(result.threw).toBeNull();
  expect(result.tooltipDetached).toBe(true);
  expect(result.hostEmpty).toBe(true);
});

test('calling a handle method after destroy() fails loudly', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      data: { rows: window.fixtures.alignmentRows() },
      controls: false,
    });
    await new Promise((r) => requestAnimationFrame(r));
    handle.destroy();

    const capture = (fn) => {
      try { fn(); return null; } catch (e) { return e.message; }
    };
    return {
      update: capture(() => handle.update({})),
      toSVG: capture(() => handle.toSVG()),
      secondDestroy: capture(() => handle.destroy()),
    };
  });

  expect(errors.update).toMatch(/after destroy/);
  expect(errors.toSVG).toMatch(/after destroy/);
  expect(errors.secondDestroy, 'destroy() is idempotent').toBeNull();
});

test('update() re-renders in place without remounting', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mount, liveContextCount } = window.gmd;
    const host = document.getElementById('scratch');
    const data = {
      rows: window.fixtures.alignmentRows(),
      geneAnnotationRows: window.fixtures.geneAnnotationRows(),
      genomeAnnotationRows: window.fixtures.genomeAnnotationRows(),
    };
    const handle = mount(host, { data, controls: true });
    await new Promise((r) => requestAnimationFrame(r));

    const layoutBefore = host.firstElementChild;
    const canvasBefore = host.querySelector('.gmd-canvas');
    const webglBefore = host.querySelector('.gmd-webgl');
    const glBefore = webglBefore.getContext('webgl2');
    const contextsBefore = liveContextCount();
    const pixelsBefore = canvasBefore.toDataURL();

    handle.update({
      data,
      referenceGenome: 'genome_04',
      geneAnnotation: { categoryColumn: 'bin', selectedCategories: ['Bin 1', 'Bin 3'] },
      genomeAnnotation: { colorColumn: 'source', palette: 'Dark2' },
      theme: 'light',
      controls: true,
    });
    await new Promise((r) => requestAnimationFrame(r));

    const out = {
      sameLayoutNode: host.firstElementChild === layoutBefore,
      sameCanvasNode: host.querySelector('.gmd-canvas') === canvasBefore,
      sameWebglNode: host.querySelector('.gmd-webgl') === webglBefore,
      contextNotLost: !glBefore.isContextLost(),
      contextsUnchanged: liveContextCount() === contextsBefore,
      pixelsChanged: canvasBefore.toDataURL() !== pixelsBefore,
      reference: handle.getConfig().referenceGenome,
      // The sidebar must reflect the config that was just applied, not the old one.
      categorySelectValue: host.querySelector('.gmd-gene-category').value,
      checkedCategories: [...host.querySelectorAll('.category-checkbox')]
        .filter((c) => c.checked).map((c) => c.value).sort(),
      paletteSelectValue: host.querySelector('.gmd-genome-palette').value,
      referenceInput: host.querySelector('.gmd-ref-input').dataset.value,
    };
    handle.destroy();
    return out;
  });

  expect(result.sameLayoutNode, 'update() reused the DOM subtree').toBe(true);
  expect(result.sameCanvasNode, 'update() reused the canvas').toBe(true);
  expect(result.sameWebglNode, 'update() reused the WebGL canvas').toBe(true);
  expect(result.contextNotLost, 'update() kept the WebGL context').toBe(true);
  expect(result.contextsUnchanged).toBe(true);
  expect(result.pixelsChanged, 'update() actually redrew').toBe(true);
  expect(result.reference).toBe('genome_04');
  expect(result.categorySelectValue).toBe('bin');
  expect(result.checkedCategories).toEqual(['Bin 1', 'Bin 3']);
  expect(result.paletteSelectValue).toBe('Dark2');
  expect(result.referenceInput).toBe('genome_04');
});

test('update() refuses to toggle controls, which would need a remount', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const handle = window.gmd.mount(document.getElementById('scratch'), {
      data: { rows: window.fixtures.alignmentRows() },
      controls: true,
    });
    await new Promise((r) => requestAnimationFrame(r));
    let msg = null;
    try {
      handle.update({ data: { rows: [] }, controls: false });
    } catch (e) {
      msg = e.message;
    }
    handle.destroy();
    return msg;
  });
  expect(message).toMatch(/requires a remount/);
});
