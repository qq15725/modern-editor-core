import { getCurrentEditorOrFail } from './editor-core'
import { isBlockElement } from './element'
import { deleteNodes, getAboveNodeEntry, getNodeEntries } from './node'
import { isBeforePath } from './path'
import { isText } from './text'
import { isPlainObject } from './utils'
import {
  getEndPoint,
  getPointRef,
  getStartPoint,
  isAfterPoint,
  isBeforePoint,
  isEqualPoint,
  isPoint,
  transformPoint,
} from './point'
import type { Location } from './location'
import type { Point, PointEntry } from './point'
import type { Operation } from './operation'
import type { Text } from './text'

export interface Range {
  anchor: Point
  focus: Point
}

export interface RangeRef {
  current: Range | null
  affinity: 'forward' | 'backward' | 'outward' | 'inward' | null
  unref(): Range | null
}

export function isRange(value: any): value is Range {
  return isPlainObject(value)
    && isPoint(value.anchor)
    && isPoint(value.focus)
}

export function isEqualRange(range: Range, another: Range): boolean {
  return isEqualPoint(range.anchor, another.anchor)
    && isEqualPoint(range.focus, another.focus)
}

export function isCollapsedRange(range: Range): boolean {
  return isEqualPoint(range.anchor, range.focus)
}

export function isExpandedRange(range: Range): boolean {
  return !isCollapsedRange(range)
}

export function isBackwardRange(range: Range): boolean {
  return isAfterPoint(range.anchor, range.focus)
}

export function isForwardRange(range: Range): boolean {
  return !isBackwardRange(range)
}

export function *getRangePoints(range: Range) {
  yield [range.anchor, 'anchor'] as PointEntry
  yield [range.focus, 'focus'] as PointEntry
}

export interface RangeEdgePointsOptions {
  reverse?: boolean
}

export function getRangeEdgePoints(
  range: Range,
  options: RangeEdgePointsOptions = {},
): [Point, Point] {
  const { reverse = false } = options
  const { anchor, focus } = range
  return isBackwardRange(range) === reverse
    ? [anchor, focus]
    : [focus, anchor]
}

export function getRangeStartPoint(range: Range) {
  return getRangeEdgePoints(range)[0]
}

export function getRangeEndPoint(range: Range) {
  return getRangeEdgePoints(range)[1]
}

export function getIntersectionRange(range: Range, another: Range) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anchor, focus, ...rest } = range
  const [s1, e1] = getRangeEdgePoints(range)
  const [s2, e2] = getRangeEdgePoints(another)
  const start = isBeforePoint(s1, s2) ? s2 : s1
  const end = isBeforePoint(e1, e2) ? e1 : e2
  if (isBeforePoint(end, start)) {
    return null
  } else {
    return { anchor: start, focus: end, ...rest }
  }
}

export function getRange(at: Location, to?: Location): Range {
  if (isRange(at) && !to) return at
  return {
    anchor: getStartPoint(at),
    focus: getEndPoint(to ?? at),
  }
}

export interface RangeRefOptions {
  affinity?: 'forward' | 'backward' | 'outward' | 'inward' | null
}

export function getRangeRef(
  range: Range,
  options: RangeRefOptions = {},
): RangeRef {
  const editor = getCurrentEditorOrFail()
  const { affinity = 'forward' } = options
  const ref: RangeRef = {
    current: range,
    affinity,
    unref: () => {
      const { current } = ref
      editor.rangeRefs.delete(ref)
      ref.current = null
      return current
    },
  }
  editor.rangeRefs.add(ref)
  return ref
}

export function deleteRange(range: Range): Point | null {
  if (isCollapsedRange(range)) {
    return range.anchor
  } else {
    const pointRef = getPointRef(getRangeEndPoint(range))
    deleteNodes({ at: range })
    return pointRef.unref()
  }
}

export interface UnhangRangeOptions {
  voids?: boolean
}

export function getUnhangRange(
  range: Range,
  options: UnhangRangeOptions = {},
): Range {
  const { voids = false } = options ?? {}
  // eslint-disable-next-line prefer-const
  let [start, end] = getRangeEdgePoints(range)
  if (start.offset !== 0 || end.offset !== 0 || isCollapsedRange(range)) return range
  const endBlock = getAboveNodeEntry({
    at: end,
    match: n => isBlockElement(n),
  })
  const blockPath = endBlock ? endBlock[1] : []
  const first = getStartPoint(start)
  const before = {
    anchor: first,
    focus: end,
  }
  let skip = true
  for (const [node, path] of getNodeEntries<Text>({
    at: before,
    match: v => isText(v),
    reverse: true,
    voids,
  })) {
    if (skip) {
      skip = false
      continue
    }

    if (node.text !== '' || isBeforePath(path, blockPath)) {
      end = { path, offset: node.text.length }
      break
    }
  }
  return { anchor: start, focus: end }
}

export interface TransformRangeOptions {
  affinity?: 'forward' | 'backward' | 'outward' | 'inward' | null
}

export function transformRange(
  range: Range | null,
  op: Operation,
  options: TransformRangeOptions = {},
): Range | null {
  if (range === null) return null
  const r = {
    anchor: {
      path: [...range.anchor.path],
      offset: range.anchor.offset,
    },
    focus: {
      path: [...range.focus.path],
      offset: range.focus.offset,
    },
  }
  const { affinity = 'inward' } = options
  let affinityAnchor: 'forward' | 'backward' | null
  let affinityFocus: 'forward' | 'backward' | null
  if (affinity === 'inward') {
    const isCollapsed = isCollapsedRange(r)
    if (isForwardRange(r)) {
      affinityAnchor = 'forward'
      affinityFocus = isCollapsed ? affinityAnchor : 'backward'
    } else {
      affinityAnchor = 'backward'
      affinityFocus = isCollapsed ? affinityAnchor : 'forward'
    }
  } else if (affinity === 'outward') {
    if (isForwardRange(r)) {
      affinityAnchor = 'backward'
      affinityFocus = 'forward'
    } else {
      affinityAnchor = 'forward'
      affinityFocus = 'backward'
    }
  } else {
    affinityAnchor = affinity
    affinityFocus = affinity
  }
  const anchor = transformPoint(r.anchor, op, { affinity: affinityAnchor })
  const focus = transformPoint(r.focus, op, { affinity: affinityFocus })
  if (!anchor || !focus) return null
  r.anchor = anchor
  r.focus = focus
  return r
}
