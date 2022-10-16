import { isElement, isInlineElement, isVoidElement } from './element'
import { useEditorListener } from './listener'
import {
  getLevelNodes,
  getNodeEntries,
  getNodeOrFail,
  insertNodes,
  isNodes, mergeNodes, removeNodes,
  splitNodes,
} from './node'
import {
  getAncestorPaths,
  getLevelPaths,
  getNextPath,
  getPath,
  getPreviousPath,
  isEqualPath,
  transformPath,
} from './path'
import { isEqualText, isText } from './text'
import { isPlainObject } from './utils'
import type { Node } from './node'
import type { PointRef } from './point'
import type { Path, PathRef } from './path'
import type { Range, RangeRef } from './range'
import type { Descendant } from './descendant'
import type { EditorCore } from './types'

export function isEditor(value: any): value is EditorCore {
  return Boolean(
    isPlainObject(value)
    && isNodes(value.children)
    && value.__editor__,
  )
}

export function createEditorCore(children: Node[] = [], selection?: Range): EditorCore {
  return {
    ...useEditorListener(),
    __editor__: true,
    pathRefs: new Set<PathRef>(),
    pointRefs: new Set<PointRef>(),
    rangeRefs: new Set<RangeRef>(),
    dirtyPaths: [],
    dirtyPathKeys: new Set(),
    isNormalizing: true,
    operations: [],
    applying: false,
    selection,
    children,
    isBlock(value) {
      return !this.isInline(value)
    },
    isInline: () => false,
    isVoid: () => false,
    isEmpty(element): boolean {
      const { children } = element
      const first = children[0]
      return (
        children.length === 0
        || (
          children.length === 1
          && isText(first)
          && first.text === ''
          && !this.isVoid(element)
        )
      )
    },
    hasInlines(element) {
      return element.children.some(n => isText(n) || isInlineElement(this, n))
    },
    void(options = {}) {
      return this.above({ ...options, match: n => isVoidElement(this, n) })
    },
    above(options = {}) {
      const { voids = false, mode = 'lowest', at = this.selection, match } = options
      if (!at) return undefined
      const path = getPath(at)
      const reverse = mode === 'lowest'
      for (const [n, p] of getLevelNodes(this, { at: path, voids, match, reverse })) {
        if (!isText(n) && !isEqualPath(path, p)) {
          return [n, p]
        }
      }
      return undefined
    },
    insertBreak() {
      splitNodes(this, { always: true })
    },
    insertSoftBreak() {
      splitNodes(this, { always: true })
    },
    normalizeNode(entry) {
      const [node, path] = entry
      if (isText(node)) return
      if (isElement(node) && node.children.length === 0) {
        insertNodes(this, { text: '' }, { at: path.concat(0), voids: true })
        return
      }
      const shouldHaveInlines = isEditor(node)
        ? false
        : isElement(node)
        && (this.isInline(node)
          || node.children.length === 0
          || isText(node.children[0])
          || isInlineElement(this, node.children[0]))
      let n = 0
      for (let i = 0; i < node.children.length; i++, n++) {
        const currentNode = getNodeOrFail(this, path)
        if (isText(currentNode)) continue
        const child = node.children[i] as Descendant
        const prev = currentNode.children[n - 1] as Descendant
        const isLast = i === node.children.length - 1
        const isInlineOrText
          = isText(child)
          || (isElement(child) && this.isInline(child))
        if (isInlineOrText !== shouldHaveInlines) {
          removeNodes(this, { at: path.concat(n), voids: true })
          n--
        } else if (isElement(child)) {
          if (this.isInline(child)) {
            if (prev == null || !isText(prev)) {
              const newChild = { text: '' }
              insertNodes(this, newChild, { at: path.concat(n), voids: true })
              n++
            } else if (isLast) {
              const newChild = { text: '' }
              insertNodes(this, newChild, { at: path.concat(n + 1), voids: true })
              n++
            }
          }
        } else {
          if (prev != null && isText(prev)) {
            if (isEqualText(child, prev, { loose: true })) {
              mergeNodes(this, { at: path.concat(n), voids: true })
              n--
            } else if (prev.text === '') {
              removeNodes(this, { at: path.concat(n - 1), voids: true })
              n--
            } else if (child.text === '') {
              removeNodes(this, { at: path.concat(n), voids: true })
              n--
            }
          }
        }
      }
    },
    getDirtyPaths(op) {
      switch (op.type) {
        case 'insert_text':
        case 'remove_text':
        case 'set_node': {
          return getLevelPaths(op.path)
        }

        case 'insert_node': {
          const { node, path } = op
          const levels = getLevelPaths(path)
          const descendants = isText(node)
            ? []
            : Array.from(getNodeEntries(this, node), ([, p]) => path.concat(p))

          return [...levels, ...descendants]
        }

        case 'merge_node': {
          const { path } = op
          const ancestors = getAncestorPaths(path)
          const previousPath = getPreviousPath(path)
          return [...ancestors, previousPath]
        }

        case 'move_node': {
          const { path, newPath } = op

          if (isEqualPath(path, newPath)) {
            return []
          }

          const oldAncestors: Path[] = []
          const newAncestors: Path[] = []

          for (const ancestor of getAncestorPaths(path)) {
            const p = transformPath(ancestor, op)
            oldAncestors.push(p!)
          }

          for (const ancestor of getAncestorPaths(newPath)) {
            const p = transformPath(ancestor, op)
            newAncestors.push(p!)
          }

          const newParent = newAncestors[newAncestors.length - 1]
          const newIndex = newPath[newPath.length - 1]
          const resultPath = newParent.concat(newIndex)

          return [...oldAncestors, ...newAncestors, resultPath]
        }

        case 'remove_node': {
          return [...getAncestorPaths(op.path)]
        }

        case 'split_node': {
          const { path } = op
          const levels = getLevelPaths(path)
          const nextPath = getNextPath(path)
          return [...levels, nextPath]
        }

        default: {
          return []
        }
      }
    },
  } as EditorCore
}
