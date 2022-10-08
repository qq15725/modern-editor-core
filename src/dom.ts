import DOMNode = globalThis.Node
import DOMComment = globalThis.Comment
import DOMElement = globalThis.Element
import DOMText = globalThis.Text
import DOMRange = globalThis.Range
import DOMSelection = globalThis.Selection
import DOMStaticRange = globalThis.StaticRange

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
