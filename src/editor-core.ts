import { isNodes, splitNodes } from './node'
import { isText } from './text'
import { isPlainObject } from './utils'
import type { Operation } from './operation'
import type { Element } from './element'
import type { Node } from './node'
import type { PointRef } from './point'
import type { Path, PathRef } from './path'
import type { Range, RangeRef } from './range'

export interface EditorCoreListener {
  (...args: any[]): void
}

let activeEditor: EditorCore | undefined

export class EditorCore {
  public pathRefs = new Set<PathRef>()
  public pointRefs = new Set<PointRef>()
  public rangeRefs = new Set<RangeRef>()
  public dirtyPaths: Path[] = []
  public dirtyPathKeys = new Set<string>()
  public isNormalizing = true
  public operations: Operation[] = []
  public applying = false
  public selection: Range | undefined
  public children: Node[]
  protected listeners = new Map<string, EditorCoreListener[]>()

  public constructor(children: Node[] = [], selection?: Range) {
    this.children = children
    this.selection = selection
  }

  public run<T>(fn: () => T): T | undefined {
    const currentEditor = activeEditor
    try {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      activeEditor = this
      return fn()
    } finally {
      activeEditor = currentEditor
    }
  }

  public isBlock(value: Element): boolean {
    return !this.isInline(value)
  }

  public isInline(_value: Element): boolean {
    return false
  }

  public isVoid(_value: Element): boolean {
    return false
  }

  public isEmpty(element: Element): boolean {
    const { children } = element
    const first = children[0]
    return (
      children.length === 0
      || (
        children.length === 1
        && isText(first)
        && first.text === ''
        && !this.isVoid(element)
      )
    )
  }

  public insertBreak(): void {
    splitNodes({ always: true })
  }

  public insertSoftBreak(): void {
    splitNodes({ always: true })
  }

  public emit(type: string, ...args: any[]): void {
    this.listeners.get(type)?.forEach(listener => {
      try {
        listener.call(this, ...args)
      } catch (err: any) {
        console.error(err)
      }
    })
  }

  public on(type: string, listener: EditorCoreListener): void {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  public off(type: string, listener: EditorCoreListener): void {
    const listeners = this.listeners.get(type) || []
    listeners.splice(listeners.findIndex(v => v === listener), 1)
    if (!listeners.length) this.listeners.delete(type)
  }
}

export function getCurrentEditor(): EditorCore | undefined {
  return activeEditor
}

export function getCurrentEditorOrFail(): EditorCore {
  if (!activeEditor) {
    throw new Error(
      'getCurrentEditorOrFail() is called when there is no active editor'
      + ' to be associated with.',
    )
  }
  return activeEditor
}

export function isEditor(value: any): value is EditorCore {
  return Boolean(
    isPlainObject(value)
    && isNodes(value.children)
    && value.__editor__,
  )
}

export function isBlock(value: Element): boolean {
  return getCurrentEditorOrFail().isBlock(value)
}

export function isInline(value: Element): boolean {
  return getCurrentEditorOrFail().isInline(value)
}

export function isVoid(value: Element): boolean {
  return getCurrentEditorOrFail().isVoid(value)
}
