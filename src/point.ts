import { isElement } from './element'
import { getFirstChildNodeEntry, getLastChildNodeEntry, getNodeEntries } from './node'
import { getRange, getRangeEdgePoints, getRangeEndPoint, getRangeStartPoint, isRange } from './range'
import { getTextContent, isText } from './text'
import { getCharacterDistance, getWordDistance, isPlainObject, splitByCharacterDistance } from './utils'
import { comparePath, isAncestorPath, isEqualPath, isPath, transformPath } from './path'
import type { Operation } from './operation'
import type { EditorCore } from './types'
import type { Location } from './location'
import type { Ancestor } from './ancestor'
import type { Path } from './path'

export interface Point {
  path: Path
  offset: number
}
export type PointEntry = [Point, 'anchor' | 'focus']

export interface PointRef {
  current: Point | null
  affinity: 'forward' | 'backward' | null
  unref(): Point | null
}

export function comparePoint(point: Point, another: Point): -1 | 0 | 1 {
  const result = comparePath(point.path, another.path)
  if (result === 0) {
    if (point.offset < another.offset) return -1
    if (point.offset > another.offset) return 1
  }
  return result
}

export function isPoint(value: any): value is Point {
  return isPlainObject(value)
    && typeof value.offset === 'number'
    && isPath(value.path)
}

export function isEqualPoint(point: Point, another: Point): boolean {
  return point.offset === another.offset
    && isEqualPath(point.path, another.path)
}

export function isBeforePoint(point: Point, another: Point): boolean {
  return comparePoint(point, another) === -1
}

export function isAfterPoint(point: Point, another: Point): boolean {
  return comparePoint(point, another) === 1
}

export function isStartPoint(root: Ancestor, point: Point, at: Location): boolean {
  if (point.offset !== 0) return false
  return isEqualPoint(point, getStartPoint(root, at))
}

export function isEndPoint(root: Ancestor, point: Point, at: Location): boolean {
  return isEqualPoint(point, getEndPoint(root, at))
}

export function isEdgePoint(root: Ancestor, point: Point, at: Location): boolean {
  return isStartPoint(root, point, at) || isEndPoint(root, point, at)
}

export interface PointOptions {
  edge?: 'start' | 'end'
}

export function getPoint(root: Ancestor, at: Location, options?: PointOptions): Point {
  const { edge = 'start' } = options || {}
  if (isPath(at)) {
    const [node, path] = edge === 'end'
      ? getLastChildNodeEntry(root, at)
      : getFirstChildNodeEntry(root, at)
    if (!isText(node)) throw new Error(`Cannot get the ${ edge } point in the node at path [${ at }] because it has no ${ edge } text node.`)
    at = {
      path,
      offset: edge === 'end' ? node.text.length : 0,
    }
  } else if (isRange(at)) {
    at = edge === 'start'
      ? getRangeStartPoint(at)
      : getRangeEndPoint(at)
  }
  return at
}

export function getStartPoint(root: Ancestor, at: Location = []): Point {
  return getPoint(root, at, { edge: 'start' })
}

export function getEndPoint(root: Ancestor, at: Location = []): Point {
  return getPoint(root, at, { edge: 'end' })
}

export interface BeforeAfterPointOptions {
  distance?: number
  unit?: 'character' | 'word' | 'line' | 'block' | 'offset'
  voids?: boolean
}

export function getBeforePoint(editor: EditorCore, at: Location, options: BeforeAfterPointOptions = {}): Point | undefined {
  const anchor = getStartPoint(editor)
  const focus = getStartPoint(editor, at)
  const range = { anchor, focus }
  const { distance = 1 } = options
  let d = 0
  let target
  for (const p of getPoints(editor, { ...options, at: range, reverse: true })) {
    if (d > distance) break
    if (d !== 0) target = p
    d++
  }
  return target
}

export function getAfterPoint(editor: EditorCore, at: Location, options: BeforeAfterPointOptions = {}): Point | undefined {
  const anchor = getEndPoint(editor, at)
  const focus = getEndPoint(editor)
  const range = { anchor, focus }
  const { distance = 1 } = options
  let d = 0
  let target
  for (const p of getPoints(editor, { ...options, at: range })) {
    if (d > distance) break
    if (d !== 0) target = p
    d++
  }
  return target
}

export interface PointsOptions {
  at?: Location
  unit?: 'character' | 'word' | 'line' | 'block' | 'offset'
  reverse?: boolean
  voids?: boolean
}

export function *getPoints(editor: EditorCore, options?: PointsOptions): Generator<Point, void, undefined> {
  const { unit = 'offset', reverse = false, voids = false } = options ?? {}
  const { at } = options ?? {}
  if (!at) return

  const range = getRange(editor, at)
  const [start, end] = getRangeEdgePoints(range)
  const first = reverse ? end : start
  let isNewBlock = false
  let blockText = ''
  let distance = 0 // Distance for leafText to catch up to blockText.
  let leafTextRemaining = 0
  let leafTextOffset = 0

  for (const [node, path] of getNodeEntries(editor, editor, { at: at!, reverse, voids })) {
    if (isElement(node)) {
      if (!voids && editor.isVoid(node)) {
        yield getStartPoint(editor, path)
        continue
      }
      if (editor.isInline(node)) continue
      if (editor.hasInlines(node)) {
        const e = isAncestorPath(path, end.path)
          ? end
          : getEndPoint(editor, path)
        const s = isAncestorPath(path, start.path)
          ? start
          : getStartPoint(editor, path)
        blockText = getTextContent(editor, { anchor: s, focus: e }, { voids })
        isNewBlock = true
      }
    }

    if (isText(node)) {
      const isFirst = isEqualPath(path, first.path)
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
}

export interface PointRefOptions {
  affinity?: 'forward' | 'backward' | null
}

export function getPointRef(editor: EditorCore, point: Point, options: PointRefOptions = {}): PointRef {
  const { affinity = 'forward' } = options
  const ref: PointRef = {
    current: point,
    affinity,
    unref: () => {
      const { current } = ref
      const pointRefs = editor.pointRefs
      pointRefs.delete(ref)
      ref.current = null
      return current
    },
  }
  editor.pointRefs.add(ref)
  return ref
}

export interface TransformPointOptions {
  affinity?: 'forward' | 'backward' | null
}

export function transformPoint(
  point: Point | null,
  op: Operation,
  options: TransformPointOptions = {},
): Point | null {
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
      nextPoint.path = transformPath(path, op, options)!
      break
    }
    case 'insert_text': {
      if (
        isEqualPath(op.path, path)
        && (op.offset < offset
          || (op.offset === offset && affinity === 'forward'))
      ) {
        nextPoint.offset += op.text.length
      }
      break
    }
    case 'merge_node': {
      if (isEqualPath(op.path, path)) {
        nextPoint.offset += op.position
      }
      nextPoint.path = transformPath(path, op, options)!
      break
    }
    case 'remove_text': {
      if (isEqualPath(op.path, path) && op.offset <= offset) {
        nextPoint.offset -= Math.min(offset - op.offset, op.text.length)
      }
      break
    }
    case 'remove_node': {
      if (isEqualPath(op.path, path) || isAncestorPath(op.path, path)) {
        return null
      }
      nextPoint.path = transformPath(path, op, options)!
      break
    }
    case 'split_node': {
      if (isEqualPath(op.path, path)) {
        if (op.position === offset && affinity == null) {
          return null
        } else if (
          op.position < offset
          || (op.position === offset && affinity === 'forward')
        ) {
          nextPoint.offset -= op.position
          nextPoint.path = transformPath(path, op, {
            ...options,
            affinity: 'forward',
          })!
        }
      } else {
        nextPoint.path = transformPath(path, op, options)!
      }
      break
    }
  }
  return nextPoint
}
