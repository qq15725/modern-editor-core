import { createDraft, finishDraft, isDraft } from 'immer'
import type { Ancestor, Descendant, EditorApply, NodeEntry, Range, Text } from './types'

export function useEditorApply(): EditorApply {
  return {
    apply(op) {
      for (const ref of this.getPathRefs()) {
        const { current, affinity } = ref
        if (current) {
          const path = this.transformPath(current, op, { affinity })
          ref.current = path
          if (!path) ref.unref()
        }
      }

      for (const ref of this.getPointRefs()) {
        const { current, affinity } = ref
        if (current) {
          const point = this.transformPoint(current, op, { affinity })
          ref.current = point
          if (!point) ref.unref()
        }
      }

      for (const ref of this.getRangeRefs()) {
        const { current, affinity } = ref
        if (current) {
          const path = this.transformRange(current, op, { affinity })
          ref.current = path
          if (!path) ref.unref()
        }
      }

      this.children = createDraft(this.children)
      let selection = this.selection
        ? createDraft(this.selection)
        : undefined

      try {
        selection = this.applyToDraft(selection, op)
      } finally {
        this.children = finishDraft(this.children)
        if (selection) {
          this.selection = isDraft(selection)
            ? (finishDraft(selection) as unknown as Range)
            : selection as unknown as Range
        } else {
          this.selection = undefined
        }
      }

      this.emit(op.type, op)
      this.emit('change', op)
    },
    applyToDraft(selection, op) {
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
          const parent = this.getParentNode(path)
          const index = path[path.length - 1]
          if (index > parent.children.length) throw new Error(`Cannot apply an "insert_node" operation at path [${ path }] because the destination is past the end of the node.`)
          parent.children.splice(index, 0, node)
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
        case 'insert_text': {
          const { path, offset, text } = op
          if (text.length === 0) break
          const node = this.getText(path)
          const before = node.text.slice(0, offset)
          const after = node.text.slice(offset)
          node.text = before + text + after
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
        case 'merge_node': {
          const { path } = op
          const node = this.getNode(path)
          const prevPath = this.getPreviousPath(path)
          const prev = this.getNode(prevPath)
          const parent = this.getParentNode(path)
          const index = path[path.length - 1]
          if (this.isText(node) && this.isText(prev)) {
            prev.text += node.text
          } else if (!this.isText(node) && !this.isText(prev)) {
            prev.children.push(...node.children)
          } else {
            throw new Error(`Cannot apply a "merge_node" operation at path [${ path }] to nodes of different interfaces: ${ JSON.stringify(node) } ${ JSON.stringify(prev) }`)
          }
          parent.children.splice(index, 1)
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
        case 'move_node': {
          const { path, newPath } = op
          if (this.isAncestorPath(path, newPath)) {
            throw new Error(`Cannot move a path [${ path }] to new path [${ newPath }] because the destination is inside itself.`)
          }
          const node = this.getNode(path)
          const parent = this.getParentNode(path)
          const index = path[path.length - 1]
          parent.children.splice(index, 1)
          const truePath = this.transformPath(path, op)!
          const newParent = this.getNode(this.getParentPath(truePath)) as Ancestor
          const newIndex = truePath[truePath.length - 1]
          newParent.children.splice(newIndex, 0, node)
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
        case 'remove_node': {
          const { path } = op
          const index = path[path.length - 1]
          const parent = this.getParentNode(path)
          parent.children.splice(index, 1)
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              const result = this.transformPoint(point, op)
              if (result != null) {
                selection[key] = result
              } else {
                let prev: NodeEntry<Text> | undefined
                let next: NodeEntry<Text> | undefined
                for (const [n, p] of this.getTexts()) {
                  if (this.comparePath(p, path) === -1) {
                    prev = [n, p]
                  } else {
                    next = [n, p]
                    break
                  }
                }
                let preferNext = false
                if (prev && next) {
                  if (this.equalsPath(next[1], path)) {
                    preferNext = !this.hasPreviousPath(next[1])
                  } else {
                    preferNext
                      = this.getCommonPath(prev[1], path).length
                      < this.getCommonPath(next[1], path).length
                  }
                }
                if (prev && !preferNext) {
                  point.path = prev[1]
                  point.offset = prev[0].text.length
                } else if (next) {
                  point.path = next[1]
                  point.offset = 0
                } else {
                  this.selection = undefined
                }
              }
            }
          }
          break
        }
        case 'remove_text': {
          const { path, offset, text } = op
          if (text.length === 0) break
          const node = this.getText(path)
          const before = node.text.slice(0, offset)
          const after = node.text.slice(offset + text.length)
          node.text = before + after
          if (selection) {
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
        case 'set_node': {
          const { path, properties, newProperties } = op
          if (path.length === 0) throw new Error('Cannot set properties on the root node!')
          const node = this.getNode(path)
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
              if (!this.isRange(newProperties)) throw new Error(`Cannot apply an incomplete "set_selection" operation properties ${ JSON.stringify(newProperties) } when there is no current selection.`)
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
          const node = this.getNode(path)
          const parent = this.getParentNode(path)
          const index = path[path.length - 1]
          let newNode: Descendant
          if (this.isText(node)) {
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
            for (const [point, key] of this.getRangePoints(selection)) {
              selection[key] = this.transformPoint(point, op)!
            }
          }
          break
        }
      }
      return selection
    },
  }
}
