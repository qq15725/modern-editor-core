import type { EditorCore, PathRef, PointRef, RangeRef } from './types'

export const PATH_REFS: WeakMap<EditorCore, Set<PathRef>> = new WeakMap()
export const POINT_REFS: WeakMap<EditorCore, Set<PointRef>> = new WeakMap()
export const RANGE_REFS: WeakMap<EditorCore, Set<RangeRef>> = new WeakMap()
