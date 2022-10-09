import type { Ancestor, EditorCore, EditorNode, Element, Node, NodeEntry, Path, PointRef, Span } from './types'

const IS_NODE_LIST_CACHE = new WeakMap<any[], boolean>()

const hasSingleChildNest = (editor: EditorCore, node: Node): boolean => {
  if (editor.isElement(node)) {
    const element = node as Element
    if (editor.isVoid(node)) {
      return true
    } else if (element.children.length === 1) {
      return hasSingleChildNest(editor, element.children[0] as unknown as Node)
    } else {
      return false
    }
  } else if (editor.isEditor(node)) {
    return false
  } else {
    return true
  }
}

export function useEditorNode(): EditorNode {
  return {
    isNode(value): value is Node {
      return this.isText(value) || this.isElement(value)
    },
    isNodeList(value: any): value is Node[] {
      if (!Array.isArray(value)) return false
      const cachedResult = IS_NODE_LIST_CACHE.get(value)
      if (cachedResult !== undefined) return cachedResult
      const isNodeList = value.every(val => this.isNode(val))
      IS_NODE_LIST_CACHE.set(value, isNodeList)
      return isNodeList
    },
    hasNode(path) {
      let node: Node = this as EditorCore
      for (let i = 0; i < path.length; i++) {
        const p = path[i]
        if (this.isText(node) || !node.children[p]) {
          return false
        }
        node = node.children[p]
      }
      return true
    },
    *getNodes(options = {}): Generator<NodeEntry, void, undefined> {
      const { from = [], to, pass, reverse = false, root = this } = options
      const visited = new Set()
      let p: Path = []
      let n = root as Node

      while (true) {
        if (to && (reverse ? this.isBeforePath(p, to) : this.isAfterPath(p, to))) break

        if (!visited.has(n)) yield [n, p]

        if (
          !visited.has(n)
          && !this.isText(n)
          && n.children.length !== 0
          && (pass == null || pass([n, p]) === false)
        ) {
          visited.add(n)
          let nextIndex = reverse ? n.children.length - 1 : 0
          if (this.isAncestorPath(p, from)) {
            nextIndex = from[p.length]
          }
          p = p.concat(nextIndex)
          n = this.getNode(p)
          continue
        }

        if (p.length === 0) break

        if (!reverse) {
          const newPath = this.getNextPath(p)

          if (this.hasNode(newPath)) {
            p = newPath
            n = this.getNode(p)
            continue
          }
        }

        if (reverse && p[p.length - 1] !== 0) {
          const newPath = this.getPreviousPath(p)
          p = newPath
          n = this.getNode(p)
          continue
        }

        p = this.getParentPath(p)
        n = this.getNode(p)
        visited.add(n)
      }
    },
    *queryNodes(options = {}) {
      const { root = this, at = this.selection, mode = 'all', universal = false, reverse = false, voids = false } = options
      let { match } = options
      if (!match) match = () => true
      if (!at) return

      let from
      let to

      if (this.isSpan(at)) {
        from = at[0]
        to = at[1]
      } else {
        const first = this.getPath(at, { edge: 'start' })
        const last = this.getPath(at, { edge: 'end' })
        from = reverse ? last : first
        to = reverse ? first : last
      }

      const nodeEntries = this.getNodes({
        root,
        reverse,
        from,
        to,
        pass: ([n]) => (voids ? false : this.isVoidElement(n)),
      })

      const matches: NodeEntry<any>[] = []
      let hit: NodeEntry<any> | undefined

      for (const [node, path] of nodeEntries) {
        const isLower = hit && this.comparePath(path, hit[1]) === 0

        if (mode === 'highest' && isLower) continue

        if (!match(node, path)) {
          if (universal && !isLower && this.isText(node)) return
          continue
        }

        if (mode === 'lowest' && isLower) {
          hit = [node, path]
          continue
        }

        const emit: NodeEntry<any> | undefined = mode === 'lowest'
          ? hit
          : [node, path]

        if (emit) {
          if (universal) {
            matches.push(emit)
          } else {
            yield emit
          }
        }

        hit = [node, path]
      }

      if (mode === 'lowest' && hit) {
        if (universal) {
          matches.push(hit)
        } else {
          yield hit
        }
      }

      if (universal) {
        yield * matches
      }
    },
    getNode(path) {
      let node: Node = this as EditorCore
      for (let i = 0; i < path.length; i++) {
        const p = path[i]
        if (this.isText(node) || !node.children[p]) throw new Error(`Cannot find a descendant at path [${ path }] in node: Editor`)
        node = node.children[p]
      }
      return node
    },
    queryNode(at, options = {}) {
      const p = this.getPath(at, options)
      return [this.getNode(p), p]
    },
    extractNodeProps(node) {
      if (this.isAncestor(node)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { children, ...properties } = node
        return properties
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { text, ...properties } = node
        return properties
      }
    },
    getParentNode(path) {
      return this.queryParentNode(path)[0]
    },
    queryParentNode(path) {
      path = this.getParentPath(path)
      const node = this.getNode(path)
      if (this.isText(node)) throw new Error(`Cannot get the parent of path [${ path }] because it does not exist in the root.`)
      return [node, path]
    },
    queryPreviousNode(options = {}) {
      const { mode = 'lowest', voids = false, at = this.selection } = options
      let { match } = options
      if (!at) return

      const pointBeforeLocation = this.getBeforePoint(at, { voids })
      if (!pointBeforeLocation) return

      const [, to] = this.queryFirstNode([])

      const span: Span = [pointBeforeLocation.path, to]

      if (this.isPath(at) && at.length === 0) {
        throw new Error('Cannot get the previous node from the root node!')
      }

      if (match == null) {
        if (this.isPath(at)) {
          const parent = this.getParentNode(at)
          match = n => parent.children.includes(n)
        } else {
          match = () => true
        }
      }

      const [previous] = this.queryNodes({
        reverse: true,
        at: span,
        match,
        mode,
        voids,
      })

      return previous
    },
    getFirstNode(path) {
      const p = path.slice()
      let n = this.getNode(p)
      while (n) {
        if (this.isText(n) || n.children.length === 0) break
        n = n.children[0]
        p.push(0)
      }
      return [n, p]
    },
    queryFirstNode(at) {
      if (this.isPath(at)) {
        return this.getFirstNode(at)
      }
      return this.queryNode(at, { edge: 'start' })
    },
    getLastNode(path) {
      const p = path.slice()
      let n = this.getNode(p)
      while (n) {
        if (this.isText(n) || n.children.length === 0) break
        const i = n.children.length - 1
        n = n.children[i]
        p.push(i)
      }
      return [n, p]
    },
    queryLastNode(at) {
      if (this.isPath(at)) {
        return this.getLastNode(at)
      }
      return this.queryNode(at, { edge: 'end' })
    },
    *getLevelNodes(options = {}) {
      const { at = this.selection, reverse = false, voids = false } = options
      let { match } = options
      if (match == null) match = () => true
      if (!at) return
      const levels: NodeEntry<any>[] = []
      for (const p of this.getLevelPaths(this.getPath(at))) {
        const n = this.getNode(p)
        if (!match(n, p)) continue
        levels.push([n, p])
        if (!voids && this.isVoidElement(n)) break
      }
      if (reverse) levels.reverse()
      yield * levels
    },
    getNodeTextContent(node) {
      if (this.isText(node)) {
        return node.text
      } else {
        return node.children.map(v => this.getNodeTextContent(v)).join('')
      }
    },
    insertNodes(nodes, options = {}) {
      this.withoutNormalizing(() => {
        const { hanging = false, voids = false, mode = 'lowest' } = options
        let { at, match, select } = options

        if (this.isNode(nodes)) nodes = [nodes]
        if (nodes.length === 0) return

        if (!at) {
          if (this.selection) {
            at = this.selection
          } else if (this.children.length > 0) {
            at = this.getEndPoint([])
          } else {
            at = [0]
          }
          select = true
        }

        if (this.isRange(at)) {
          if (!hanging) {
            at = this.getUnhangRange(at)
          }
          if (this.isCollapsedRange(at)) {
            at = at.anchor
          } else {
            const pointRef = this.getPointRef(this.getRangeEndPoint(at))
            this.delete({ at })
            at = pointRef.unref()!
          }
        }

        if (this.isPoint(at)) {
          const [node] = nodes

          if (match == null) {
            if (this.isText(node)) {
              match = n => this.isText(n)
            } else if (this.isInline(node as Element)) {
              match = n => this.isText(n) || this.isInlineElement(n)
            } else {
              match = n => this.isBlockElement(n)
            }
          }

          const entry = this.queryNodes({ at: at.path, match, mode, voids }).next().value

          if (entry) {
            const [, matchPath] = entry
            const pathRef = this.getPathRef(matchPath)
            const isAtEnd = this.isEndPoint(at, matchPath)
            this.splitNodes({ at, match, mode, voids })
            const path = pathRef.unref()!
            at = isAtEnd ? this.getNextPath(path) : path
          } else {
            return
          }
        }

        const parentPath = this.getParentPath(at)
        if (!voids && this.void({ at: parentPath })) return
        let index = at[at.length - 1]

        for (const node of nodes) {
          const path = parentPath.concat(index)
          index++
          this.apply({ type: 'insert_node', node, path })
          at = this.getNextPath(at)
        }
        at = this.getPreviousPath(at)

        if (select) {
          const point = this.getEndPoint(at)
          if (point) {
            this.select(point)
          }
        }
      })
    },
    insertText(text, options = {}) {
      this.withoutNormalizing(() => {
        const { voids = false } = options
        let { at = this.selection } = options
        if (!at) return
        if (this.isPath(at)) at = this.getRange(at)
        if (this.isRange(at)) {
          if (this.isCollapsedRange(at)) {
            at = at.anchor
          } else {
            const end = this.getRangeEndPoint(at)
            if (!voids && this.void({ at: end })) return
            const start = this.getRangeStartPoint(at)
            const startRef = this.getPointRef(start)
            const endRef = this.getPointRef(end)
            this.delete({ at, voids })
            const startPoint = startRef.unref()
            const endPoint = endRef.unref()
            at = startPoint || endPoint!
            this.setSelection({ anchor: at, focus: at })
          }
        }
        if (!voids && this.void({ at })) return
        const { path, offset } = at
        if (text.length > 0) {
          this.apply({ type: 'insert_text', path, offset, text })
        }
      })
    },
    splitNodes(options = {}) {
      this.withoutNormalizing(() => {
        const { mode = 'lowest', voids = false } = options
        let { match, at = this.selection, height = 0, always = false } = options
        if (!match) match = n => this.isBlockElement(n)
        if (this.isRange(at)) at = this.deleteRange(at)!
        if (this.isPath(at)) {
          const path = at
          const point = this.getPoint(path)
          const parent = this.getParentNode(path)
          match = n => n === parent
          height = point.path.length - path.length + 1
          at = point
          always = true
        }
        if (!at) return
        const beforeRef = this.getPointRef(at, { affinity: 'backward' })
        let afterRef: PointRef | undefined
        try {
          const [highest] = this.queryNodes({ at, match, mode, voids })
          if (!highest) return

          const voidMatch = this.void({ at, mode: 'highest' })
          const nudge = 0

          if (!voids && voidMatch) {
            const [voidNode, voidPath] = voidMatch

            if (this.isInlineElement(voidNode)) {
              let after = this.getAfterPoint(voidPath)
              if (!after) {
                const text = { text: '' }
                const afterPath = this.getNextPath(voidPath)
                this.insertNodes(text, { at: afterPath, voids })
                after = this.getPoint(afterPath)!
              }
              at = after
              always = true
            }

            const siblingHeight = at.path.length - voidPath.length
            height = siblingHeight + 1
            always = true
          }

          afterRef = this.getPointRef(at)
          const depth = at.path.length - height
          const [, highestPath] = highest
          const lowestPath = at.path.slice(0, depth)
          let position = height === 0 ? at.offset : at.path[depth] + nudge

          for (const [node, path] of this.getLevelNodes({ at: lowestPath, reverse: true, voids })) {
            let split = false

            if (
              path.length < highestPath.length
              || path.length === 0
              || (!voids && this.isVoidElement(node))
            ) {
              break
            }

            const point = beforeRef.current!
            const isEnd = this.isEndPoint(point, path)

            if (always || !beforeRef || !this.isEdgePoint(point, path)) {
              split = true
              const properties = this.extractNodeProps(node)
              this.apply({
                type: 'split_node',
                path,
                position,
                properties,
              })
            }
            position = path[path.length - 1] + (split || isEnd ? 1 : 0)
          }

          if (options.at == null) {
            this.select(afterRef.current || this.getEndPoint([]))
          }
        } finally {
          beforeRef.unref()
          afterRef?.unref()
        }
      })
    },
    setNodes(props, options = {}) {
      this.withoutNormalizing(() => {
        const { merge } = options
        const { hanging = false, mode = 'lowest', split = false, voids = false } = options
        let { match, at = this.selection, compare } = options
        if (!at) return

        if (match == null) {
          match = this.isPath(at)
            ? n => n === this.getNode(at as Path)
            : n => this.isBlockElement(n)
        }

        if (!hanging && this.isRange(at)) {
          at = this.getUnhangRange(at)
        }

        if (split && this.isRange(at)) {
          if (this.isCollapsedRange(at) && this.getText(at.anchor.path).text.length > 0) return
          const rangeRef = this.getRangeRef(at, { affinity: 'inward' })
          const [start, end] = this.getRangeEdges(at)
          const splitMode = mode === 'lowest' ? 'lowest' : 'highest'
          this.splitNodes({ at: end, match, mode: splitMode, voids, always: !this.isEndPoint(end, end.path) })
          this.splitNodes({ at: start, match, mode: splitMode, voids, always: !this.isStartPoint(start, start.path) })
          at = rangeRef.unref()!

          if (options.at == null) this.select(at)
        }

        if (!compare) {
          compare = (prop, nodeProp) => prop !== nodeProp
        }

        for (const [node, path] of this.queryNodes({ at, match, mode, voids })) {
          const properties: Partial<Node> = {}
          const newProperties: Partial<Node> = {}
          if (path.length === 0) continue
          let hasChanges = false
          for (const k in props) {
            if (k === 'children' || k === 'text') continue
            if (compare((props as any)[k], (node as any)[k])) {
              hasChanges = true
              // eslint-disable-next-line no-prototype-builtins
              if (node.hasOwnProperty?.(k)) (properties as any)[k] = (node as any)[k]
              if (merge) {
                if ((props as any)[k] != null) (newProperties as any)[k] = merge((node as any)[k], (props as any)[k])
              } else {
                if ((props as any)[k] != null) (newProperties as any)[k] = (props as any)[k]
              }
            }
          }

          if (hasChanges) {
            this.apply({
              type: 'set_node',
              path,
              properties,
              newProperties,
            })
          }
        }
      })
    },
    wrapNodes(element, options = {}) {
      this.withoutNormalizing(() => {
        const { mode = 'lowest', split = false, voids = false } = options
        let { match, at = this.selection } = options
        if (!at) return

        if (match == null) {
          if (this.isPath(at)) {
            const node = this.getNode(at)
            match = n => n === node
          } else if (this.isInline(element)) {
            match = n => this.isText(n) || this.isInlineElement(n)
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        if (split && this.isRange(at)) {
          const [start, end] = this.getRangeEdges(at)
          const rangeRef = this.getRangeRef(at, { affinity: 'inward' })
          this.splitNodes({ at: end, match, voids })
          this.splitNodes({ at: start, match, voids })
          at = rangeRef.unref()!
          if (!options.at) this.select(at)
        }

        const roots = Array.from(
          this.queryNodes({
            at,
            match: this.isInline(element)
              ? (n: any) => this.isBlockElement(n)
              : (n: any) => this.isEditor(n),
            mode: 'lowest',
            voids,
          }),
        )

        for (const [, rootPath] of roots) {
          const a = this.isRange(at)
            ? this.getIntersectionRange(at, this.getRange(rootPath))
            : at

          if (!a) continue

          const matches = Array.from(
            this.queryNodes({ at: a, match, mode, voids }),
          )

          if (matches.length > 0) {
            const first = matches[0]
            const last = matches[matches.length - 1]
            const [, firstPath] = first
            const [, lastPath] = last

            if (firstPath.length === 0 && lastPath.length === 0) continue

            const commonPath = this.equalsPath(firstPath, lastPath)
              ? this.getParentPath(firstPath)
              : this.getCommonPath(firstPath, lastPath)

            const range = this.getRange(firstPath, lastPath)
            const [commonNode] = this.queryNode(commonPath)
            const wrapperPath = this.getNextPath(lastPath.slice(0, commonPath.length + 1))
            this.insertNodes(
              { ...element, children: [] },
              { at: wrapperPath, voids },
            )
            this.moveNodes({
              at: range,
              match: n => this.isAncestor(commonNode) && commonNode.children.includes(n),
              to: wrapperPath.concat(0),
              voids,
            })
          }
        }
      })
    },
    unwrapNodes(options = {}) {
      this.withoutNormalizing(() => {
        const { mode = 'lowest', split = false, voids = false } = options
        let { at = this.selection, match } = options
        if (!at) return

        if (match == null) {
          if (this.isPath(at)) {
            const node = this.getNode(at)
            match = n => n === node
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        if (this.isPath(at)) at = this.getRange(at)

        const rangeRef = this.isRange(at) ? this.getRangeRef(at) : null
        const matches = this.queryNodes({ at, match, mode, voids })
        const pathRefs = Array.from(matches, ([, p]) => this.getPathRef(p)).reverse()

        for (const pathRef of pathRefs) {
          const path = pathRef.unref()!
          const node = this.getNode(path)
          let range = this.getRange(path)

          if (split && rangeRef) {
            range = this.getIntersectionRange(rangeRef.current!, range)!
          }

          this.liftNodes({
            at: range,
            match: n => this.isAncestor(node) && node.children.includes(n),
            voids,
          })
        }

        if (rangeRef) {
          rangeRef.unref()
        }
      })
    },
    liftNodes(options = {}) {
      this.withoutNormalizing(() => {
        const { at = this.selection, mode = 'lowest', voids = false } = options
        let { match } = options

        if (match == null) {
          if (this.isPath(at)) {
            const node = this.getNode(at)
            match = n => n === node
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        if (!at) return

        const matches = this.queryNodes({ at, match, mode, voids })
        const pathRefs = Array.from(matches, ([, p]) => this.getPathRef(p))

        for (const pathRef of pathRefs) {
          const path = pathRef.unref()!

          if (path.length < 2) {
            throw new Error(
              `Cannot lift node at a path [${ path }] because it has a depth of less than \`2\`.`,
            )
          }

          const parentNodeEntry = this.queryNode(this.getParentPath(path))
          const [parent, parentPath] = parentNodeEntry as NodeEntry<Ancestor>
          const index = path[path.length - 1]
          const { length } = parent.children

          if (length === 1) {
            const toPath = this.getNextPath(parentPath)
            this.moveNodes({ at: path, to: toPath, voids })
            this.removeNodes({ at: parentPath, voids })
          } else if (index === 0) {
            this.moveNodes({ at: path, to: parentPath, voids })
          } else if (index === length - 1) {
            const toPath = this.getNextPath(parentPath)
            this.moveNodes({ at: path, to: toPath, voids })
          } else {
            const splitPath = this.getNextPath(path)
            const toPath = this.getNextPath(parentPath)
            this.splitNodes({ at: splitPath, voids })
            this.moveNodes({ at: path, to: toPath, voids })
          }
        }
      })
    },
    moveNodes(options) {
      this.withoutNormalizing(() => {
        const { to, at = this.selection, mode = 'lowest', voids = false } = options
        let { match } = options
        if (!at) return

        if (match == null) {
          if (this.isPath(at)) {
            const node = this.getNode(at)
            match = n => n === node
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        const toRef = this.getPathRef(to)
        const targets = this.queryNodes({ at, match, mode, voids })
        const pathRefs = Array.from(targets, ([, p]) => this.getPathRef(p))

        for (const pathRef of pathRefs) {
          const path = pathRef.unref()!
          const newPath = toRef.current!

          if (path.length !== 0) {
            this.apply({ type: 'move_node', newPath, path })
          }

          if (
            toRef.current
            && this.isSiblingPath(newPath, path)
            && this.isAfterPath(newPath, path)
          ) {
            toRef.current = this.getNextPath(toRef.current)
          }
        }

        toRef.unref()
      })
    },
    removeNodes(options = {}) {
      this.withoutNormalizing(() => {
        const { hanging = false, voids = false, mode = 'lowest' } = options
        let { at = this.selection, match } = options
        if (!at) return

        if (match == null) {
          if (this.isPath(at)) {
            const node = this.getNode(at)
            match = n => n === node
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        if (!hanging && this.isRange(at)) {
          at = this.getUnhangRange(at)
        }

        const depths = this.queryNodes({ at, match, mode, voids })
        const pathRefs = Array.from(depths, ([, p]) => this.getPathRef(p))

        for (const pathRef of pathRefs) {
          const path = pathRef.unref()!

          if (path) {
            this.apply({ type: 'remove_node', path, node: this.getNode(path) })
          }
        }
      })
    },
    mergeNodes(options = {}) {
      this.withoutNormalizing(() => {
        let { match, at = this.selection } = options
        const { hanging = false, voids = false, mode = 'lowest' } = options
        if (!at) return

        if (match == null) {
          if (this.isPath(at)) {
            const parent = this.getParentNode(at)
            match = n => parent.children.includes(n)
          } else {
            match = n => this.isBlockElement(n)
          }
        }

        if (!hanging && this.isRange(at)) {
          at = this.getUnhangRange(at)
        }

        if (this.isRange(at)) {
          if (this.isCollapsedRange(at)) {
            at = at.anchor
          } else {
            const [, end] = this.getRangeEdges(at)
            const pointRef = this.getPointRef(end)
            this.delete({ at })
            at = pointRef.unref()!

            if (options.at == null) {
              this.select(at)
            }
          }
        }

        const [current] = this.queryNodes({ at, match, voids, mode })
        const prev = this.queryPreviousNode({ at, match, voids, mode })

        if (!current || !prev) {
          return
        }

        const [node, path] = current
        const [prevNode, prevPath] = prev

        if (path.length === 0 || prevPath.length === 0) {
          return
        }

        const newPath = this.getNextPath(prevPath)
        const commonPath = this.getCommonPath(path, prevPath)
        const isPreviousSibling = this.isSiblingPath(path, prevPath)
        const levels = Array.from(this.getLevelNodes({ at: path }), ([n]) => n)
          .slice(commonPath.length)
          .slice(0, -1)

        // Determine if the merge will leave an ancestor of the path empty as a
        // result, in which case we'll want to remove it after merging.
        const emptyAncestor = this.above({
          at: path,
          mode: 'highest',
          match: n => levels.includes(n) && hasSingleChildNest(this, n),
        })

        const emptyRef = emptyAncestor && this.getPathRef(emptyAncestor[1])
        let properties
        let position

        // Ensure that the nodes are equivalent, and figure out what the position
        // and extra properties of the merge will be.
        if (this.isText(node) && this.isText(prevNode)) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { text, ...rest } = node
          position = prevNode.text.length
          properties = rest as Partial<Text>
        } else if (this.isElement(node) && this.isElement(prevNode)) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { children, ...rest } = node
          position = prevNode.children.length
          properties = rest as Partial<Element>
        } else {
          throw new TypeError(
            `Cannot merge the node at path [${ path }] with the previous sibling because it is not the same kind: ${ JSON.stringify(
              node,
            ) } ${ JSON.stringify(prevNode) }`,
          )
        }

        if (!isPreviousSibling) {
          this.moveNodes({ at: path, to: newPath, voids })
        }

        if (emptyRef) {
          this.removeNodes({ at: emptyRef.current!, voids })
        }

        if (
          (this.isElement(prevNode) && this.isEmpty(prevNode))
          || (this.isText(prevNode)
            && prevNode.text === ''
            && prevPath[prevPath.length - 1] !== 0)
        ) {
          this.removeNodes({ at: prevPath, voids })
        } else {
          this.apply({
            type: 'merge_node',
            path: newPath,
            position,
            properties,
          })
        }

        if (emptyRef) {
          emptyRef.unref()
        }
      })
    },
    delete(options = {}) {
      this.withoutNormalizing(() => {
        const { reverse = false, unit = 'character', distance = 1, voids = false } = options
        let { at = this.selection, hanging = false } = options
        if (!at) return

        let isCollapsed = false
        if (this.isRange(at) && this.isCollapsedRange(at)) {
          isCollapsed = true
          at = at.anchor
        }

        if (this.isPoint(at)) {
          const furthestVoid = this.void({ at, mode: 'highest' })

          if (!voids && furthestVoid) {
            const [, voidPath] = furthestVoid
            at = voidPath
          } else {
            const opts = { unit, distance }
            const target = reverse
              ? this.getBeforePoint(at, opts) || this.getStartPoint([])
              : this.getAfterPoint(at, opts) || this.getEndPoint([])
            at = { anchor: at, focus: target }
            hanging = true
          }
        }

        if (this.isPath(at)) {
          this.removeNodes({ at, voids })
          return
        }

        if (this.isCollapsedRange(at)) return

        if (!hanging) {
          const [, end] = this.getRangeEdges(at)
          const endOfDoc = this.getEndPoint([])

          if (!this.equalsPoint(end, endOfDoc)) {
            at = this.getUnhangRange(at, { voids })
          }
        }

        let [start, end] = this.getRangeEdges(at)
        const startBlock = this.above({
          match: n => this.isBlockElement(n),
          at: start,
          voids,
        })
        const endBlock = this.above({
          match: n => this.isBlockElement(n),
          at: end,
          voids,
        })
        const isAcrossBlocks
          = startBlock && endBlock && !this.equalsPath(startBlock[1], endBlock[1])
        const isSingleText = this.equalsPath(start.path, end.path)
        const startVoid = voids
          ? null
          : this.void({ at: start, mode: 'highest' })
        const endVoid = voids
          ? null
          : this.void({ at: end, mode: 'highest' })

        // If the start or end points are inside an inline void, nudge them out.
        if (startVoid) {
          const before = this.getBeforePoint(start)

          if (
            before
            && startBlock
            && this.isAncestorPath(startBlock[1], before.path)
          ) {
            start = before
          }
        }

        if (endVoid) {
          const after = this.getAfterPoint(end)

          if (after && endBlock && this.isAncestorPath(endBlock[1], after.path)) {
            end = after
          }
        }

        const matches: NodeEntry[] = []
        let lastPath: Path | undefined

        for (const entry of this.queryNodes({ at, voids })) {
          const [node, path] = entry

          if (lastPath && this.comparePath(path, lastPath) === 0) {
            continue
          }

          if (
            (!voids && this.isVoidElement(node))
            || (!this.isCommonPath(path, start.path) && !this.isCommonPath(path, end.path))
          ) {
            matches.push(entry)
            lastPath = path
          }
        }

        const pathRefs = Array.from(matches, ([, p]) => this.getPathRef(p))
        const startRef = this.getPointRef(start)
        const endRef = this.getPointRef(end)

        let removedText = ''

        if (!isSingleText && !startVoid) {
          const point = startRef.current!
          const [node] = this.queryText(point)
          const { path } = point
          const { offset } = start
          const text = node.text.slice(offset)
          if (text.length > 0) {
            this.apply({ type: 'remove_text', path, offset, text })
            removedText = text
          }
        }

        for (const pathRef of pathRefs) {
          const path = pathRef.unref()!
          this.removeNodes({ at: path, voids })
        }

        if (!endVoid) {
          const point = endRef.current!
          const [node] = this.queryText(point)
          const { path } = point
          const offset = isSingleText ? start.offset : 0
          const text = node.text.slice(offset, end.offset)
          if (text.length > 0) {
            this.apply({ type: 'remove_text', path, offset, text })
            removedText = text
          }
        }

        if (
          !isSingleText
          && isAcrossBlocks
          && endRef.current
          && startRef.current
        ) {
          this.mergeNodes({
            at: endRef.current,
            hanging: true,
            voids,
          })
        }

        if (
          isCollapsed
          && reverse
          && unit === 'character'
          && removedText.length > 1
          && removedText.match(/[\u0E00-\u0E7F]+/)
        ) {
          this.insertText(
            removedText.slice(0, removedText.length - distance),
          )
        }

        const startUnref = startRef.unref()
        const endUnref = endRef.unref()
        const point = reverse ? startUnref || endUnref : endUnref || startUnref

        if (options.at == null && point) {
          this.select(point)
        }
      })
    },
    deleteBackward(options = {}) {
      const { unit = 'character' } = options
      if (this.selection && this.isCollapsedRange(this.selection)) {
        this.delete({ unit, reverse: true })
      }
    },
    deleteForward(options = {}) {
      const { unit = 'character' } = options
      if (this.selection && this.isCollapsedRange(this.selection)) {
        this.delete({ unit })
      }
    },
    deleteFragment(options = {}) {
      const { direction } = options
      if (this.selection && this.isExpandedRange(this.selection)) {
        this.delete({ reverse: direction === 'backward' })
      }
    },
  }
}
