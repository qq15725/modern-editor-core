import type { EditorSpan, Span } from './types'

export function useEditorSpan(): EditorSpan {
  return {
    isSpan(value): value is Span {
      return (
        Array.isArray(value)
        && value.length === 2
        && value.every((v) => this.isPath(v))
      )
    },
  }
}
