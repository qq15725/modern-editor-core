import type { Operation } from './operation'
import type { Ancestor } from './ancestor'
import type { Path, PathRef } from './path'
import type { Node, NodeEntry, NodeMatch } from './node'
import type { PointRef } from './point'
import type { Range, RangeRef } from './range'
import type { Element } from './element'
import type { Location } from './location'

export interface EditorListener {
  on(this: EditorCore, type: string, listener: (...args: any[]) => void): void
  off(this: EditorCore, type: string, listener: (...args: any[]) => void): void
  emit(this: EditorCore, type: string, ...args: any[]): void
}

export interface EditorCore extends
  EditorListener {
  __editor__: true
  pathRefs: Set<PathRef>
  pointRefs: Set<PointRef>
  rangeRefs: Set<RangeRef>
  dirtyPaths: Path[]
  dirtyPathKeys: Set<string>
  isNormalizing: boolean
  operations: Operation[]
  applying: boolean
  selection: Range | undefined
  children: Node[]
  isBlock(value: Element): boolean
  isInline(value: Element): boolean
  isVoid(value: Element): boolean
  isEmpty(element: Element): boolean
  hasInlines(element: Element): boolean
  above<T extends Ancestor>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    voids?: boolean
  }): NodeEntry<T> | undefined
  void(this: EditorCore, options?: {
    at?: Location
    mode?: 'highest' | 'lowest' | 'all'
    voids?: boolean
  }): NodeEntry<Element> | undefined
  insertBreak(this: EditorCore): void
  insertSoftBreak(this: EditorCore): void
  normalizeNode(this: EditorCore, entry: NodeEntry): void
  getDirtyPaths(this: EditorCore, op: Operation): Path[]
}
