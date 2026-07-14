import { describe, it, expect } from 'vitest';
import {
  arrowPoints,
  barWidth,
  leafConnectors,
  linearScale,
  niceRound,
  treeEdges,
  type LayoutNode,
} from './geometry';

describe('arrowPoints', () => {
  it('points right for fwd genes', () => {
    expect(
      arrowPoints({ left: 0, right: 100, dir: 'fwd', yTop: 0, height: 10, headLen: 20 }),
    ).toBe('0,0 80,0 100,5 80,10 0,10');
  });

  it('points left for rev genes', () => {
    expect(
      arrowPoints({ left: 0, right: 100, dir: 'rev', yTop: 0, height: 10, headLen: 20 }),
    ).toBe('100,0 20,0 0,5 20,10 100,10');
  });

  it('clamps the arrowhead so short genes become a triangle, not inverted', () => {
    // gene width 8 < headLen 20 -> head clamps to 8
    expect(
      arrowPoints({ left: 0, right: 8, dir: 'fwd', yTop: 0, height: 10, headLen: 20 }),
    ).toBe('0,0 0,0 8,5 0,10 0,10');
  });
});

describe('barWidth', () => {
  it('scales value against the max', () => {
    expect(barWidth(28, 28, 200)).toBe(200);
    expect(barWidth(14, 28, 200)).toBe(100);
  });

  it('guards zero/negative inputs', () => {
    expect(barWidth(0, 28, 200)).toBe(0);
    expect(barWidth(5, 0, 200)).toBe(0);
    expect(barWidth(-3, 28, 200)).toBe(0);
  });

  it('clamps values above the max', () => {
    expect(barWidth(40, 28, 200)).toBe(200);
  });
});

describe('linearScale', () => {
  it('maps domain endpoints onto range endpoints', () => {
    const s = linearScale(0, 100, 10, 210);
    expect(s(0)).toBe(10);
    expect(s(100)).toBe(210);
    expect(s(50)).toBe(110);
  });

  it('collapses a zero-width domain to the range start', () => {
    const s = linearScale(5, 5, 0, 300);
    expect(s(5)).toBe(0);
  });
});

describe('leafConnectors', () => {
  const bin: LayoutNode[] = [
    { name: 'A', x: 1, y: 0, isLeaf: true },
    { name: 'B', x: 1, y: 1, isLeaf: true },
    { name: 'C', x: 1, y: 2, isLeaf: true },
    { name: 'clade(0)', x: 0, y: 0.5, isLeaf: false },
  ];
  const core: LayoutNode[] = [
    { name: 'B', x: 1, y: 5, isLeaf: true },
    { name: 'A', x: 1, y: 7, isLeaf: true },
    { name: 'D', x: 1, y: 9, isLeaf: true },
    { name: 'A', x: 0, y: 8, isLeaf: false }, // same name but internal -> ignored
  ];

  it('matches only shared leaves, keeping bin order, carrying both y values', () => {
    expect(leafConnectors(bin, core)).toEqual([
      { name: 'A', binY: 0, coreY: 7 },
      { name: 'B', binY: 1, coreY: 5 },
    ]);
  });

  it('ignores names that are internal (non-leaf) in a layout', () => {
    const names = leafConnectors(bin, core).map((c) => c.name);
    expect(names).not.toContain('C'); // C not present in core
    expect(names).not.toContain('D'); // D not present in bin
  });
});

describe('treeEdges', () => {
  const nodes: LayoutNode[] = [
    { name: 'root', x: 0, y: 1, isLeaf: false },
    { name: 'leaf1', x: 2, y: 0, isLeaf: true },
    { name: 'leaf2', x: 2, y: 2, isLeaf: true },
  ];

  it('resolves link endpoints by node name', () => {
    const edges = treeEdges(nodes, [
      { parent: 'root', child: 'leaf1' },
      { parent: 'root', child: 'leaf2' },
    ]);
    expect(edges).toEqual([
      { parent: 'root', child: 'leaf1', px: 0, py: 1, cx: 2, cy: 0 },
      { parent: 'root', child: 'leaf2', px: 0, py: 1, cx: 2, cy: 2 },
    ]);
  });

  it('throws on a link to an unknown node', () => {
    expect(() => treeEdges(nodes, [{ parent: 'root', child: 'ghost' }])).toThrow(/unknown node/);
  });
});

describe('niceRound', () => {
  it('rounds down to a 1/2/5 * 10^k value', () => {
    expect(niceRound(224862)).toBe(200000);
    expect(niceRound(70)).toBe(50);
    expect(niceRound(30)).toBe(20);
    expect(niceRound(12)).toBe(10);
    expect(niceRound(0)).toBe(0);
  });
});
