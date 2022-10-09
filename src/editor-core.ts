import { useEditorApply } from './apply'
import { useEditorElement } from './element'
import { useEditorListener } from './listener'
import { useEditorPoint } from './point'
import { useEditorNode } from './node'
import { useEditorNormalize } from './normalize'
import { useEditorPath } from './path'
import { useEditorRange } from './range'
import { useEditorSelection } from './selection'
import { useEditorSpan } from './span'
import { useEditorText } from './text'
import { isPlainObject } from './utils'
import type { Descendant, EditorCore, Node, Path, Range } from './types'

export function createEditorCore(children: Node[] = [], selection?: Range): EditorCore {
  return {
    ...useEditorApply(),
    ...useEditorElement(),
    ...useEditorListener(),
    ...useEditorNode(),
    ...useEditorNormalize(),
    ...useEditorPath(),
    ...useEditorPoint(),
    ...useEditorRange(),
    ...useEditorSelection(),
    ...useEditorSpan(),
    ...useEditorText(),
    __editor__: true,
    children,
    selection,
    isEditor(value): value is EditorCore {
      return Boolean(
        isPlainObject(value)
        && this.isNodeList(value.children)
        && value.__editor__,
      )
    },
    isBlock(value) {
      return !this.isInline(value)
    },
    isInline() {
      return false
    },
    isVoid() {
      return false
    },
    isEmpty(element): boolean {
      const { children } = element
      const first = children[0]
      return (
        children.length === 0
        || (
          children.length === 1
          && this.isText(first)
          && first.text === ''
          && !this.isVoid(element)
        )
      )
    },
    hasInlines(element) {
      return element.children.some(n => this.isText(n) || this.isInlineElement(n))
    },
    void(options = {}) {
      return this.above({ ...options, match: n => this.isVoidElement(n) })
    },
    above(options = {}) {
      const { voids = false, mode = 'lowest', at = this.selection, match } = options
      if (!at) return undefined
      const path = this.getPath(at)
      const reverse = mode === 'lowest'
      for (const [n, p] of this.getLevelNodes({ at: path, voids, match, reverse })) {
        if (!this.isText(n) && !this.equalsPath(path, p)) {
          return [n, p]
        }
      }
      return undefined
    },
    insertBreak() {
      this.splitNodes({ always: true })
    },
    insertSoftBreak() {
      this.splitNodes({ always: true })
    },
    normalizeNode(entry) {
      const [node, path] = entry
      if (this.isText(node)) return
      if (this.isElement(node) && node.children.length === 0) {
        this.insertNodes({ text: '' }, { at: path.concat(0), voids: true })
        return
      }
      const shouldHaveInlines = this.isEditor(node)
        ? false
        : this.isElement(node)
        && (this.isInline(node)
          || node.children.length === 0
          || this.isText(node.children[0])
          || this.isInlineElement(node.children[0]))
      let n = 0
      for (let i = 0; i < node.children.length; i++, n++) {
        const currentNode = this.getNode(path)
        if (this.isText(currentNode)) continue
        const child = node.children[i] as Descendant
        const prev = currentNode.children[n - 1] as Descendant
        const isLast = i === node.children.length - 1
        const isInlineOrText
          = this.isText(child)
          || (this.isElement(child) && this.isInline(child))
        if (isInlineOrText !== shouldHaveInlines) {
          this.removeNodes({ at: path.concat(n), voids: true })
          n--
        } else if (this.isElement(child)) {
          if (this.isInline(child)) {
            if (prev == null || !this.isText(prev)) {
              const newChild = { text: '' }
              this.insertNodes(newChild, { at: path.concat(n), voids: true })
              n++
            } else if (isLast) {
              const newChild = { text: '' }
              this.insertNodes(newChild, { at: path.concat(n + 1), voids: true })
              n++
            }
          }
        } else {
          if (prev != null && this.isText(prev)) {
            if (this.equalsText(child, prev, { loose: true })) {
              this.mergeNodes({ at: path.concat(n), voids: true })
              n--
            } else if (prev.text === '') {
              this.removeNodes({ at: path.concat(n - 1), voids: true })
              n--
            } else if (child.text === '') {
              this.removeNodes({ at: path.concat(n), voids: true })
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
          return this.getLevelPaths(op.path)
        }

        case 'insert_node': {
          const { node, path } = op
          const levels = this.getLevelPaths(path)
          const descendants = this.isText(node)
            ? []
            : Array.from(this.queryNodes({ root: node }), ([, p]) => path.concat(p))

          return [...levels, ...descendants]
        }

        case 'merge_node': {
          const { path } = op
          const ancestors = this.getAncestorPaths(path)
          const previousPath = this.getPreviousPath(path)
          return [...ancestors, previousPath]
        }

        case 'move_node': {
          const { path, newPath } = op

          if (this.equalsPath(path, newPath)) {
            return []
          }

          const oldAncestors: Path[] = []
          const newAncestors: Path[] = []

          for (const ancestor of this.getAncestorPaths(path)) {
            const p = this.transformPath(ancestor, op)
            oldAncestors.push(p!)
          }

          for (const ancestor of this.getAncestorPaths(newPath)) {
            const p = this.transformPath(ancestor, op)
            newAncestors.push(p!)
          }

          const newParent = newAncestors[newAncestors.length - 1]
          const newIndex = newPath[newPath.length - 1]
          const resultPath = newParent.concat(newIndex)

          return [...oldAncestors, ...newAncestors, resultPath]
        }

        case 'remove_node': {
          return [...this.getAncestorPaths(op.path)]
        }

        case 'split_node': {
          const { path } = op
          const levels = this.getLevelPaths(path)
          const nextPath = this.getNextPath(path)
          return [...levels, nextPath]
        }

        default: {
          return []
        }
      }
    },
  } as EditorCore
}
