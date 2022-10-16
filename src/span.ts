import { isPath } from './path'
import type { Path } from './path'

export type Span = [Path, Path]

export function isSpan(value: any): value is Span {
  return Array.isArray(value)
    && value.length === 2
    && value.every((v) => isPath(v))
}
