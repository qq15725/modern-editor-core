import type { Node } from './node'
import type { Path } from './path'
import type { Range } from './range'

type ExtendableTypes =
  | 'EditorCore'
  | 'Element'
  | 'Text'
  | 'Selection'
  | 'Range'
  | 'Point'
  | 'Operation'
  | 'InsertNodeOperation'
  | 'InsertTextOperation'
  | 'MergeNodeOperation'
  | 'MoveNodeOperation'
  | 'RemoveNodeOperation'
  | 'RemoveTextOperation'
  | 'SetNodeOperation'
  | 'SetSelectionOperation'
  | 'SplitNodeOperation'

export interface CustomTypes {
  [key: string]: unknown
}

export type ExtendedType<K extends ExtendableTypes, B> = unknown extends CustomTypes[K] ? B : CustomTypes[K]

export type BaseInsertNodeOperation = {
  type: 'insert_node'
  path: Path
  node: Node
}
export type InsertNodeOperation = ExtendedType<'InsertNodeOperation', BaseInsertNodeOperation>
export type BaseInsertTextOperation = {
  type: 'insert_text'
  path: Path
  offset: number
  text: string
}
export type InsertTextOperation = ExtendedType<'InsertTextOperation', BaseInsertTextOperation>
export type BaseMergeNodeOperation = {
  type: 'merge_node'
  path: Path
  position: number
  properties: Partial<Node>
}
export type MergeNodeOperation = ExtendedType<'MergeNodeOperation', BaseMergeNodeOperation>
export type BaseMoveNodeOperation = {
  type: 'move_node'
  path: Path
  newPath: Path
}
export type MoveNodeOperation = ExtendedType<'MoveNodeOperation', BaseMoveNodeOperation>
export type BaseRemoveNodeOperation = {
  type: 'remove_node'
  path: Path
  node: Node
}
export type RemoveNodeOperation = ExtendedType<'RemoveNodeOperation', BaseRemoveNodeOperation>
export type BaseRemoveTextOperation = {
  type: 'remove_text'
  path: Path
  offset: number
  text: string
}
export type RemoveTextOperation = ExtendedType<'RemoveTextOperation', BaseRemoveTextOperation>
export type BaseSetNodeOperation = {
  type: 'set_node'
  path: Path
  properties: Partial<Node>
  newProperties: Partial<Node>
}
export type SetNodeOperation = ExtendedType<'SetNodeOperation', BaseSetNodeOperation>
export type BaseSetSelectionOperation =
  | {
    type: 'set_selection'
    properties: undefined
    newProperties: Range
  }
  | {
    type: 'set_selection'
    properties: Partial<Range>
    newProperties: Partial<Range>
  }
  | {
    type: 'set_selection'
    properties: Range
    newProperties: undefined
  }
export type SetSelectionOperation = ExtendedType<'SetSelectionOperation', BaseSetSelectionOperation>
export type BaseSplitNodeOperation = {
  type: 'split_node'
  path: Path
  position: number
  properties: Partial<Node>
}
export type SplitNodeOperation = ExtendedType<'SplitNodeOperation', BaseSplitNodeOperation>
export type NodeOperation =
  | InsertNodeOperation
  | MergeNodeOperation
  | MoveNodeOperation
  | RemoveNodeOperation
  | SetNodeOperation
  | SplitNodeOperation
export type SelectionOperation = SetSelectionOperation
export type TextOperation = InsertTextOperation | RemoveTextOperation
export type BaseOperation = NodeOperation | SelectionOperation | TextOperation
export type Operation = ExtendedType<'Operation', BaseOperation>
