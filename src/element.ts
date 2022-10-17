import { getCurrentEditor } from './editor-core'
import { isNodes } from './node'
import { isText } from './text'
import { isPlainObject } from './utils'
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

export function isBlockElement(value: any): value is Element {
  const editor = getCurrentEditor()
  return isElement(value) && (!editor || editor.isBlock(value))
}

export function isInlineElement(value: any): value is Element {
  const editor = getCurrentEditor()
  return isElement(value) && (!editor || editor.isInline(value))
}

export function isVoidElement(value: any): value is Element {
  const editor = getCurrentEditor()
  return isElement(value) && (!editor || editor.isVoid(value))
}

export function hasInlines(element: Element): boolean {
  return element.children.some(n => isText(n) || isInlineElement(n))
}
