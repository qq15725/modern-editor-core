import { getCurrentEditorOrFail, isEditor } from './editor-core'
import { isElement, isInlineElement } from './element'
import {
  getNodeEntries,
  getNodeEntryOrFail,
  getNodeOrFail,
  hasNode,
  insertNodes,
  mergeNodes,
  removeNodes,
} from './node'
import { isEqualText, isText } from './text'
import type { NodeEntry } from './node'
import type { Descendant } from './descendant'

export function normalizeNode(entry: NodeEntry) {
  const editor = getCurrentEditorOrFail()
  const [node, path] = entry
  if (isText(node)) return
  if (isElement(node) && node.children.length === 0) {
    insertNodes({ text: '' }, { at: path.concat(0), voids: true })
    return
  }
  const shouldHaveInlines = isEditor(node)
    ? false
    : isElement(node)
    && (editor.isInline(node)
      || node.children.length === 0
      || isText(node.children[0])
      || isInlineElement(node.children[0]))
  let n = 0
  for (let i = 0; i < node.children.length; i++, n++) {
    const currentNode = getNodeOrFail(path)
    if (isText(currentNode)) continue
    const child = node.children[i] as Descendant
    const prev = currentNode.children[n - 1] as Descendant
    const isLast = i === node.children.length - 1
    const isInlineOrText
      = isText(child)
      || (isElement(child) && editor.isInline(child))
    if (isInlineOrText !== shouldHaveInlines) {
      removeNodes({ at: path.concat(n), voids: true })
      n--
    } else if (isElement(child)) {
      if (editor.isInline(child)) {
        if (prev == null || !isText(prev)) {
          const newChild = { text: '' }
          insertNodes(newChild, { at: path.concat(n), voids: true })
          n++
        } else if (isLast) {
          const newChild = { text: '' }
          insertNodes(newChild, { at: path.concat(n + 1), voids: true })
          n++
        }
      }
    } else {
      if (prev != null && isText(prev)) {
        if (isEqualText(child, prev, { loose: true })) {
          mergeNodes({ at: path.concat(n), voids: true })
          n--
        } else if (prev.text === '') {
          removeNodes({ at: path.concat(n - 1), voids: true })
          n--
        } else if (child.text === '') {
          removeNodes({ at: path.concat(n), voids: true })
          n--
        }
      }
    }
  }
}

export function normalize(options: { force?: boolean } = {}): void {
  const editor = getCurrentEditorOrFail()
  if (!editor.isNormalizing) return
  const { force = false } = options
  const popDirtyPath = () => {
    const path = editor.dirtyPaths.pop()!
    const key = path.join(',')
    editor.dirtyPathKeys.delete(key)
    return path
  }
  if (force) {
    editor.dirtyPaths = Array.from(getNodeEntries(), ([, p]) => p)
    editor.dirtyPathKeys = new Set(editor.dirtyPaths.map(p => p.join(',')))
  }
  if (editor.dirtyPaths.length === 0) return
  withoutNormalizing(() => {
    for (const dirtyPath of editor.dirtyPaths) {
      if (hasNode(dirtyPath)) {
        const entry = getNodeEntryOrFail(dirtyPath)
        const node = entry[0]
        if (isElement(node) && node.children.length === 0) normalizeNode(entry)
      }
    }
    const max = editor.dirtyPaths.length * 42
    let m = 0
    while (editor.dirtyPaths.length !== 0) {
      if (m > max) {
        throw new Error(`Could not completely normalize the editor after ${ max } iterations! This is usually due to incorrect normalization logic that leaves a node in an invalid state.`)
      }
      const dirtyPath = popDirtyPath()
      if (hasNode(dirtyPath)) {
        normalizeNode(getNodeEntryOrFail(dirtyPath))
      }
      m++
    }
  })
}

export function withoutNormalizing(fn: () => void): void {
  const editor = getCurrentEditorOrFail()
  const value = editor.isNormalizing
  editor.isNormalizing = false
  try {
    fn()
  } finally {
    editor.isNormalizing = value
  }
  normalize()
}
