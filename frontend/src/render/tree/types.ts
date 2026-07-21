// Adapted from sminot/newick-viewer (MIT): src/types.ts.
// Trimmed to the node/layout shapes the vendored parse -> layout -> draw pipeline
// needs; the upstream app-shell types (style, tanglegram, view state) are dropped.

/** A node in a phylogenetic tree. */
export interface TreeNode {
  name: string;
  branchLength: number | null;
  children: TreeNode[];
  /** Assigned during parsing; used to key nodes across renders. */
  id?: number;
}

export type LayoutType = 'rectangular' | 'radial';

export interface LayoutNode {
  node: TreeNode;
  x: number;
  y: number;
  /** Parent coordinates for drawing branches (null at the root). */
  parentX: number | null;
  parentY: number | null;
}

export interface LayoutEdge {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Elbow corner for the rectangular layout; absent for radial. */
  elbowX?: number;
  elbowY?: number;
  targetNode: TreeNode;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}
