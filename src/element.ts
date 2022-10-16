import { isNodes } from './node'
import { isPlainObject } from './utils'
import type { EditorCore } from './types'
import type { Node } from './node'

export interface Element {
  children: Node[]
  [key: string]: unknown
}

export function isElement(value: any): value is Element {
  return isPlainObject(value)
    && isNodes(value.children)
    && !value.__editor__
}

export function isBlockElement(editor: EditorCore, value: any): value is Element {
  return isElement(value) && editor.isBlock(value)
}

export function isInlineElement(editor: EditorCore, value: any): value is Element {
  return isElement(value) && editor.isInline(value)
}

export function isVoidElement(editor: EditorCore, value: any): value is Element {
  return isElement(value) && editor.isVoid(value)
}
