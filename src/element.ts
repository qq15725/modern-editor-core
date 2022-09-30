import { isPlainObject } from './utils'
import type { Ancestor, EditorElement, Element } from './types'

export function useEditorElement(): EditorElement {
  return {
    isElement(value): value is Element {
      return (
        isPlainObject(value)
        && this.isNodeList(value.children)
        && !value.__editor__
      )
    },
    isBlockElement(value): value is Element {
      return this.isElement(value) && this.isBlock(value)
    },
    isInlineElement(value): value is Element {
      return this.isElement(value) && this.isInline(value)
    },
    isVoidElement(value): value is Element {
      return this.isElement(value) && this.isVoid(value)
    },
    isAncestor(value): value is Ancestor {
      return isPlainObject(value) && this.isNodeList(value.children)
    },
  }
}
