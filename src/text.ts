import { isPlainObject } from './utils'
import type { EditorText, Node, Text } from './types'

export function useEditorText(): EditorText {
  return {
    isText(value): value is Text {
      return isPlainObject(value) && typeof value.text === 'string'
    },
    getText(path) {
      const node = this.getNode(path)
      if (!this.isText(node)) throw new Error(`Cannot get the leaf node at path [${ path }] because it refers to a non-leaf node: ${ JSON.stringify(node) }`)
      return node
    },
    queryText(at, options = {}) {
      const path = this.getPath(at, options)
      const node = this.getText(path)
      return [node, path]
    },
    *getTexts(options) {
      for (const [node, path] of this.getNodes(options)) {
        if (this.isText(node)) {
          yield [node, path]
        }
      }
    },
    getTextContent(at, options = {}) {
      const { voids = false } = options
      const range = this.getRange(at)
      const [start, end] = this.getRangeEdges(range)
      let text = ''
      for (const [node, path] of this.queryNodes<Text>({
        at: range,
        match: (node: Node) => this.isText(node),
        voids,
      })) {
        let t = node.text
        if (this.equalsPath(path, end.path)) t = t.slice(0, end.offset)
        if (this.equalsPath(path, start.path)) t = t.slice(start.offset)
        text += t
      }
      return text
    },
  }
}
