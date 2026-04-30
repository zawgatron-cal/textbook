let _id = 0
const genId = () => String(++_id)

export type LayoutNode =
  | { type: 'leaf'; id: string }
  | { type: 'split'; id: string; dir: 'h' | 'v'; ratio: number; a: LayoutNode; b: LayoutNode }

export const createLeaf = (): LayoutNode => ({ type: 'leaf', id: genId() })

export function splitLayout(
  root: LayoutNode,
  targetId: string,
  dir: 'h' | 'v',
  ratio: number,
): { layout: LayoutNode; newLeafId: string } {
  let newLeafId = ''

  function recurse(node: LayoutNode): LayoutNode {
    if (node.type === 'leaf') {
      if (node.id !== targetId) return node
      const newLeaf: LayoutNode = { type: 'leaf', id: genId() }
      newLeafId = newLeaf.id
      return { type: 'split', id: genId(), dir, ratio, a: node, b: newLeaf }
    }
    const a = recurse(node.a)
    const b = recurse(node.b)
    if (a === node.a && b === node.b) return node
    return { ...node, a, b }
  }

  return { layout: recurse(root), newLeafId }
}

export function resizeLayout(root: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (root.type === 'leaf') return root
  if (root.id === splitId) return { ...root, ratio }
  const a = resizeLayout(root.a, splitId, ratio)
  const b = resizeLayout(root.b, splitId, ratio)
  if (a === root.a && b === root.b) return root
  return { ...root, a, b }
}

/**
 * Finds the direct parent split of keepLeafId and replaces that split with
 * just the kept leaf — the sibling subtree is discarded (collapsed).
 */
export function collectLeafIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return [...collectLeafIds(node.a), ...collectLeafIds(node.b)]
}

/**
 * Collapses collapseLeafId and keeps its sibling (the survivor).
 */
export function mergeLayout(root: LayoutNode, collapseLeafId: string): LayoutNode {
  if (root.type === 'leaf') return root
  if (root.a.type === 'leaf' && root.a.id === collapseLeafId) return root.b
  if (root.b.type === 'leaf' && root.b.id === collapseLeafId) return root.a
  const a = mergeLayout(root.a, collapseLeafId)
  if (a !== root.a) return { ...root, a }
  const b = mergeLayout(root.b, collapseLeafId)
  if (b !== root.b) return { ...root, b }
  return root
}
