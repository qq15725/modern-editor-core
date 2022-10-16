import { isElement } from './element'
import { getNodeEntries, getNodeEntryOrFail, hasNode } from './node'
import type { EditorCore } from './types'

export function normalize(editor: EditorCore, options: { force?: boolean } = {}): void {
  if (!editor.isNormalizing) return
  const { force = false } = options
  const popDirtyPath = () => {
    const path = editor.dirtyPaths.pop()!
    const key = path.join(',')
    editor.dirtyPathKeys.delete(key)
    return path
  }
  if (force) {
    editor.dirtyPaths = Array.from(getNodeEntries(editor, editor), ([, p]) => p)
    editor.dirtyPathKeys = new Set(editor.dirtyPaths.map(p => p.join(',')))
  }
  if (editor.dirtyPaths.length === 0) return
  withoutNormalizing(editor, () => {
    for (const dirtyPath of editor.dirtyPaths) {
      if (hasNode(editor, dirtyPath)) {
        const entry = getNodeEntryOrFail(editor, dirtyPath)
        const node = entry[0]
        if (isElement(node) && node.children.length === 0) editor.normalizeNode(entry)
      }
    }
    const max = editor.dirtyPaths.length * 42
    let m = 0
    while (editor.dirtyPaths.length !== 0) {
      if (m > max) {
        throw new Error(`Could not completely normalize the editor after ${ max } iterations! This is usually due to incorrect normalization logic that leaves a node in an invalid state.`)
      }
      const dirtyPath = popDirtyPath()
      if (hasNode(editor, dirtyPath)) {
        editor.normalizeNode(getNodeEntryOrFail(editor, dirtyPath))
      }
      m++
    }
  })
}

export function withoutNormalizing(editor: EditorCore, fn: () => void): void {
  const value = editor.isNormalizing
  editor.isNormalizing = false
  try {
    fn()
  } finally {
    editor.isNormalizing = value
  }
  normalize(editor)
}
