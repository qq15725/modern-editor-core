import { apply } from './apply'
import { isEditor } from './editor-core'
import { isBlockElement, isElement, isInlineElement, isVoidElement } from './element'
import { isAncestor } from './ancestor'
import { withoutNormalizing } from './normalize'
import {
  comparePath,
  getCommonPath,
  getLevelPaths,
  getNextPath, getParentPath, getPath,
  getPathRef,
  getPreviousPath,
  isAfterPath,
  isAncestorPath,
  isBeforePath,
  isCommonPath,
  isEqualPath,
  isPath,
  isSiblingPath,
} from './path'
import {
  getAfterPoint,
  getBeforePoint,
  getEndPoint, getPoint,
  getPointRef, getStartPoint,
  isEdgePoint,
  isEndPoint,
  isEqualPoint,
  isPoint,
  isStartPoint,
} from './point'
import {
  deleteRange,
  getIntersectionRange, getRange,
  getRangeEdgePoints,
  getRangeEndPoint, getRangeRef, getRangeStartPoint, getUnhangRange,
  isCollapsedRange,
  isExpandedRange,
  isRange,
} from './range'
import { select, setSelection } from './selection'
import { isSpan } from './span'
import { getTextEntryOrFail, getTextOrFail, isText } from './text'
import type { Text } from './text'
import type { Element } from './element'
import type { Ancestor } from './ancestor'
import type {
  Path,
  PathOptions,
} from './path'
import type { PointRef } from './point'
import type { Span } from './span'
import type { Location } from './location'
import type { EditorCore } from './types'

export type Node = EditorCore | Element | Text
export type NodeEntry<T extends Node = Node> = [T, Path]
export type NodeMatch<T extends Node> =
  | ((node: Node, path: Path) => node is T)
  | ((node: Node, path: Path) => boolean)
export type NodeProps =
  | Omit<EditorCore, 'children'>
  | Omit<Element, 'children'>
  | Omit<Text, 'text'>
export type PropsCompare = (prop: Partial<Node>, node: Partial<Node>) => boolean
export type PropsMerge = (prop: Partial<Node>, node: Partial<Node>) => object

function hasSingleChildNest(editor: EditorCore, node: Node): boolean {
  if (isElement(node)) {
    const element = node as Element
    if (editor.isVoid(node)) {
      return true
    } else if (element.children.length === 1) {
      return hasSingleChildNest(editor, element.children[0] as unknown as Node)
    } else {
      return false
    }
  } else if (isEditor(node)) {
    return false
  } else {
    return true
  }
}

export function isNode(value: any): value is Node {
  return isText(value) || isElement(value)
}

const IS_NODES_CACHE = new WeakMap<any[], boolean>()

export function isNodes(value: any): value is Node[] {
  if (!Array.isArray(value)) return false
  const cached = IS_NODES_CACHE.get(value)
  if (cached !== undefined) return cached
  const isNodes = value.every(val => isNode(val))
  IS_NODES_CACHE.set(value, isNodes)
  return isNodes
}

export function getNode(root: Ancestor, path: Path): Node | null {
  let node = root as Node
  for (let pathIndex = 0; pathIndex < path.length; pathIndex++) {
    const index = path[pathIndex]
    if (isText(node) || !node.children[index]) return null
    node = node.children[index]
  }
  return node
}

export function getNodeOrFail(root: Ancestor, path: Path): Node {
  const node = getNode(root, path)
  if (!node) throw new Error(`Cannot find a descendant at path [${ path }] in node: Editor`)
  return node
}

export function hasNode(root: Ancestor, path: Path) {
  return Boolean(getNode(root, path))
}

export interface NodesOptions {
  from?: Path
  to?: Path
  reverse?: boolean
  pass?: (entry: NodeEntry) => boolean
}

export function *getNodes(root: Ancestor, options?: NodesOptions): Generator<NodeEntry, void, undefined> {
  const { from = [], to, pass, reverse = false } = options ?? {}
  const visited = new Set()
  let path: Path = []
  let node = root as Node

  while (true) {
    if (to && (reverse ? isBeforePath(path, to) : isAfterPath(path, to))) break

    if (!visited.has(node)) yield [node, path]

    if (
      !visited.has(node)
      && !isText(node)
      && node.children.length !== 0
      && (!pass?.([node, path]))
    ) {
      visited.add(node)
      let nextIndex = reverse ? node.children.length - 1 : 0
      if (isAncestorPath(path, from)) {
        nextIndex = from[path.length]
      }
      path = path.concat(nextIndex)
      node = getNodeOrFail(root, path)
      continue
    }

    if (path.length === 0) break

    if (!reverse) {
      const newPath = getNextPath(path)

      if (hasNode(root, newPath)) {
        path = newPath
        node = getNodeOrFail(root, path)
        continue
      }
    }

    if (reverse && path[path.length - 1] !== 0) {
      path = getPreviousPath(path)
      node = getNodeOrFail(root, path)
      continue
    }

    path = getParentPath(path)
    node = getNodeOrFail(root, path)
    visited.add(node)
  }
}

export function getNodeEntry(
  root: Ancestor,
  at: Location,
  options: PathOptions = {},
): NodeEntry | null {
  const path = getPath(at, options)
  const node = getNode(root, path)
  return node ? [node, path] : null
}

export function getNodeEntryOrFail(
  root: Ancestor,
  at: Location,
  options: PathOptions = {},
): NodeEntry {
  const res = getNodeEntry(root, at, options)
  if (!res) throw new Error(`Cannot find a descendant at at [${ at }] in node: Editor`)
  return res
}

export interface NodeEntriesOptions<T extends Node> {
  at?: Location | Span
  match?: NodeMatch<T>
  mode?: 'all' | 'highest' | 'lowest'
  universal?: boolean
  reverse?: boolean
  voids?: boolean
}

export function *getNodeEntries<T extends Node>(
  editor: EditorCore,
  node: Node,
  options: NodeEntriesOptions<T> = {},
): Generator<NodeEntry<T>, void, undefined> {
  const {
    at,
    mode = 'all',
    universal = false,
    reverse = false,
    voids = false,
  } = options
  let { match } = options
  if (!match) match = () => true
  if (!at) return

  let from
  let to

  if (isSpan(at)) {
    from = at[0]
    to = at[1]
  } else {
    const first = getPath(at, { edge: 'start' })
    const last = getPath(at, { edge: 'end' })
    from = reverse ? last : first
    to = reverse ? first : last
  }

  const nodeEntries = getNodes(editor, {
    reverse,
    from,
    to,
    pass: ([n]) => (voids ? false : isVoidElement(editor, n)),
  })

  const matches: NodeEntry<T>[] = []
  let hit: NodeEntry<T> | undefined

  for (const [node, path] of nodeEntries) {
    const isLower = hit && comparePath(path, hit[1]) === 0

    if (mode === 'highest' && isLower) continue

    if (!match(node, path)) {
      if (universal && !isLower && isText(node)) return
      continue
    }

    if (mode === 'lowest' && isLower) {
      hit = [node, path]
      continue
    }

    const emit: NodeEntry<any> | undefined = mode === 'lowest'
      ? hit
      : [node, path]

    if (emit) {
      if (universal) {
        matches.push(emit)
      } else {
        yield emit
      }
    }

    hit = [node, path]
  }

  if (mode === 'lowest' && hit) {
    if (universal) {
      matches.push(hit)
    } else {
      yield hit
    }
  }

  if (universal) {
    yield * matches
  }
}

export function getFirstChildNodeEntry(root: Ancestor, at: Location): NodeEntry {
  if (isPath(at)) {
    at = at.slice()
    let node = getNodeOrFail(root, at)
    while (node) {
      if (isText(node) || node.children.length === 0) break
      node = node.children[0]
      at.push(0)
    }
    return [node, at]
  }
  return getNodeEntryOrFail(root, at, { edge: 'start' })
}

export function getLastChildNodeEntry(root: Ancestor, at: Location): NodeEntry {
  if (isPath(at)) {
    at = at.slice()
    let node = getNodeOrFail(root, at)
    while (node) {
      if (isText(node) || node.children.length === 0) break
      const last = node.children.length - 1
      node = node.children[last]
      at.push(last)
    }
    return [node, at]
  }
  return getNodeEntryOrFail(root, at, { edge: 'end' })
}

export function getParentNodeEntry(root: Ancestor, path: Path): NodeEntry<Ancestor> | null {
  path = getParentPath(path)
  const node = getNode(root, path)
  return node && !isText(node) ? [node, path] : null
}

export function getParentNodeEntryOrFail(root: Ancestor, path: Path): NodeEntry<Ancestor> {
  const entry = getParentNodeEntry(root, path)
  if (!entry) throw new Error(`Cannot get the parent of path [${ path }] because it does not exist in the root.`)
  return entry
}

export function getParentNode(root: Ancestor, path: Path): Ancestor {
  return getParentNodeEntryOrFail(root, path)[0]
}

export interface PreviousNodeOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'all' | 'highest' | 'lowest'
  voids?: boolean
}

export function getPreviousNode<T extends Node>(
  editor: EditorCore,
  root: Ancestor,
  options: PreviousNodeOptions<T> = {},
): NodeEntry<T> | undefined {
  const { mode = 'lowest', voids = false, at } = options
  let { match } = options
  if (!at) return

  const pointBeforeLocation = getBeforePoint(editor, at, { voids })
  if (!pointBeforeLocation) return

  const [, to] = getFirstChildNodeEntry(root, [])

  const span: Span = [pointBeforeLocation.path, to]

  if (isPath(at) && at.length === 0) {
    throw new Error('Cannot get the previous node from the root node!')
  }

  if (match == null) {
    if (isPath(at)) {
      const parent = getParentNode(root, at)
      match = n => parent.children.includes(n)
    } else {
      match = () => true
    }
  }

  return getNodeEntries<T>(editor, root, {
    reverse: true,
    at: span,
    match,
    mode,
    voids,
  }).next().value as any
}

export interface LevelNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  reverse?: boolean
  voids?: boolean
}

export function *getLevelNodes<T extends Node>(
  editor: EditorCore,
  options: LevelNodesOptions<T> = {},
): Generator<NodeEntry<T>, void, undefined> {
  const { at = editor.selection, reverse = false, voids = false } = options
  let { match } = options
  if (match == null) match = () => true
  if (!at) return
  const levels: NodeEntry<any>[] = []
  for (const p of getLevelPaths(getPath(at))) {
    const n = getNodeOrFail(editor, p)
    if (!match(n, p)) continue
    levels.push([n, p])
    if (!voids && isVoidElement(editor, n)) break
  }
  if (reverse) levels.reverse()
  yield * levels
}

export function getNodeTextContent(node: Node): string {
  if (isText(node)) {
    return node.text
  } else {
    return node.children.map(v => getNodeTextContent(v)).join('')
  }
}

export function extractNodeProps(node: Node): NodeProps {
  if (isAncestor(node)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children, ...properties } = node
    return properties
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { text, ...properties } = node
    return properties
  }
}

export interface InsertNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest'
  hanging?: boolean
  select?: boolean
  voids?: boolean
}

export function insertNodes<T extends Node>(
  editor: EditorCore,
  nodes: Node | Node[],
  options: InsertNodesOptions<T> = {},
): void {
  withoutNormalizing(editor, () => {
    const { hanging = false, voids = false, mode = 'lowest' } = options
    let { at, match, select: needSelect } = options

    if (isNode(nodes)) nodes = [nodes]
    if (nodes.length === 0) return

    if (!at) {
      if (editor.selection) {
        at = editor.selection
      } else if (editor.children.length > 0) {
        at = getEndPoint(editor)
      } else {
        at = [0]
      }
      needSelect = true
    }

    if (isRange(at)) {
      if (!hanging) {
        at = getUnhangRange(editor, at)
      }
      if (isCollapsedRange(at)) {
        at = at.anchor
      } else {
        const pointRef = getPointRef(editor, getRangeEndPoint(at))
        deleteNodes(editor, { at })
        at = pointRef.unref()!
      }
    }

    if (isPoint(at)) {
      const [node] = nodes

      if (match == null) {
        if (isText(node)) {
          match = n => isText(n)
        } else if (editor.isInline(node as Element)) {
          match = n => isText(n) || isInlineElement(editor, n)
        } else {
          match = n => isBlockElement(editor, n)
        }
      }

      const entry = getNodeEntries(
        editor,
        editor,
        { at: at.path, match, mode, voids },
      ).next().value as any

      if (entry) {
        const [, matchPath] = entry
        const pathRef = getPathRef(editor, matchPath)
        const isAtEnd = isEndPoint(editor, at, matchPath)
        splitNodes(editor, { at, match, mode, voids })
        const path = pathRef.unref()!
        at = isAtEnd ? getNextPath(path) : path
      } else {
        return
      }
    }

    const parentPath = getParentPath(at)
    if (!voids && editor.void({ at: parentPath })) return
    let index = at[at.length - 1]

    for (const node of nodes) {
      const path = parentPath.concat(index)
      index++
      apply(editor, { type: 'insert_node', node, path })
      at = getNextPath(at)
    }
    at = getPreviousPath(at)
    if (needSelect) {
      const point = getEndPoint(editor, at)
      if (point) {
        select(editor, point)
      }
    }
  })
}

export interface InsertTextOptions {
  at?: Location
  voids?: boolean
}

export function insertText(
  editor: EditorCore,
  text: string,
  options: InsertTextOptions = {},
): void {
  withoutNormalizing(editor, () => {
    const { voids = false } = options
    let { at = editor.selection } = options
    if (!at) return
    if (isPath(at)) at = getRange(editor, at)
    if (isRange(at)) {
      if (isCollapsedRange(at)) {
        at = at.anchor
      } else {
        const end = getRangeEndPoint(at)
        if (!voids && editor.void({ at: end })) return
        const start = getRangeStartPoint(at)
        const startRef = getPointRef(editor, start)
        const endRef = getPointRef(editor, end)
        deleteNodes(editor, { at, voids })
        const startPoint = startRef.unref()
        const endPoint = endRef.unref()
        at = startPoint || endPoint!
        setSelection(editor, { anchor: at, focus: at })
      }
    }
    if (!voids && editor.void({ at })) return
    const { path, offset } = at
    if (text.length > 0) {
      apply(editor, { type: 'insert_text', path, offset, text })
    }
  })
}

export interface SplitNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest'
  always?: boolean
  height?: number
  voids?: boolean
}

export function splitNodes<T extends Node>(
  editor: EditorCore,
  options: SplitNodesOptions<T> = {},
): void {
  withoutNormalizing(editor, () => {
    const { mode = 'lowest', voids = false } = options
    let { match, at = editor.selection, height = 0, always = false } = options
    if (!match) match = n => isBlockElement(editor, n)
    if (isRange(at)) at = deleteRange(editor, at)!
    if (isPath(at)) {
      const path = at
      const point = getPoint(editor, path)
      const parent = getParentNode(editor, path)
      match = n => n === parent
      height = point.path.length - path.length + 1
      at = point
      always = true
    }
    if (!at) return
    const beforeRef = getPointRef(editor, at, { affinity: 'backward' })
    let afterRef: PointRef | undefined
    try {
      const [highest] = getNodeEntries(editor, editor, { at, match, mode, voids })
      if (!highest) return

      const voidMatch = editor.void({ at, mode: 'highest' })
      const nudge = 0

      if (!voids && voidMatch) {
        const [voidNode, voidPath] = voidMatch

        if (isInlineElement(editor, voidNode)) {
          let after = getAfterPoint(editor, voidPath)
          if (!after) {
            const text = { text: '' }
            const afterPath = getNextPath(voidPath)
            insertNodes(editor, text, { at: afterPath, voids })
            after = getPoint(editor, afterPath)!
          }
          at = after
          always = true
        }

        const siblingHeight = at.path.length - voidPath.length
        height = siblingHeight + 1
        always = true
      }

      afterRef = getPointRef(editor, at)
      const depth = at.path.length - height
      const [, highestPath] = highest
      const lowestPath = at.path.slice(0, depth)
      let position = height === 0 ? at.offset : at.path[depth] + nudge

      for (const [node, path] of getLevelNodes(editor, { at: lowestPath, reverse: true, voids })) {
        let split = false

        if (
          path.length < highestPath.length
          || path.length === 0
          || (!voids && isVoidElement(editor, node))
        ) {
          break
        }

        const point = beforeRef.current!
        const isEnd = isEndPoint(editor, point, path)

        if (always || !beforeRef || !isEdgePoint(editor, point, path)) {
          split = true
          const properties = extractNodeProps(node)
          apply(editor, {
            type: 'split_node',
            path,
            position,
            properties,
          })
        }
        position = path[path.length - 1] + (split || isEnd ? 1 : 0)
      }

      if (options.at == null) {
        select(editor, afterRef.current || getEndPoint(editor, []))
      }
    } finally {
      beforeRef.unref()
      afterRef?.unref()
    }
  })
}

export interface WrapNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest' | 'all'
  split?: boolean
  voids?: boolean
}

export function wrapNodes<T extends Node>(
  editor: EditorCore,
  element: Element,
  options: WrapNodesOptions<T>,
): void {
  withoutNormalizing(editor, () => {
    const { mode = 'lowest', split = false, voids = false } = options
    let { match, at = editor.selection } = options
    if (!at) return

    if (match == null) {
      if (isPath(at)) {
        const node = getNode(editor, at)
        match = n => n === node
      } else if (editor.isInline(element)) {
        match = n => isText(n) || isInlineElement(editor, n)
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    if (split && isRange(at)) {
      const [start, end] = getRangeEdgePoints(at)
      const rangeRef = getRangeRef(editor, at, { affinity: 'inward' })
      splitNodes(editor, { at: end, match, voids })
      splitNodes(editor, { at: start, match, voids })
      at = rangeRef.unref()!
      if (!options.at) select(editor, at)
    }

    const roots = Array.from(
      getNodeEntries(editor, editor, {
        at,
        match: editor.isInline(element)
          ? (n: any) => isBlockElement(editor, n)
          : (n: any) => isEditor(n),
        mode: 'lowest',
        voids,
      }),
    )

    for (const [, rootPath] of roots) {
      const a = isRange(at)
        ? getIntersectionRange(at, getRange(editor, rootPath))
        : at

      if (!a) continue

      const matches = Array.from(
        getNodeEntries(editor, editor, { at: a, match, mode, voids }),
      )

      if (matches.length > 0) {
        const first = matches[0]
        const last = matches[matches.length - 1]
        const [, firstPath] = first
        const [, lastPath] = last

        if (firstPath.length === 0 && lastPath.length === 0) continue

        const commonPath = isEqualPath(firstPath, lastPath)
          ? getParentPath(firstPath)
          : getCommonPath(firstPath, lastPath)

        const range = getRange(editor, firstPath, lastPath)
        const [commonNode] = getNodeEntryOrFail(editor, commonPath)
        const wrapperPath = getNextPath(lastPath.slice(0, commonPath.length + 1))
        insertNodes(
          editor,
          { ...element, children: [] },
          { at: wrapperPath, voids },
        )
        moveNodes(editor, {
          at: range,
          match: n => isAncestor(commonNode) && commonNode.children.includes(n),
          to: wrapperPath.concat(0),
          voids,
        })
      }
    }
  })
}

export interface UnwrapNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest' | 'all'
  split?: boolean
  voids?: boolean
}

export function unwrapNodes<T extends Node>(
  editor: EditorCore,
  options: UnwrapNodesOptions<T> = {},
): void {
  withoutNormalizing(editor, () => {
    const { mode = 'lowest', split = false, voids = false } = options
    let { at = editor.selection, match } = options
    if (!at) return

    if (match == null) {
      if (isPath(at)) {
        const node = getNodeOrFail(editor, at)
        match = n => n === node
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    if (isPath(at)) at = getRange(editor, at)

    const rangeRef = isRange(at) ? getRangeRef(editor, at) : null
    const matches = getNodeEntries(editor, editor, { at, match, mode, voids })
    const pathRefs = Array.from(matches, ([, p]) => getPathRef(editor, p)).reverse()

    for (const pathRef of pathRefs) {
      const path = pathRef.unref()!
      const node = getNodeOrFail(editor, path)
      let range = getRange(editor, path)

      if (split && rangeRef) {
        range = getIntersectionRange(rangeRef.current!, range)!
      }

      liftNodes(editor, {
        at: range,
        match: n => isAncestor(node) && node.children.includes(n),
        voids,
      })
    }

    if (rangeRef) {
      rangeRef.unref()
    }
  })
}

export interface LiftNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest' | 'all'
  voids?: boolean
}

export function liftNodes<T extends Node>(
  editor: EditorCore,
  options: LiftNodesOptions<T> = {},
) {
  withoutNormalizing(editor, () => {
    const { at = editor.selection, mode = 'lowest', voids = false } = options
    let { match } = options

    if (match == null) {
      if (isPath(at)) {
        const node = getNodeOrFail(editor, at)
        match = n => n === node
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    if (!at) return

    const matches = getNodeEntries(editor, editor, { at, match, mode, voids })
    const pathRefs = Array.from(matches, ([, p]) => getPathRef(editor, p))

    for (const pathRef of pathRefs) {
      const path = pathRef.unref()!

      if (path.length < 2) {
        throw new Error(
          `Cannot lift node at a path [${ path }] because it has a depth of less than \`2\`.`,
        )
      }

      const parentNodeEntry = getNodeEntryOrFail(editor, getParentPath(path))
      const [parent, parentPath] = parentNodeEntry as NodeEntry<Ancestor>
      const index = path[path.length - 1]
      const { length } = parent.children

      if (length === 1) {
        const toPath = getNextPath(parentPath)
        moveNodes(editor, { at: path, to: toPath, voids })
        removeNodes(editor, { at: parentPath, voids })
      } else if (index === 0) {
        moveNodes(editor, { at: path, to: parentPath, voids })
      } else if (index === length - 1) {
        const toPath = getNextPath(parentPath)
        moveNodes(editor, { at: path, to: toPath, voids })
      } else {
        const splitPath = getNextPath(path)
        const toPath = getNextPath(parentPath)
        splitNodes(editor, { at: splitPath, voids })
        moveNodes(editor, { at: path, to: toPath, voids })
      }
    }
  })
}

export interface MergeNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest'
  hanging?: boolean
  voids?: boolean
}

export function mergeNodes<T extends Node>(
  editor: EditorCore,
  options: MergeNodesOptions<T> = {},
) {
  withoutNormalizing(editor, () => {
    let { match, at = editor.selection } = options
    const { hanging = false, voids = false, mode = 'lowest' } = options
    if (!at) return

    if (match == null) {
      if (isPath(at)) {
        const parent = getParentNode(editor, at)
        match = n => parent.children.includes(n)
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    if (!hanging && isRange(at)) {
      at = getUnhangRange(editor, at)
    }

    if (isRange(at)) {
      if (isCollapsedRange(at)) {
        at = at.anchor
      } else {
        const [, end] = getRangeEdgePoints(at)
        const pointRef = getPointRef(editor, end)
        deleteNodes(editor, { at })
        at = pointRef.unref()!

        if (options.at == null) {
          select(editor, at)
        }
      }
    }

    const [current] = getNodeEntries(editor, editor, { at, match, voids, mode })
    const prev = getPreviousNode(editor, editor, { at, match, voids, mode })

    if (!current || !prev) {
      return
    }

    const [node, path] = current
    const [prevNode, prevPath] = prev

    if (path.length === 0 || prevPath.length === 0) {
      return
    }

    const newPath = getNextPath(prevPath)
    const commonPath = getCommonPath(path, prevPath)
    const isPreviousSibling = isSiblingPath(path, prevPath)
    const levels = Array.from(getLevelNodes(editor, { at: path }), ([n]) => n)
      .slice(commonPath.length)
      .slice(0, -1)

    // Determine if the merge will leave an ancestor of the path empty as a
    // result, in which case we'll want to remove it after merging.
    const emptyAncestor = editor.above({
      at: path,
      mode: 'highest',
      match: n => levels.includes(n) && hasSingleChildNest(editor, n),
    })

    const emptyRef = emptyAncestor && getPathRef(editor, emptyAncestor[1])
    let properties
    let position

    // Ensure that the nodes are equivalent, and figure out what the position
    // and extra properties of the merge will be.
    if (isText(node) && isText(prevNode)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { text, ...rest } = node
      position = prevNode.text.length
      properties = rest as Partial<Text>
    } else if (isElement(node) && isElement(prevNode)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { children, ...rest } = node
      position = prevNode.children.length
      properties = rest as Partial<Element>
    } else {
      throw new TypeError(
        `Cannot merge the node at path [${ path }] with the previous sibling because it is not the same kind: ${ JSON.stringify(
          node,
        ) } ${ JSON.stringify(prevNode) }`,
      )
    }

    if (!isPreviousSibling) {
      moveNodes(editor, { at: path, to: newPath, voids })
    }

    if (emptyRef) {
      removeNodes(editor, { at: emptyRef.current!, voids })
    }

    if (
      (isElement(prevNode) && editor.isEmpty(prevNode))
      || (isText(prevNode)
        && prevNode.text === ''
        && prevPath[prevPath.length - 1] !== 0)
    ) {
      removeNodes(editor, { at: prevPath, voids })
    } else {
      apply(editor, {
        type: 'merge_node',
        path: newPath,
        position,
        properties,
      })
    }

    if (emptyRef) {
      emptyRef.unref()
    }
  })
}

export interface MoveNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest' | 'all'
  to: Path
  voids?: boolean
}

export function moveNodes<T extends Node>(
  editor: EditorCore,
  options: MoveNodesOptions<T>,
): void {
  withoutNormalizing(editor, () => {
    const { to, at = editor.selection, mode = 'lowest', voids = false } = options
    let { match } = options
    if (!at) return

    if (match == null) {
      if (isPath(at)) {
        const node = getNodeOrFail(editor, at)
        match = n => n === node
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    const toRef = getPathRef(editor, to)
    const targets = getNodeEntries(editor, editor, { at, match, mode, voids })
    const pathRefs = Array.from(targets, ([, p]) => getPathRef(editor, p))

    for (const pathRef of pathRefs) {
      const path = pathRef.unref()!
      const newPath = toRef.current!

      if (path.length !== 0) {
        apply(editor, { type: 'move_node', newPath, path })
      }

      if (
        toRef.current
        && isSiblingPath(newPath, path)
        && isAfterPath(newPath, path)
      ) {
        toRef.current = getNextPath(toRef.current)
      }
    }

    toRef.unref()
  })
}

export interface RemoveNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest'
  hanging?: boolean
  voids?: boolean
}

export function removeNodes<T extends Node>(
  editor: EditorCore,
  options: RemoveNodesOptions<T> = {},
): void {
  withoutNormalizing(editor, () => {
    const { hanging = false, voids = false, mode = 'lowest' } = options
    let { at = editor.selection, match } = options
    if (!at) return

    if (match == null) {
      if (isPath(at)) {
        const node = getNode(editor, at)
        match = n => n === node
      } else {
        match = n => isBlockElement(editor, n)
      }
    }

    if (!hanging && isRange(at)) {
      at = getUnhangRange(editor, at)
    }

    const depths = getNodeEntries(editor, editor, { at, match, mode, voids })
    const pathRefs = Array.from(depths, ([, p]) => getPathRef(editor, p))

    for (const pathRef of pathRefs) {
      const path = pathRef.unref()!

      if (path) {
        apply(editor, { type: 'remove_node', path, node: getNode(editor, path) })
      }
    }
  })
}

export interface DeleteNodeOptions {
  at?: Location
  distance?: number
  unit?: 'character' | 'word' | 'line' | 'block'
  reverse?: boolean
  hanging?: boolean
  voids?: boolean
}

export function deleteNodes(
  editor: EditorCore,
  options: DeleteNodeOptions = {},
): void {
  withoutNormalizing(editor, () => {
    const { reverse = false, unit = 'character', distance = 1, voids = false } = options
    let { at = editor.selection, hanging = false } = options
    if (!at) return

    let isCollapsed = false
    if (isRange(at) && isCollapsedRange(at)) {
      isCollapsed = true
      at = at.anchor
    }

    if (isPoint(at)) {
      const furthestVoid = editor.void({ at, mode: 'highest' })

      if (!voids && furthestVoid) {
        const [, voidPath] = furthestVoid
        at = voidPath
      } else {
        const opts = { unit, distance }
        const target = reverse
          ? getBeforePoint(editor, at, opts) || getStartPoint(editor, [])
          : getAfterPoint(editor, at, opts) || getEndPoint(editor, [])
        at = { anchor: at, focus: target }
        hanging = true
      }
    }

    if (isPath(at)) {
      removeNodes(editor, { at, voids })
      return
    }

    if (isCollapsedRange(at)) return

    if (!hanging) {
      const [, end] = getRangeEdgePoints(at)
      const endOfDoc = getEndPoint(editor, [])

      if (!isEqualPoint(end, endOfDoc)) {
        at = getUnhangRange(editor, at, { voids })
      }
    }

    let [start, end] = getRangeEdgePoints(at)
    const startBlock = editor.above({
      match: n => isBlockElement(editor, n),
      at: start,
      voids,
    })
    const endBlock = editor.above({
      match: n => isBlockElement(editor, n),
      at: end,
      voids,
    })
    const isAcrossBlocks
      = startBlock && endBlock && !isEqualPath(startBlock[1], endBlock[1])
    const isSingleText = isEqualPath(start.path, end.path)
    const startVoid = voids
      ? null
      : editor.void({ at: start, mode: 'highest' })
    const endVoid = voids
      ? null
      : editor.void({ at: end, mode: 'highest' })

    // If the start or end points are inside an inline void, nudge them out.
    if (startVoid) {
      const before = getBeforePoint(editor, start)

      if (
        before
        && startBlock
        && isAncestorPath(startBlock[1], before.path)
      ) {
        start = before
      }
    }

    if (endVoid) {
      const after = getAfterPoint(editor, end)

      if (after && endBlock && isAncestorPath(endBlock[1], after.path)) {
        end = after
      }
    }

    const matches: NodeEntry[] = []
    let lastPath: Path | undefined

    for (const entry of getNodeEntries(editor, editor, { at, voids })) {
      const [node, path] = entry

      if (lastPath && comparePath(path, lastPath) === 0) {
        continue
      }

      if (
        (!voids && isVoidElement(editor, node))
        || (!isCommonPath(path, start.path) && !isCommonPath(path, end.path))
      ) {
        matches.push(entry)
        lastPath = path
      }
    }

    const pathRefs = Array.from(matches, ([, p]) => getPathRef(editor, p))
    const startRef = getPointRef(editor, start)
    const endRef = getPointRef(editor, end)

    let removedText = ''

    if (!isSingleText && !startVoid) {
      const point = startRef.current!
      const [node] = getTextEntryOrFail(editor, point)
      const { path } = point
      const { offset } = start
      const text = node.text.slice(offset)
      if (text.length > 0) {
        apply(editor, { type: 'remove_text', path, offset, text })
        removedText = text
      }
    }

    for (const pathRef of pathRefs) {
      const path = pathRef.unref()!
      removeNodes(editor, { at: path, voids })
    }

    if (!endVoid) {
      const point = endRef.current!
      const [node] = getTextEntryOrFail(editor, point)
      const { path } = point
      const offset = isSingleText ? start.offset : 0
      const text = node.text.slice(offset, end.offset)
      if (text.length > 0) {
        apply(editor, { type: 'remove_text', path, offset, text })
        removedText = text
      }
    }

    if (
      !isSingleText
      && isAcrossBlocks
      && endRef.current
      && startRef.current
    ) {
      mergeNodes(editor, {
        at: endRef.current,
        hanging: true,
        voids,
      })
    }

    if (
      isCollapsed
      && reverse
      && unit === 'character'
      && removedText.length > 1
      && removedText.match(/[\u0E00-\u0E7F]+/)
    ) {
      insertText(
        editor,
        removedText.slice(0, removedText.length - distance),
      )
    }

    const startUnref = startRef.unref()
    const endUnref = endRef.unref()
    const point = reverse ? startUnref || endUnref : endUnref || startUnref

    if (options.at == null && point) {
      select(editor, point)
    }
  })
}

export function deleteBackward(editor: EditorCore, options: {
  unit?: 'character' | 'word' | 'line' | 'block'
} = {}): void {
  const { unit = 'character' } = options
  if (editor.selection && isCollapsedRange(editor.selection)) {
    deleteNodes(editor, { unit, reverse: true })
  }
}

export function deleteForward(editor: EditorCore, options: {
  unit?: 'character' | 'word' | 'line' | 'block'
} = {}): void {
  const { unit = 'character' } = options
  if (editor.selection && isCollapsedRange(editor.selection)) {
    deleteNodes(editor, { unit })
  }
}

export function deleteFragment(editor: EditorCore, options: {
  direction?: 'forward' | 'backward'
} = {}): void {
  const { direction } = options
  if (editor.selection && isExpandedRange(editor.selection)) {
    deleteNodes(editor, { reverse: direction === 'backward' })
  }
}

export interface SetNodesOptions<T extends Node> {
  at?: Location
  match?: NodeMatch<T>
  mode?: 'highest' | 'lowest' | 'all'
  hanging?: boolean
  split?: boolean
  voids?: boolean
  compare?: PropsCompare
  merge?: PropsMerge
}

export function setNodes<T extends Node>(
  editor: EditorCore,
  props: Partial<Node>,
  options: SetNodesOptions<T> = {},
) {
  withoutNormalizing(editor, () => {
    const { merge } = options
    const { hanging = false, mode = 'lowest', split = false, voids = false } = options
    let { match, at = editor.selection, compare } = options
    if (!at) return

    if (match == null) {
      match = isPath(at)
        ? n => n === getNodeOrFail(editor, at as Path)
        : n => isBlockElement(editor, n)
    }

    if (!hanging && isRange(at)) {
      at = getUnhangRange(editor, at)
    }

    if (split && isRange(at)) {
      if (isCollapsedRange(at) && getTextOrFail(editor, at.anchor.path).text.length > 0) return
      const rangeRef = getRangeRef(editor, at, { affinity: 'inward' })
      const [start, end] = getRangeEdgePoints(at)
      const splitMode = mode === 'lowest' ? 'lowest' : 'highest'
      splitNodes(editor, { at: end, match, mode: splitMode, voids, always: !isEndPoint(editor, end, end.path) })
      splitNodes(editor, { at: start, match, mode: splitMode, voids, always: !isStartPoint(editor, start, start.path) })
      at = rangeRef.unref()!

      if (options.at == null) select(editor, at)
    }

    if (!compare) {
      compare = (prop, nodeProp) => prop !== nodeProp
    }

    for (const [node, path] of getNodeEntries(editor, editor, { at, match, mode, voids })) {
      const properties: Partial<Node> = {}
      const newProperties: Partial<Node> = {}
      if (path.length === 0) continue
      let hasChanges = false
      for (const k in props) {
        if (k === 'children' || k === 'text') continue
        if (compare((props as any)[k], (node as any)[k])) {
          hasChanges = true
          // eslint-disable-next-line no-prototype-builtins
          if (node.hasOwnProperty?.(k)) (properties as any)[k] = (node as any)[k]
          if (merge) {
            if ((props as any)[k] != null) (newProperties as any)[k] = merge((node as any)[k], (props as any)[k])
          } else {
            if ((props as any)[k] != null) (newProperties as any)[k] = (props as any)[k]
          }
        }
      }

      if (hasChanges) {
        apply(editor, {
          type: 'set_node',
          path,
          properties,
          newProperties,
        })
      }
    }
  })
}
