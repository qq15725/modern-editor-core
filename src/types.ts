export type Node = EditorCore | Element | Text

export type Descendant = Element | Text

export type Ancestor = EditorCore | Element

export type NodeEntry<T extends Node = Node> = [T, Path]

export type NodeProps =
  | Omit<EditorCore, 'children'>
  | Omit<Element, 'children'>
  | Omit<Text, 'text'>

export type PropsCompare = (prop: Partial<Node>, node: Partial<Node>) => boolean
export type PropsMerge = (prop: Partial<Node>, node: Partial<Node>) => object

export interface Element {
  children: Node[]
  [key: string]: unknown
}

export interface Text {
  text: string
  [key: string]: unknown
}

export type Path = number[]

export interface PathRef {
  current: Path | null
  affinity: 'forward' | 'backward' | null
  unref(): Path | null
}

export type Span = [Path, Path]

export interface Point {
  path: Path
  offset: number
}

export type PointEntry = [Point, 'anchor' | 'focus']

export interface PointRef {
  current: Point | null
  affinity: 'forward' | 'backward' | null
  unref(): Point | null
}

export interface Range {
  anchor: Point
  focus: Point
}

export interface RangeRef {
  current: Range | null
  affinity: 'forward' | 'backward' | 'outward' | 'inward' | null
  unref(): Range | null
}

export type Location = Path | Point | Range

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

export interface EditorApply {
  apply(this: EditorCore, op: Operation): void
  applyToDraft(this: EditorCore, op: Operation): Range | undefined
}

export interface EditorPath {
  isPath(this: EditorCore, value: any): value is Path
  isBeforePath(this: EditorCore, path: Path, another: Path): boolean
  isAfterPath(this: EditorCore, path: Path, another: Path): boolean
  isAncestorPath(this: EditorCore, path: Path, another: Path): boolean
  isEndsBeforePath(this: EditorCore, path: Path, another: Path): boolean
  isSiblingPath(this: EditorCore, path: Path, another: Path): boolean
  isCommonPath(this: EditorCore, path: Path, another: Path): boolean
  hasPreviousPath(this: EditorCore, path: Path): boolean
  getPath(this: EditorCore, at: Location, options?: {
    depth?: number
    edge?: 'start' | 'end'
  }): Path
  getParentPath(this: EditorCore, path: Path): Path
  getPreviousPath(this: EditorCore, path: Path): Path
  getNextPath(this: EditorCore, path: Path): Path
  getCommonPath(this: EditorCore, path: Path, another: Path): Path
  getLevelPaths(this: EditorCore, path: Path, options?: { reverse?: boolean }): Path[]
  getPathRef(this: EditorCore, path: Path, options?: {
    affinity?: 'forward' | 'backward' | null
  }): PathRef
  getPathRefs(this: EditorCore): Set<PathRef>
  comparePath(this: EditorCore, path: Path, another: Path): -1 | 0 | 1
  equalsPath(this: EditorCore, path: Path, another: Path): boolean
  transformPath(this: EditorCore, path: Path | null, operation: Operation, options?: {
    affinity?: 'forward' | 'backward' | null
  }): Path | null
}

export interface EditorSpan {
  isSpan(this: EditorCore, value: any): value is Span
}

export interface EditorPoint {
  isPoint(this: EditorCore, value: any): value is Point
  isAfterPoint(this: EditorCore, point: Point, another: Point): boolean
  isBeforePoint(this: EditorCore, point: Point, another: Point): boolean
  isStartPoint(this: EditorCore, point: Point, at: Location): boolean
  isEndPoint(this: EditorCore, point: Point, at: Location): boolean
  isEdgePoint(this: EditorCore, point: Point, at: Location): boolean
  getPoints(this: EditorCore, options?: {
    at?: Location
    unit?: 'character' | 'word' | 'line' | 'block' | 'offset'
    reverse?: boolean
    voids?: boolean
  }): Generator<Point, void, undefined>
  getPoint(this: EditorCore, at: Location, options?: { edge?: 'start' | 'end' }): Point
  getStartPoint(this: EditorCore, at?: Location): Point
  getBeforePoint(this: EditorCore, at: Location, options?: {
    distance?: number
    unit?: 'character' | 'word' | 'line' | 'block' | 'offset'
    voids?: boolean
  }): Point | undefined
  getAfterPoint(this: EditorCore, at: Location, options?: {
    distance?: number
    unit?: 'character' | 'word' | 'line' | 'block' | 'offset'
    voids?: boolean
  }): Point | undefined
  getEndPoint(this: EditorCore, at?: Location): Point
  getPointRef(this: EditorCore, point: Point, options?: {
    affinity?: 'forward' | 'backward' | null
  }): PointRef
  getPointRefs(this: EditorCore): Set<PointRef>
  comparePoint(this: EditorCore, point: Point, another: Point): -1 | 0 | 1
  equalsPoint(this: EditorCore, point: Point, another: Point): boolean
  transformPoint(this: EditorCore, point: Point | null, op: Operation, options?: {
    affinity?: 'forward' | 'backward' | null
  }): Point | null
}

export interface EditorRange {
  isRange(this: EditorCore, value: any): value is Range
  isCollapsedRange(this: EditorCore, range: Range): boolean
  isExpandedRange(this: EditorCore, range: Range): boolean
  isBackwardRange(this: EditorCore, range: Range): boolean
  isForwardRange(this: EditorCore, range: Range): boolean
  getRange(this: EditorCore, at: Location, to?: Location): Range
  getRangePoints(range: Range): Generator<PointEntry, void, undefined>
  getRangeEdges(this: EditorCore, range: Range, options?: { reverse?: boolean }): [Point, Point]
  getRangeEndPoint(this: EditorCore, range: Range): Point
  getRangeStartPoint(this: EditorCore, range: Range): Point
  getUnhangRange(this: EditorCore, range: Range, options?: { voids?: boolean }): Range
  getIntersectionRange(this: EditorCore, range: Range, another: Range): Range | null
  getRangeRef(this: EditorCore, range: Range, options?: {
    affinity?: 'forward' | 'backward' | 'outward' | 'inward' | null
  }): RangeRef
  getRangeRefs(this: EditorCore): Set<RangeRef>
  deleteRange(this: EditorCore, range: Range): Point | null
  equalsRange(this: EditorCore, range: Range, another: Range): boolean
  transformRange(this: EditorCore, range: Range | null, op: Operation, options?: {
    affinity?: 'forward' | 'backward' | 'outward' | 'inward' | null
  }): Range | null
}

export interface EditorSelection {
  setSelection(this: EditorCore, props: Partial<Range>): void
  select(this: EditorCore, at: Location): void
  deselect(this: EditorCore): void
  move(this: EditorCore, options?: {
    distance?: number
    unit?: 'offset' | 'character' | 'word' | 'line'
    reverse?: boolean
    edge?: 'anchor' | 'focus' | 'start' | 'end'
  }): void
  collapse(this: EditorCore, options?: {
    edge?: 'anchor' | 'focus' | 'start' | 'end'
  }): void
}

export interface EditorText {
  isText(this: EditorCore, value: any): value is Text
  getText(this: EditorCore, path: Path): Text
  queryText(this: EditorCore, at: Location, options?: {
    depth?: number
    edge?: 'start' | 'end'
  }): NodeEntry<Text>
  getTexts(this: EditorCore, options?: {
    from?: Path
    to?: Path
    reverse?: boolean
    pass?: (node: NodeEntry) => boolean
  }): Generator<NodeEntry<Text>, void, undefined>
  getTextContent(this: EditorCore, at: Location, options?: { voids?: boolean }): string
}

export interface EditorElement {
  isElement(this: EditorCore, value: any): value is Element
  isBlockElement(this: EditorCore, value: any): value is Element
  isInlineElement(this: EditorCore, value: any): value is Element
  isVoidElement(this: EditorCore, value: any): value is Element
  isAncestor(this: EditorCore, value: any): value is Ancestor
}

export type NodeMatch<T extends Node> =
  | ((node: Node, path: Path) => node is T)
  | ((node: Node, path: Path) => boolean)

export interface EditorNode {
  isNode(this: EditorCore, value: any): value is Node
  isNodeList(this: EditorCore, value: any): value is Node[]
  hasNode(this: EditorCore, path: Path): boolean
  getNodes(
    this: EditorCore,
    options?: {
      from?: Path
      to?: Path
      reverse?: boolean
      pass?: (entry: NodeEntry) => boolean
    }
  ): Generator<NodeEntry, void, undefined>
  queryNodes<T extends Node>(
    this: EditorCore,
    options?: {
      at?: Location | Span
      match?: NodeMatch<T>
      mode?: 'all' | 'highest' | 'lowest'
      universal?: boolean
      reverse?: boolean
      voids?: boolean
    }
  ): Generator<NodeEntry<T>, void, undefined>
  getNode(this: EditorCore, path: Path): Node
  queryNode(this: EditorCore, at: Location, options?: {
    depth?: number
    edge?: 'start' | 'end'
  }): NodeEntry
  extractNodeProps(this: EditorCore, node: Node): NodeProps
  getParentNode(this: EditorCore, path: Path): Element | EditorCore
  queryParentNode(this: EditorCore, path: Path): NodeEntry<Element | EditorCore>
  queryPreviousNode<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'all' | 'highest' | 'lowest'
    voids?: boolean
  }): NodeEntry<T> | undefined
  getFirstNode(this: EditorCore, path: Path): NodeEntry
  queryFirstNode(this: EditorCore, at: Location): NodeEntry
  getLastNode(this: EditorCore, path: Path): NodeEntry
  queryLastNode(this: EditorCore, at: Location): NodeEntry
  getLevelNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    reverse?: boolean
    voids?: boolean
  }): Generator<NodeEntry<T>, void, undefined>
  getNodeTextContent(this: EditorCore, node: Node): string
  insertNodes<T extends Node>(this: EditorCore, nodes: Node | Node[], options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest'
    hanging?: boolean
    select?: boolean
    voids?: boolean
  }): void
  insertText(this: EditorCore, text: string, options?: {
    at?: Location
    voids?: boolean
  }): void
  splitNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest'
    always?: boolean
    height?: number
    voids?: boolean
  }): void
  setNodes<T extends Node>(this: EditorCore, props: Partial<Node>, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    hanging?: boolean
    split?: boolean
    voids?: boolean
    compare?: PropsCompare
    merge?: PropsMerge
  }): void
  wrapNodes<T extends Node>(this: EditorCore, element: Element, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    split?: boolean
    voids?: boolean
  }): void
  unwrapNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    split?: boolean
    voids?: boolean
  }): void
  liftNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    voids?: boolean
  }): void
  moveNodes<T extends Node>(this: EditorCore, options: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest' | 'all'
    to: Path
    voids?: boolean
  }): void
  removeNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest'
    hanging?: boolean
    voids?: boolean
  }): void
  mergeNodes<T extends Node>(this: EditorCore, options?: {
    at?: Location
    match?: NodeMatch<T>
    mode?: 'highest' | 'lowest'
    hanging?: boolean
    voids?: boolean
  }): void
  delete(this: EditorCore, options?: {
    at?: Location
    distance?: number
    unit?: 'character' | 'word' | 'line' | 'block'
    reverse?: boolean
    hanging?: boolean
    voids?: boolean
  }): void
  deleteBackward(this: EditorCore, options?: {
    unit?: 'character' | 'word' | 'line' | 'block'
  }): void
  deleteForward(this: EditorCore, options?: {
    unit?: 'character' | 'word' | 'line' | 'block'
  }): void
  deleteFragment(this: EditorCore, options?: {
    direction?: 'forward' | 'backward'
  }): void
}

export interface EditorListener {
  on(this: EditorCore, type: string, listener: (...args: any[]) => void): void
  off(this: EditorCore, type: string, listener: (...args: any[]) => void): void
  emit(this: EditorCore, type: string, ...args: any[]): void
}

export interface EditorCore extends
  EditorApply,
  EditorPath,
  EditorSpan,
  EditorPoint,
  EditorRange,
  EditorSelection,
  EditorText,
  EditorElement,
  EditorNode,
  EditorListener {
  __editor__: true
  selection: Range | undefined
  children: Node[]
  isEditor(this: EditorCore, value: any): value is EditorCore
  isBlock(this: EditorCore, value: Element): boolean
  isInline(this: EditorCore, value: Element): boolean
  isVoid(this: EditorCore, value: Element): boolean
  isEmpty(this: EditorCore, element: Element): boolean
  hasInlines(this: EditorCore, element: Element): boolean
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
}
