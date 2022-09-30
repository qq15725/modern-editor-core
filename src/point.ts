import { POINT_REFS } from './weak-maps'
import { getCharacterDistance, getWordDistance, isPlainObject, splitByCharacterDistance } from './utils'
import type { EditorPoint, Point, PointRef } from './types'

export function useEditorPoint(): EditorPoint {
  return {
    isPoint(value): value is Point {
      return isPlainObject(value)
        && typeof value.offset === 'number'
        && this.isPath(value.path)
    },
    isAfterPoint(point, another) {
      return this.comparePoint(point, another) === 1
    },
    isBeforePoint(point, another) {
      return this.comparePoint(point, another) === -1
    },
    isStartPoint(point, at) {
      if (point.offset !== 0) return false
      return this.equalsPoint(point, this.getStartPoint(at))
    },
    isEndPoint(point, at) {
      return this.equalsPoint(point, this.getEndPoint(at))
    },
    isEdgePoint(point, at) {
      return this.isStartPoint(point, at) || this.isEndPoint(point, at)
    },
    *getPoints(options = {}) {
      const { unit = 'offset', reverse = false, voids = false } = options
      let { at } = options
      at = at ?? this.selection
      if (!at) return

      const range = this.getRange(at)
      const [start, end] = this.getRangeEdges(range)
      const first = reverse ? end : start
      let isNewBlock = false
      let blockText = ''
      let distance = 0 // Distance for leafText to catch up to blockText.
      let leafTextRemaining = 0
      let leafTextOffset = 0

      for (const [node, path] of this.queryNodes({ at: at!, reverse, voids })) {
        if (this.isElement(node)) {
          if (!voids && this.isVoid(node)) {
            yield this.getStartPoint(path)
            continue
          }

          if (this.isInline(node)) continue

          if (this.hasInlines(node)) {
            const e = this.isAncestorPath(path, end.path)
              ? end
              : this.getEndPoint(path)
            const s = this.isAncestorPath(path, start.path)
              ? start
              : this.getStartPoint(path)

            blockText = this.getTextContent({ anchor: s, focus: e }, { voids })
            isNewBlock = true
          }
        }

        if (this.isText(node)) {
          const isFirst = this.equalsPath(path, first.path)

          if (isFirst) {
            leafTextRemaining = reverse
              ? first.offset
              : node.text.length - first.offset
            leafTextOffset = first.offset // Works for reverse too.
          } else {
            leafTextRemaining = node.text.length
            leafTextOffset = reverse ? leafTextRemaining : 0
          }

          if (isFirst || isNewBlock || unit === 'offset') {
            yield { path, offset: leafTextOffset }
            isNewBlock = false
          }

          while (true) {
            if (distance === 0) {
              if (blockText === '') break
              distance = calcDistance(blockText, unit, reverse)
              blockText = splitByCharacterDistance(
                blockText,
                distance,
                reverse,
              )[1]
            }

            leafTextOffset = reverse
              ? leafTextOffset - distance
              : leafTextOffset + distance
            leafTextRemaining = leafTextRemaining - distance

            if (leafTextRemaining < 0) {
              distance = -leafTextRemaining
              break
            }

            distance = 0
            yield { path, offset: leafTextOffset }
          }
        }
      }

      function calcDistance(text: string, unit: string, reverse?: boolean) {
        if (unit === 'character') {
          return getCharacterDistance(text, reverse)
        } else if (unit === 'word') {
          return getWordDistance(text, reverse)
        } else if (unit === 'line' || unit === 'block') {
          return text.length
        }
        return 1
      }
    },
    getPoint(at, options = {}) {
      const { edge = 'start' } = options
      if (this.isPath(at)) {
        const [node, path] = edge === 'end'
          ? this.getLastNode(at)
          : this.getFirstNode(at)
        if (!this.isText(node)) throw new Error(`Cannot get the ${ edge } point in the node at path [${ at }] because it has no ${ edge } text node.`)
        return { path, offset: edge === 'end' ? node.text.length : 0 }
      } else if (this.isRange(at)) {
        const [start, end] = this.getRangeEdges(at)
        return edge === 'start' ? start : end
      }
      return at
    },
    getStartPoint(at) {
      return this.getPoint(at, { edge: 'start' })
    },
    getEndPoint(at) {
      return this.getPoint(at, { edge: 'end' })
    },
    getBeforePoint(at, options = {}) {
      const anchor = this.getStartPoint([])
      const focus = this.getPoint(at, { edge: 'start' })
      const range = { anchor, focus }
      const { distance = 1 } = options
      let d = 0
      let target
      for (const p of this.getPoints({ ...options, at: range, reverse: true })) {
        if (d > distance) break
        if (d !== 0) target = p
        d++
      }
      return target
    },
    getAfterPoint(at, options = {}) {
      const anchor = this.getPoint(at, { edge: 'end' })
      const focus = this.getEndPoint([])
      const range = { anchor, focus }
      const { distance = 1 } = options
      let d = 0
      let target
      for (const p of this.getPoints({ ...options, at: range })) {
        if (d > distance) break
        if (d !== 0) target = p
        d++
      }
      return target
    },
    getPointRef(point, options = {}) {
      const { affinity = 'forward' } = options
      const ref: PointRef = {
        current: point,
        affinity,
        unref: () => {
          const { current } = ref
          const pointRefs = this.getPointRefs()
          pointRefs.delete(ref)
          ref.current = null
          return current
        },
      }
      const refs = this.getPointRefs()
      refs.add(ref)
      return ref
    },
    getPointRefs() {
      let refs = POINT_REFS.get(this)
      if (!refs) {
        refs = new Set()
        POINT_REFS.set(this, refs)
      }
      return refs
    },
    comparePoint(point, another) {
      const result = this.comparePath(point.path, another.path)
      if (result === 0) {
        if (point.offset < another.offset) return -1
        if (point.offset > another.offset) return 1
        return 0
      }
      return result
    },
    equalsPoint(point, another) {
      return point.offset === another.offset
        && this.equalsPath(point.path, another.path)
    },
    transformPoint(point, op, options = {}) {
      if (point === null) return null
      const { affinity = 'forward' } = options
      const nextPoint = {
        ...point,
        path: [...point.path],
      }
      const { path, offset } = nextPoint
      switch (op.type) {
        case 'insert_node':
        case 'move_node': {
          nextPoint.path = this.transformPath(path, op, options)!
          break
        }
        case 'insert_text': {
          if (
            this.equalsPath(op.path, path)
            && (op.offset < offset
              || (op.offset === offset && affinity === 'forward'))
          ) {
            nextPoint.offset += op.text.length
          }
          break
        }
        case 'merge_node': {
          if (this.equalsPath(op.path, path)) {
            nextPoint.offset += op.position
          }
          nextPoint.path = this.transformPath(path, op, options)!
          break
        }
        case 'remove_text': {
          if (this.equalsPath(op.path, path) && op.offset <= offset) {
            nextPoint.offset -= Math.min(offset - op.offset, op.text.length)
          }
          break
        }
        case 'remove_node': {
          if (this.equalsPath(op.path, path) || this.isAncestorPath(op.path, path)) {
            return null
          }
          nextPoint.path = this.transformPath(path, op, options)!
          break
        }
        case 'split_node': {
          if (this.equalsPath(op.path, path)) {
            if (op.position === offset && affinity == null) {
              return null
            } else if (
              op.position < offset
              || (op.position === offset && affinity === 'forward')
            ) {
              nextPoint.offset -= op.position
              nextPoint.path = this.transformPath(path, op, {
                ...options,
                affinity: 'forward',
              })!
            }
          } else {
            nextPoint.path = this.transformPath(path, op, options)!
          }
          break
        }
      }
      return nextPoint
    },
  }
}
