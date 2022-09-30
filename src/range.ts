import { RANGE_REFS } from './weak-maps'
import { isPlainObject } from './utils'
import type { EditorRange, Range, RangeRef, Text } from './types'

export function useEditorRange(): EditorRange {
  return {
    isRange(value): value is Range {
      return isPlainObject(value)
        && this.isPoint(value.anchor)
        && this.isPoint(value.focus)
    },
    isCollapsedRange(range) {
      return this.equalsPoint(range.anchor, range.focus)
    },
    isExpandedRange(range) {
      return !this.isCollapsedRange(range)
    },
    isBackwardRange({ anchor, focus }) {
      return this.isAfterPoint(anchor, focus)
    },
    isForwardRange(range) {
      return !this.isBackwardRange(range)
    },
    getRange(at, to) {
      if (this.isRange(at) && !to) return at
      return {
        anchor: this.getStartPoint(at),
        focus: this.getEndPoint(to || at),
      }
    },
    *getRangePoints(range) {
      yield [range.anchor, 'anchor']
      yield [range.focus, 'focus']
    },
    getRangeEdges(range, options = {}) {
      const { reverse = false } = options
      const { anchor, focus } = range
      return this.isBackwardRange(range) === reverse
        ? [anchor, focus]
        : [focus, anchor]
    },
    getRangeEndPoint(range) {
      return this.getRangeEdges(range)[1]
    },
    getRangeStartPoint(range) {
      return this.getRangeEdges(range)[0]
    },
    getUnhangRange(range, options = {}) {
      const { voids = false } = options
      // eslint-disable-next-line prefer-const
      let [start, end] = this.getRangeEdges(range)
      if (start.offset !== 0 || end.offset !== 0 || this.isCollapsedRange(range)) return range
      const endBlock = this.above({
        at: end,
        match: n => this.isBlockElement(n),
      })
      const blockPath = endBlock ? endBlock[1] : []
      const first = this.getStartPoint(start)
      const before = { anchor: first, focus: end }
      let skip = true
      for (const [node, path] of this.queryNodes<Text>({
        at: before,
        match: v => this.isText(v),
        reverse: true,
        voids,
      })) {
        if (skip) {
          skip = false
          continue
        }

        if (node.text !== '' || this.isBeforePath(path, blockPath)) {
          end = { path, offset: node.text.length }
          break
        }
      }
      return { anchor: start, focus: end }
    },
    getIntersectionRange(range, another) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { anchor, focus, ...rest } = range
      const [s1, e1] = this.getRangeEdges(range)
      const [s2, e2] = this.getRangeEdges(another)
      const start = this.isBeforePoint(s1, s2) ? s2 : s1
      const end = this.isBeforePoint(e1, e2) ? e1 : e2
      if (this.isBeforePoint(end, start)) {
        return null
      } else {
        return { anchor: start, focus: end, ...rest }
      }
    },
    getRangeRef(range, options = {}) {
      const { affinity = 'forward' } = options
      const ref: RangeRef = {
        current: range,
        affinity,
        unref: () => {
          const { current } = ref
          const rangeRefs = this.getRangeRefs()
          rangeRefs.delete(ref)
          ref.current = null
          return current
        },
      }
      const refs = this.getRangeRefs()
      refs.add(ref)
      return ref
    },
    getRangeRefs() {
      let refs = RANGE_REFS.get(this)
      if (!refs) {
        refs = new Set()
        RANGE_REFS.set(this, refs)
      }
      return refs
    },
    deleteRange(range) {
      if (this.isCollapsedRange(range)) {
        return range.anchor
      } else {
        const [, end] = this.getRangeEdges(range)
        const pointRef = this.getPointRef(end)
        this.delete({ at: range })
        return pointRef.unref()
      }
    },
    equalsRange(range, another) {
      return (
        this.equalsPoint(range.anchor, another.anchor)
        && this.equalsPoint(range.focus, another.focus)
      )
    },
    transformRange(range, op, options = {}) {
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
        const isCollapsed = this.isCollapsedRange(r)
        if (this.isForwardRange(r)) {
          affinityAnchor = 'forward'
          affinityFocus = isCollapsed ? affinityAnchor : 'backward'
        } else {
          affinityAnchor = 'backward'
          affinityFocus = isCollapsed ? affinityAnchor : 'forward'
        }
      } else if (affinity === 'outward') {
        if (this.isForwardRange(r)) {
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
      const anchor = this.transformPoint(r.anchor, op, { affinity: affinityAnchor })
      const focus = this.transformPoint(r.focus, op, { affinity: affinityFocus })
      if (!anchor || !focus) return null
      r.anchor = anchor
      r.focus = focus
      return r
    },
  }
}
