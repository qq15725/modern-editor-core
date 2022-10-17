import { getAboveVoidNodeEntry } from './node'
import { isBackwardRange, isCollapsedRange } from './range'
import DOMNode = globalThis.Node
import DOMComment = globalThis.Comment
import DOMElement = globalThis.Element
import DOMText = globalThis.Text
import DOMRange = globalThis.Range
import DOMSelection = globalThis.Selection
import DOMStaticRange = globalThis.StaticRange
import type { Point } from './point'
import type { Range } from './range'
import type { EditorCore } from './editor-core'

export type DOMPoint = [DOMNode, number]

export {
  DOMNode,
  DOMComment,
  DOMElement,
  DOMText,
  DOMRange,
  DOMSelection,
  DOMStaticRange,
}

export const isDOMNode = (value: any): value is DOMNode => value instanceof DOMNode
export const isDOMElement = (value: any): value is DOMElement => isDOMNode(value) && value.nodeType === 1
export const isDOMText = (value: any): value is DOMText => isDOMNode(value) && value.nodeType === 3
export const isDOMComment = (value: any): value is DOMComment => isDOMNode(value) && value.nodeType === 8

export function getEditableChild(parent: DOMElement, index: number, direction: 'forward' | 'backward'): DOMNode {
  const { childNodes } = parent
  let child = childNodes[index]
  let i = index
  let triedForward = false
  let triedBackward = false
  while (
    isDOMComment(child)
    || (isDOMElement(child) && child.childNodes.length === 0)
    || (isDOMElement(child) && child.getAttribute('contenteditable') === 'false')
  ) {
    if (triedForward && triedBackward) break
    if (i >= childNodes.length) {
      triedForward = true
      i = index - 1
      direction = 'backward'
      continue
    }
    if (i < 0) {
      triedBackward = true
      i = index + 1
      direction = 'forward'
      continue
    }
    child = childNodes[i]
    i += direction === 'forward' ? 1 : -1
  }
  return child
}

export function normalizeDOMPoint(domPoint: DOMPoint): DOMPoint {
  let [node, offset] = domPoint
  if (isDOMElement(node) && node.childNodes.length) {
    const isLast = offset === node.childNodes.length
    const direction = isLast ? 'backward' : 'forward'
    node = getEditableChild(node, isLast ? offset - 1 : offset, direction)
    while (isDOMElement(node) && node.childNodes.length) {
      node = getEditableChild(node, isLast ? node.childNodes.length - 1 : 0, direction)
    }
    offset = isLast && node.textContent != null ? node.textContent.length : 0
  }
  return [node, offset]
}

export function domPointToPoint(domPoint: DOMPoint): Point {
  const [nearestNode, nearestOffset] = normalizeDOMPoint(domPoint)
  const parentNode = nearestNode.parentNode as DOMElement
  let textNode: DOMElement | null = null
  let offset = 0
  if (parentNode) {
    const voidNode = parentNode.closest('[data-editor-void="true"]')
    let leafNode = parentNode.closest('[data-editor-leaf]')
    let domNode: DOMElement | null = null
    if (leafNode) {
      textNode = leafNode.closest('[data-editor-node="text"]')!
      const range = window.document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(nearestNode, nearestOffset)
      const contents = range.cloneContents()
      ;([
        ...contents.querySelectorAll('[data-editor-zero-width]'),
        ...contents.querySelectorAll('[contenteditable=false]'),
      ]).forEach(el => el!.parentNode!.removeChild(el))
      offset = contents.textContent!.length
      domNode = textNode
    } else if (voidNode) {
      leafNode = voidNode.querySelector('[data-editor-leaf]')!
      textNode = leafNode.closest('[data-editor-node="text"]')!
      domNode = leafNode
      offset = domNode.textContent!.length
    }
    if (
      domNode
      && offset === domNode.textContent!.length
      && parentNode.hasAttribute('data-editor-zero-width')
    ) {
      offset--
    }
  }
  if (!textNode) throw new Error(`Cannot resolve a point from DOM point: ${ JSON.stringify(domPoint) }`)
  const path = textNode.getAttribute('data-editor-path')?.split('-')?.map(v => Number(v))
  if (!path) throw new Error(`Cannot resolve a point from DOM point: ${ JSON.stringify(domPoint) }`)
  return { path, offset }
}

export function domRangeToRange(domRange: DOMRange | DOMStaticRange | DOMSelection): Range {
  const el = domRange instanceof Selection ? domRange.anchorNode : domRange.startContainer
  let anchorNode
  let anchorOffset
  let focusNode
  let focusOffset
  let isCollapsed
  if (el) {
    if (domRange instanceof Selection) {
      anchorNode = domRange.anchorNode
      anchorOffset = domRange.anchorOffset
      focusNode = domRange.focusNode
      focusOffset = domRange.focusOffset
      isCollapsed = domRange.isCollapsed
    } else {
      anchorNode = domRange.startContainer
      anchorOffset = domRange.startOffset
      focusNode = domRange.endContainer
      focusOffset = domRange.endOffset
      isCollapsed = domRange.collapsed
    }
  }
  if (anchorNode == null || focusNode == null || anchorOffset == null || focusOffset == null) {
    throw new Error(`Cannot resolve a range from DOM range: ${ domRange }`)
  }
  const anchor = domPointToPoint([anchorNode, anchorOffset])
  return {
    anchor,
    focus: isCollapsed ? anchor : domPointToPoint([focusNode, focusOffset]),
  }
}

export function pointToDomPoint(editor: EditorCore, point: Point): DOMPoint {
  const el = document.querySelector(`[data-editor-path="${ point.path.join('-') }"]`)
  let domPoint: DOMPoint | undefined
  if (getAboveVoidNodeEntry({ at: point })) point = { path: point.path, offset: 0 }
  const texts = Array.from<HTMLElement>(el?.querySelectorAll('[data-editor-string], [data-editor-zero-width]') ?? [])
  let start = 0
  for (const text of texts) {
    const domNode = text.childNodes[0] as HTMLElement
    if (domNode == null || domNode.textContent == null) continue
    const { length } = domNode.textContent
    const attr = text.getAttribute('data-editor-length')
    const trueLength = attr == null ? length : parseInt(attr, 10)
    const end = start + trueLength
    if (point.offset <= end) {
      const offset = Math.min(length, Math.max(0, point.offset - start))
      domPoint = [domNode, offset]
      break
    }
    start = end
  }
  if (!domPoint) throw new Error(`Cannot resolve a DOM point from point: ${ JSON.stringify(point) }`)
  return domPoint
}

export function rangeToDomRange(editor: EditorCore, range: Range): DOMRange {
  const { anchor, focus } = range
  const isBackward = isBackwardRange(range)
  const domAnchor = pointToDomPoint(editor, anchor)
  const domFocus = isCollapsedRange(range) ? domAnchor : pointToDomPoint(editor, focus)
  const domRange = window.document.createRange()
  const [startNode, startOffset] = isBackward ? domFocus : domAnchor
  const [endNode, endOffset] = isBackward ? domAnchor : domFocus
  const startEl = (isDOMElement(startNode) ? startNode : startNode.parentElement) as HTMLElement
  const isStartAtZeroWidth = !!startEl.getAttribute('data-editor-zero-width')
  const endEl = (isDOMElement(endNode) ? endNode : endNode.parentElement) as HTMLElement
  const isEndAtZeroWidth = !!endEl.getAttribute('data-editor-zero-width')
  domRange.setStart(startNode, isStartAtZeroWidth ? 1 : startOffset)
  domRange.setEnd(endNode, isEndAtZeroWidth ? 1 : endOffset)
  return domRange
}
