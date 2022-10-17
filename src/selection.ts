import { apply } from './apply'
import { getCurrentEditorOrFail } from './editor-core'
import { getAfterPoint, getBeforePoint, getPoint, isEqualPoint } from './point'
import { getRange, isBackwardRange } from './range'
import type { Location } from './location'
import type { Range } from './range'

export function setSelection(props: Partial<Range>): void {
  const { selection } = getCurrentEditorOrFail()
  if (!selection) return
  const oldProps: Partial<Range> = {}
  const newProps: Partial<Range> = {}
  for (const key in props) {
    const k = key as 'focus' | 'anchor'
    if (
      (k === 'anchor'
        && props.anchor != null
        && !isEqualPoint(props.anchor, selection.anchor))
      || (k === 'focus'
        && props.focus != null
        && !isEqualPoint(props.focus, selection.focus))
      || (k !== 'anchor' && k !== 'focus' && props[k] !== selection[k])
    ) {
      oldProps[k] = selection[k]
      newProps[k] = props[k]
    }
  }
  if (Object.keys(oldProps).length > 0) {
    apply({
      type: 'set_selection',
      properties: oldProps,
      newProperties: newProps,
    })
  }
}

export function select(at: Location): void {
  const editor = getCurrentEditorOrFail()
  const range = getRange(at)
  if (editor.selection && range) {
    setSelection(range)
  } else {
    apply({
      type: 'set_selection',
      properties: editor.selection,
      newProperties: range,
    })
  }
}

export function deselect(): void {
  const editor = getCurrentEditorOrFail()
  if (editor.selection) {
    apply({
      type: 'set_selection',
      properties: editor.selection,
      newProperties: undefined,
    })
  }
}

export interface MoveOptions {
  distance?: number
  unit?: 'offset' | 'character' | 'word' | 'line'
  reverse?: boolean
  edge?: 'anchor' | 'focus' | 'start' | 'end'
}

export function move(options: MoveOptions = {}): void {
  const editor = getCurrentEditorOrFail()
  if (!editor.selection) return
  const { distance = 1, unit = 'character', reverse = false } = options
  let { edge = null } = options
  if (edge === 'start') edge = isBackwardRange(editor.selection) ? 'focus' : 'anchor'
  if (edge === 'end') edge = isBackwardRange(editor.selection) ? 'anchor' : 'focus'
  const { anchor, focus } = editor.selection
  const opts = { distance, unit }
  const props: Partial<Range> = {}
  if (edge == null || edge === 'anchor') {
    const point = reverse
      ? getBeforePoint(anchor, opts)
      : getAfterPoint(anchor, opts)
    if (point) props.anchor = point
  }
  if (edge == null || edge === 'focus') {
    const point = reverse
      ? getBeforePoint(focus, opts)
      : getAfterPoint(focus, opts)
    if (point) props.focus = point
  }
  setSelection(props)
}

export interface CollapseOptions {
  edge?: 'anchor' | 'focus' | 'start' | 'end'
}

export function collapse(options: CollapseOptions = {}) {
  const editor = getCurrentEditorOrFail()
  if (!editor.selection) return
  const { edge = 'anchor' } = options
  select(
    edge === 'anchor'
      ? editor.selection.anchor
      : edge === 'focus'
        ? editor.selection.focus
        : getPoint(editor.selection, { edge }),
  )
}
