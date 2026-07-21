// Adapted from sminot/newick-viewer (MIT): src/newick-parser.ts.
// Ported verbatim: the recursive-descent Newick parser and the leaf/branch-length
// helpers the layout needs. Dropped: NEXUS detection, TRANSLATE handling, Newick
// serialization, and the tree-editing operations (prune/reroot/ladderize) — none
// of which this single-tree viewer uses.

import type { TreeNode } from './types';

/**
 * Parse a Newick format string into a tree structure.
 *
 * Newick grammar:
 *   tree     -> subtree ";"
 *   subtree  -> leaf | internal
 *   internal -> "(" branchset ")" name
 *   branch   -> subtree (":" length)?
 */
export function parseNewick(input: string): TreeNode {
  const str = input.trim();
  if (!str) {
    throw new Error('Empty Newick string');
  }

  let pos = 0;
  let nextId = 0;

  function peek(): string {
    skipWhitespace();
    skipAnnotations();
    return str[pos] ?? '';
  }

  function consume(expected?: string): string {
    skipWhitespace();
    skipAnnotations();
    if (pos >= str.length) {
      throw new Error(`Unexpected end of input at position ${pos}`);
    }
    const ch = str[pos];
    if (expected !== undefined && ch !== expected) {
      throw new Error(`Expected '${expected}' but got '${ch}' at position ${pos}`);
    }
    pos++;
    return ch;
  }

  function skipWhitespace(): void {
    while (pos < str.length && /\s/.test(str[pos])) {
      pos++;
    }
  }

  /** Skip bracket annotations like [&&NHX:...] or [100]. */
  function skipAnnotations(): void {
    skipWhitespace();
    while (pos < str.length && str[pos] === '[') {
      let depth = 1;
      pos++;
      while (pos < str.length && depth > 0) {
        if (str[pos] === '[') depth++;
        else if (str[pos] === ']') depth--;
        pos++;
      }
      skipWhitespace();
    }
  }

  function parseTree(): TreeNode {
    const node = parseSubtree();
    if (peek() === ':') {
      consume(':');
      node.branchLength = parseLength();
    }
    if (peek() === ';') {
      consume(';');
    }
    return node;
  }

  function parseSubtree(): TreeNode {
    const node: TreeNode = { name: '', branchLength: null, children: [], id: nextId++ };
    if (peek() === '(') {
      consume('(');
      node.children.push(parseBranch());
      while (peek() === ',') {
        consume(',');
        node.children.push(parseBranch());
      }
      consume(')');
    }
    node.name = parseName();
    return node;
  }

  function parseBranch(): TreeNode {
    const node = parseSubtree();
    if (peek() === ':') {
      consume(':');
      node.branchLength = parseLength();
    }
    return node;
  }

  function parseName(): string {
    skipWhitespace();
    skipAnnotations();
    if (pos >= str.length) return '';

    // Quoted name (single quotes, with '' escape for a literal quote).
    if (str[pos] === "'") {
      pos++;
      let name = '';
      while (pos < str.length) {
        if (str[pos] === "'") {
          if (pos + 1 < str.length && str[pos + 1] === "'") {
            name += "'";
            pos += 2;
          } else {
            pos++;
            break;
          }
        } else {
          name += str[pos];
          pos++;
        }
      }
      skipAnnotations();
      return name;
    }

    let name = '';
    while (pos < str.length && !':,;()[]'.includes(str[pos]) && !/\s/.test(str[pos])) {
      name += str[pos];
      pos++;
    }
    skipAnnotations();
    return name;
  }

  function parseLength(): number {
    skipWhitespace();
    const remaining = str.slice(pos);
    const match = remaining.match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
    if (!match) {
      throw new Error(`Invalid branch length at position ${pos}`);
    }
    pos += match[0].length;
    const val = parseFloat(match[0]);
    if (isNaN(val)) {
      throw new Error(`Invalid branch length '${match[0]}' at position ${pos}`);
    }
    skipAnnotations();
    return val;
  }

  return parseTree();
}

/** All leaf names in left-to-right order. */
export function getLeafNames(node: TreeNode): string[] {
  if (node.children.length === 0) {
    return [node.name];
  }
  return node.children.flatMap(getLeafNames);
}

/** Number of leaves in the tree. */
export function countLeaves(node: TreeNode): number {
  return getLeafNames(node).length;
}

/** Total branch length from the root to the deepest leaf. */
export function getMaxBranchLength(node: TreeNode): number {
  if (node.children.length === 0) return 0;
  return Math.max(
    ...node.children.map((child) => (child.branchLength ?? 1) + getMaxBranchLength(child)),
  );
}
