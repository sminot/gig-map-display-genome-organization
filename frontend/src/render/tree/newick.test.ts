import { describe, it, expect } from 'vitest';
import { parseNewick, countLeaves, getLeafNames, getMaxBranchLength } from './newick';

describe('parseNewick', () => {
  it('parses a small tree and counts leaves', () => {
    const root = parseNewick('(A:1,(B:1,C:1):1);');
    expect(countLeaves(root)).toBe(3);
    expect(getLeafNames(root)).toEqual(['A', 'B', 'C']);
  });

  it('computes the max root-to-leaf branch length', () => {
    const root = parseNewick('(A:1,(B:1,C:1):1);');
    expect(getMaxBranchLength(root)).toBe(2);
  });

  it('parses quoted names and skips bracket annotations', () => {
    const root = parseNewick("('A b':0.5,C[&support=90]:0.5);");
    expect(getLeafNames(root)).toEqual(['A b', 'C']);
  });

  it('throws on empty input', () => {
    expect(() => parseNewick('   ')).toThrow();
  });
});
