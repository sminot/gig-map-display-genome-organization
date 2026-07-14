import { describe, it, expect } from 'vitest';
import {
  categoryMatrixToCells,
  domainByMetric,
  orderDomain,
  recordsToCsv,
  scatterExtent,
} from './dataShaping';

describe('orderDomain', () => {
  it('keeps only present values, in the given order', () => {
    expect(orderDomain(['b', 'a', 'c'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('appends present values missing from the order (first-seen)', () => {
    expect(orderDomain(['x', 'a', 'y'], ['a'])).toEqual(['a', 'x', 'y']);
  });

  it('deduplicates repeated data values (heatmap long form)', () => {
    const genomes = ['g2', 'g1', 'g2', 'g1'];
    expect(orderDomain(genomes, ['g1', 'g2'])).toEqual(['g1', 'g2']);
  });
});

describe('domainByMetric', () => {
  const rows = [
    { genome: 'g1', prop: 0.2 },
    { genome: 'g2', prop: 0.9 },
    { genome: 'g3', prop: 0.5 },
  ];

  it('orders categories by descending metric', () => {
    expect(domainByMetric(rows, 'genome', 'prop', true)).toEqual(['g2', 'g3', 'g1']);
  });

  it('orders categories by ascending metric', () => {
    expect(domainByMetric(rows, 'genome', 'prop', false)).toEqual(['g1', 'g3', 'g2']);
  });

  it('uses the first metric seen per distinct category', () => {
    const dup = [
      { bin_names: '5 - 6', bin_size: 0.7 },
      { bin_names: '5 - 6', bin_size: 0.7 },
      { bin_names: '6 - 7', bin_size: 0.8 },
    ];
    expect(domainByMetric(dup, 'bin_names', 'bin_size', false)).toEqual(['5 - 6', '6 - 7']);
  });
});

describe('scatterExtent', () => {
  it('spans min/max across both keys', () => {
    const pts = [
      { base: -1, comparator: 2 },
      { base: 0.5, comparator: -3 },
    ];
    expect(scatterExtent(pts)).toEqual({ min: -3, max: 2 });
  });

  it('ignores non-finite values', () => {
    const pts = [
      { base: 1, comparator: Number.NaN },
      { base: 4, comparator: 2 },
    ];
    expect(scatterExtent(pts)).toEqual({ min: 1, max: 4 });
  });

  it('falls back to a unit range when empty', () => {
    expect(scatterExtent([])).toEqual({ min: 0, max: 1 });
  });

  it('pads a degenerate range', () => {
    expect(scatterExtent([{ base: 5, comparator: 5 }])).toEqual({ min: 4, max: 6 });
  });
});

describe('categoryMatrixToCells', () => {
  const categories = {
    self: ['<', '=', '>'],
    comparitor: ['<', '=', '>'],
    matrix: [
      [2, 30, 0],
      [1, 86, 0],
      [1, 48, 0],
    ],
  };

  it('flattens the matrix to labeled cells', () => {
    const cells = categoryMatrixToCells(categories);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ self: '<', comparator: '<', count: 2, row: 0, col: 0 });
    expect(cells[5]).toEqual({ self: '=', comparator: '>', count: 0, row: 1, col: 2 });
    expect(cells[7]).toEqual({ self: '>', comparator: '=', count: 48, row: 2, col: 1 });
  });
});

describe('recordsToCsv', () => {
  it('emits a header and rows for the given columns', () => {
    const rows = [
      { genome: 'g1', prop: 0.5, present: true },
      { genome: 'g2', prop: 1, present: false },
    ];
    expect(recordsToCsv(rows, ['genome', 'prop', 'present'])).toBe(
      'genome,prop,present\ng1,0.5,true\ng2,1,false',
    );
  });

  it('quotes values containing commas, quotes, or newlines', () => {
    const rows = [{ label: 'a,b', note: 'he said "hi"' }];
    expect(recordsToCsv(rows)).toBe('label,note\n"a,b","he said ""hi"""');
  });
});
