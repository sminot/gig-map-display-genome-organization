// Adapted from sminot/newick-viewer (MIT): src/layout.ts.
// Ported the rectangular (dendrogram) and radial (circular) layout algorithms.
// Dropped the upstream `useBranchLengths` toggle and its depth-only fallback;
// nodes with a null branch length fall back to unit length, so a cladogram lays
// out correctly without a separate code path.

import type { TreeNode, LayoutNode, LayoutEdge, LayoutResult, LayoutType } from './types';
import { getLeafNames, getMaxBranchLength } from './newick';

const RECT_MARGIN_LEFT = 10;
const RECT_MARGIN_RIGHT = 150;
const RECT_MARGIN_TOP = 20;
const RECT_MARGIN_BOTTOM = 20;

/** Rectangular (dendrogram) layout. */
export function computeRectangularLayout(
  root: TreeNode,
  width: number,
  height: number,
): LayoutResult {
  const leafCount = getLeafNames(root).length;
  const maxBranchLen = getMaxBranchLength(root);

  const plotWidth = width - RECT_MARGIN_LEFT - RECT_MARGIN_RIGHT;
  const plotHeight = height - RECT_MARGIN_TOP - RECT_MARGIN_BOTTOM;
  const leafSpacing = leafCount > 1 ? plotHeight / (leafCount - 1) : plotHeight / 2;

  const nodes: LayoutNode[] = [];
  const nodeMap = new Map<TreeNode, LayoutNode>();
  const edges: LayoutEdge[] = [];
  let leafIndex = 0;

  function layout(
    node: TreeNode,
    parentX: number | null,
    parentY: number | null,
    depth: number,
  ): { x: number; y: number } {
    const x = RECT_MARGIN_LEFT + (maxBranchLen > 0 ? (depth / maxBranchLen) * plotWidth : 0);

    let y: number;
    if (node.children.length === 0) {
      y = RECT_MARGIN_TOP + leafIndex * leafSpacing;
      leafIndex++;
    } else {
      const childPositions = node.children.map((child) => {
        const childDepth = depth + (child.branchLength ?? 1);
        return layout(child, x, 0, childDepth);
      });
      y = (childPositions[0].y + childPositions[childPositions.length - 1].y) / 2;

      for (const childNode of node.children) {
        const ln = nodeMap.get(childNode);
        if (ln) ln.parentY = y;
      }

      node.children.forEach((child, i) => {
        const cp = childPositions[i];
        edges.push({
          sourceX: x,
          sourceY: y,
          targetX: cp.x,
          targetY: cp.y,
          elbowX: x,
          elbowY: cp.y,
          targetNode: child,
        });
      });
    }

    const ln: LayoutNode = { node, x, y, parentX, parentY };
    nodes.push(ln);
    nodeMap.set(node, ln);
    return { x, y };
  }

  layout(root, null, null, 0);
  return { nodes, edges, width, height };
}

/** Radial (circular) layout. */
export function computeRadialLayout(
  root: TreeNode,
  width: number,
  height: number,
): LayoutResult {
  const leafCount = getLeafNames(root).length;
  const maxBranchLen = getMaxBranchLength(root);

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.max(50, Math.min(width, height) / 2 - 100);

  const nodes: LayoutNode[] = [];
  const nodeMap = new Map<TreeNode, LayoutNode>();
  const edges: LayoutEdge[] = [];
  let leafIndex = 0;

  function layout(
    node: TreeNode,
    parentX: number | null,
    parentY: number | null,
    depth: number,
  ): { angle: number; x: number; y: number } {
    const radius = maxBranchLen > 0 ? (depth / maxBranchLen) * maxRadius : 0;

    let angle: number;
    if (node.children.length === 0) {
      angle = (leafIndex / leafCount) * 2 * Math.PI;
      leafIndex++;
    } else {
      const childResults = node.children.map((child) => {
        const childDepth = depth + (child.branchLength ?? 1);
        return layout(child, 0, 0, childDepth);
      });
      const minAngle = childResults[0].angle;
      const maxAngle = childResults[childResults.length - 1].angle;
      angle = (minAngle + maxAngle) / 2;

      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      for (const childNode of node.children) {
        const ln = nodeMap.get(childNode);
        if (ln) {
          ln.parentX = px;
          ln.parentY = py;
        }
      }

      node.children.forEach((child, i) => {
        const cr = childResults[i];
        edges.push({
          sourceX: px,
          sourceY: py,
          targetX: cr.x,
          targetY: cr.y,
          targetNode: child,
        });
      });
    }

    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const ln: LayoutNode = { node, x, y, parentX, parentY };
    nodes.push(ln);
    nodeMap.set(node, ln);
    return { angle, x, y };
  }

  layout(root, null, null, 0);
  return { nodes, edges, width, height };
}

export function computeLayout(
  root: TreeNode,
  layoutType: LayoutType,
  width: number,
  height: number,
): LayoutResult {
  return layoutType === 'radial'
    ? computeRadialLayout(root, width, height)
    : computeRectangularLayout(root, width, height);
}
