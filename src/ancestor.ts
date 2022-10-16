import { isNodes } from './node'
import { isPlainObject } from './utils'
import type { Element } from './element'
import type { EditorCore } from './types'

export type Ancestor = EditorCore | Element

export function isAncestor(value: any): value is Ancestor {
  return isPlainObject(value)
    && isNodes(value.children)
}
