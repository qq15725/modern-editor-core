import { createDraft, finishDraft, isDraft } from 'immer'
import { getCurrentEditorOrFail } from './editor-core'
import { getNode, getNodeOrFail, getParentNode } from './node'
import { normalize } from './normalize'
import { getDirtyPaths } from './operation'
import {
  comparePath,
  getCommonPath,
  getParentPath,
  getPreviousPath, hasPreviousPath,
  isAncestorPath,
  isEqualPath,
  transformPath,
} from './path'
import { transformPoint } from './point'
import { getRangePoints, isRange, transformRange } from './range'
import { getTextEntries, getTextOrFail, isText } from './text'
import type { NodeEntry } from './node'
import type { Descendant } from './descendant'
import type { Element } from './element'
import type { Text } from './text'
import type { Range } from './range'
import type { Ancestor } from './ancestor'
import type { Operation } from './operation'
import type { EditorCore } from './editor-core'
import type { Path } from './Path'

export function apply(op: Operation): void {
  const editor = getCurrentEditorOrFail()
  for (const ref of editor.pathRefs) {
    const { current, affinity } = ref
    if (current) {
      const path = transformPath(current, op, { affinity })
      ref.current = path
      if (!path) ref.unref()
    }
  }

  for (const ref of editor.pointRefs) {
    const { current, affinity } = ref
    if (current) {
      const point = transformPoint(current, op, { affinity })
      ref.current = point
      if (!point) ref.unref()
    }
  }

  for (const ref of editor.rangeRefs) {
    const { current, affinity } = ref
    if (current) {
      const path = transformRange(current, op, { affinity })
      ref.current = path
      if (!path) ref.unref()
    }
  }

  const oldDirtyPaths = editor.dirtyPaths
  const oldDirtyPathKeys = editor.dirtyPathKeys
  let dirtyPaths: Path[]
  let dirtyPathKeys: Set<string>

  const add = (path: Path | null) => {
    if (path) {
      const key = path.join(',')
      if (!dirtyPathKeys.has(key)) {
        dirtyPathKeys.add(key)
        dirtyPaths.push(path)
      }
    }
  }

  if (['insert_node', 'remove_node', 'merge_node', 'split_node', 'move_node'].includes(op.type)) {
    dirtyPaths = []
    dirtyPathKeys = new Set<string>()
    for (const path of oldDirtyPaths) add(transformPath(path, op))
  } else {
    dirtyPaths = oldDirtyPaths
    dirtyPathKeys = oldDirtyPathKeys
  }

  for (const path of getDirtyPaths(op)) add(path)

  editor.dirtyPaths = dirtyPaths
  editor.dirtyPathKeys = dirtyPathKeys
  applyTransform(editor, op)
  editor.operations.push(op)
  normalize()

  if (!editor.applying) {
    editor.applying = true
    Promise.resolve().then(() => {
      editor.applying = false
      editor.emit('change', op)
      editor.operations = []
    })
  }
}

export function applyTransform(editor: EditorCore, op: Operation): void {
  editor.children = createDraft(editor.children)
  let selection = editor.selection
    ? createDraft(editor.selection)
    : undefined
  try {
    selection = applyToDraft(editor, selection, op)
  } finally {
    editor.children = finishDraft(editor.children)
    if (selection) {
      editor.selection = isDraft(selection)
        ? (finishDraft(selection) as unknown as Range)
        : selection as unknown as Range
    } else {
      editor.selection = undefined
    }
  }
  editor.emit(op.type, op)
}

export function applyToDraft(editor: EditorCore, selection: Range | undefined, op: Operation) {
  selection = selection
    ? {
        anchor: {
          path: [...selection.anchor.path],
          offset: selection.anchor.offset,
        },
        focus: {
          path: [...selection.focus.path],
          offset: selection.focus.offset,
        },
      }
    : undefined
  switch (op.type) {
    case 'insert_node': {
      const { path, node } = op
      const parent = getParentNode(path)
      const index = path[path.length - 1]
      if (index > parent.children.length) throw new Error(`Cannot apply an "insert_node" operation at path [${ path }] because the destination is past the end of the node.`)
      parent.children.splice(index, 0, node)
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
    case 'insert_text': {
      const { path, offset, text } = op
      if (text.length === 0) break
      const node = getTextOrFail(path)
      const before = node.text.slice(0, offset)
      const after = node.text.slice(offset)
      node.text = before + text + after
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
    case 'merge_node': {
      const { path } = op
      const node = getNodeOrFail(path)
      const prevPath = getPreviousPath(path)
      const prev = getNodeOrFail(prevPath)
      const parent = getParentNode(path)
      const index = path[path.length - 1]
      if (isText(node) && isText(prev)) {
        prev.text += node.text
      } else if (!isText(node) && !isText(prev)) {
        prev.children.push(...node.children)
      } else {
        throw new Error(`Cannot apply a "merge_node" operation at path [${ path }] to nodes of different interfaces: ${ JSON.stringify(node) } ${ JSON.stringify(prev) }`)
      }
      parent.children.splice(index, 1)
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
    case 'move_node': {
      const { path, newPath } = op
      if (isAncestorPath(path, newPath)) {
        throw new Error(`Cannot move a path [${ path }] to new path [${ newPath }] because the destination is inside itself.`)
      }
      const node = getNodeOrFail(path)
      const parent = getParentNode(path)
      const index = path[path.length - 1]
      parent.children.splice(index, 1)
      const truePath = transformPath(path, op)!
      const newParent = getNode(getParentPath(truePath)) as Ancestor
      const newIndex = truePath[truePath.length - 1]
      newParent.children.splice(newIndex, 0, node)
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
    case 'remove_node': {
      const { path } = op
      const index = path[path.length - 1]
      const parent = getParentNode(path)
      parent.children.splice(index, 1)
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          const result = transformPoint(point, op)
          if (result != null) {
            selection[key] = result
          } else {
            let prev: NodeEntry<Text> | undefined
            let next: NodeEntry<Text> | undefined
            for (const [n, p] of getTextEntries()) {
              if (comparePath(p, path) === -1) {
                prev = [n, p]
              } else {
                next = [n, p]
                break
              }
            }
            let preferNext = false
            if (prev && next) {
              if (isEqualPath(next[1], path)) {
                preferNext = !hasPreviousPath(next[1])
              } else {
                preferNext
                  = getCommonPath(prev[1], path).length
                  < getCommonPath(next[1], path).length
              }
            }
            if (prev && !preferNext) {
              point.path = prev[1]
              point.offset = prev[0].text.length
            } else if (next) {
              point.path = next[1]
              point.offset = 0
            } else {
              editor.selection = undefined
            }
          }
        }
      }
      break
    }
    case 'remove_text': {
      const { path, offset, text } = op
      if (text.length === 0) break
      const node = getTextOrFail(path)
      const before = node.text.slice(0, offset)
      const after = node.text.slice(offset + text.length)
      node.text = before + after
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
    case 'set_node': {
      const { path, properties, newProperties } = op
      if (path.length === 0) throw new Error('Cannot set properties on the root node!')
      const node = getNodeOrFail(path)
      for (const key in newProperties) {
        if (key === 'children' || key === 'text') throw new Error(`Cannot set the "${ key }" property of nodes!`)
        const value = newProperties[key as keyof typeof newProperties]
        if (value == null) {
          delete node[key as keyof typeof node]
        } else {
          node[key as keyof typeof node] = value
        }
      }
      for (const key in properties) {
        // eslint-disable-next-line no-prototype-builtins
        if (!newProperties.hasOwnProperty(key)) {
          delete node[key as keyof typeof node]
        }
      }
      break
    }
    case 'set_selection': {
      const { newProperties } = op
      if (!newProperties) {
        selection = undefined
      } else {
        if (!selection) {
          if (!isRange(newProperties)) throw new Error(`Cannot apply an incomplete "set_selection" operation properties ${ JSON.stringify(newProperties) } when there is no current selection.`)
          selection = { ...newProperties }
        }
        for (const key in newProperties) {
          const value = newProperties[key as keyof typeof newProperties]
          if (!value) {
            if (key === 'anchor' || key === 'focus') throw new Error(`Cannot remove the "${ key }" selection property`)
            delete selection[key as keyof typeof selection]
          } else {
            selection[key as keyof typeof selection] = value
          }
        }
      }
      break
    }
    case 'split_node': {
      const { path, position, properties } = op
      if (path.length === 0) throw new Error(`Cannot apply a "split_node" operation at path [${ path }] because the root node cannot be split.`)
      const node = getNodeOrFail(path)
      const parent = getParentNode(path)
      const index = path[path.length - 1]
      let newNode: Descendant
      if (isText(node)) {
        const before = node.text.slice(0, position)
        const after = node.text.slice(position)
        node.text = before
        newNode = {
          ...(properties as Partial<Text>),
          text: after,
        }
      } else {
        const before = node.children.slice(0, position)
        const after = node.children.slice(position)
        node.children = before
        newNode = {
          ...(properties as Partial<Element>),
          children: after,
        }
      }
      parent.children.splice(index + 1, 0, newNode)
      if (selection) {
        for (const [point, key] of getRangePoints(selection)) {
          selection[key] = transformPoint(point, op)!
        }
      }
      break
    }
  }
  return selection
}
