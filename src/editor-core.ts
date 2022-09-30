import { useEditorApply } from './apply'
import { useEditorElement } from './element'
import { useEditorListener } from './listener'
import { useEditorPoint } from './point'
import { useEditorNode } from './node'
import { useEditorPath } from './path'
import { useEditorRange } from './range'
import { useEditorSelection } from './selection'
import { useEditorSpan } from './span'
import { useEditorText } from './text'
import { isPlainObject } from './utils'
import type { EditorCore, Node, Range } from './types'

export function createEditorCore(children: Node[] = [], selection?: Range): EditorCore {
  return {
    ...useEditorApply(),
    ...useEditorElement(),
    ...useEditorListener(),
    ...useEditorNode(),
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
  } as EditorCore
}
