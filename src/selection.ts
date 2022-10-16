import { apply } from './apply'
import { getAfterPoint, getBeforePoint, getPoint, isEqualPoint } from './point'
import { getRange, isBackwardRange } from './range'
import type { Location } from './location'
import type { Range } from './range'
import type { EditorCore } from './types'

export function setSelection(editor: EditorCore, props: Partial<Range>): void {
  const { selection } = editor
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
    apply(editor, {
      type: 'set_selection',
      properties: oldProps,
      newProperties: newProps,
    })
  }
}

export function select(editor: EditorCore, at: Location): void {
  const range = getRange(editor, at)
  if (editor.selection && range) {
    setSelection(editor, range)
  } else {
    apply(editor, {
      type: 'set_selection',
      properties: editor.selection,
      newProperties: range,
    })
  }
}

export function deselect(editor: EditorCore): void {
  if (editor.selection) {
    apply(editor, {
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

export function move(editor: EditorCore, options: MoveOptions = {}): void {
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
      ? getBeforePoint(editor, anchor, opts)
      : getAfterPoint(editor, anchor, opts)
    if (point) props.anchor = point
  }
  if (edge == null || edge === 'focus') {
    const point = reverse
      ? getBeforePoint(editor, focus, opts)
      : getAfterPoint(editor, focus, opts)
    if (point) props.focus = point
  }
  setSelection(editor, props)
}

export interface CollapseOptions {
  edge?: 'anchor' | 'focus' | 'start' | 'end'
}

export function collapse(editor: EditorCore, options: CollapseOptions = {}) {
  if (!editor.selection) return
  const { edge = 'anchor' } = options
  select(
    editor,
    edge === 'anchor'
      ? editor.selection.anchor
      : edge === 'focus'
        ? editor.selection.focus
        : getPoint(editor, editor.selection, { edge }),
  )
}
