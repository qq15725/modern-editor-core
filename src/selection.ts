import type { EditorSelection, Range } from './types'

export function useEditorSelection(): EditorSelection {
  return {
    setSelection(props) {
      const { selection } = this
      if (!selection) return
      const oldProps: Partial<Range> = {}
      const newProps: Partial<Range> = {}
      for (const key in props) {
        const k = key as 'focus' | 'anchor'
        if (
          (k === 'anchor'
            && props.anchor != null
            && !this.equalsPoint(props.anchor, selection.anchor))
          || (k === 'focus'
            && props.focus != null
            && !this.equalsPoint(props.focus, selection.focus))
          || (k !== 'anchor' && k !== 'focus' && props[k] !== selection[k])
        ) {
          oldProps[k] = selection[k]
          newProps[k] = props[k]
        }
      }
      if (Object.keys(oldProps).length > 0) {
        this.apply({
          type: 'set_selection',
          properties: oldProps,
          newProperties: newProps,
        })
      }
    },
    select(at) {
      const range = this.getRange(at)
      if (this.selection && range) {
        this.setSelection(range)
      } else {
        this.selection = range
      }
    },
    deselect() {
      this.selection = undefined
    },
    move(options = {}) {
      if (!this.selection) return
      const { distance = 1, unit = 'character', reverse = false } = options
      let { edge = null } = options
      if (edge === 'start') edge = this.isBackwardRange(this.selection) ? 'focus' : 'anchor'
      if (edge === 'end') edge = this.isBackwardRange(this.selection) ? 'anchor' : 'focus'
      const { anchor, focus } = this.selection
      const opts = { distance, unit }
      const props: Partial<Range> = {}
      if (edge == null || edge === 'anchor') {
        const point = reverse
          ? this.getBeforePoint(anchor, opts)
          : this.getAfterPoint(anchor, opts)
        if (point) props.anchor = point
      }
      if (edge == null || edge === 'focus') {
        const point = reverse
          ? this.getBeforePoint(focus, opts)
          : this.getAfterPoint(focus, opts)
        if (point) props.focus = point
      }
      this.setSelection(props)
    },
    collapse(options = {}) {
      if (!this.selection) return
      const { edge = 'anchor' } = options
      this.select(
        edge === 'anchor'
          ? this.selection.anchor
          : edge === 'focus'
            ? this.selection.focus
            : this.getPoint(this.selection, { edge }),
      )
    },
  }
}
