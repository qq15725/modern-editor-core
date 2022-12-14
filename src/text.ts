import { getNode, getNodeEntries, getNodes } from './node'
import { getPath, isEqualPath } from './path'
import { getRange, getRangeEdgePoints } from './range'
import { isDeepEqual, isPlainObject } from './utils'
import type { NodeEntry } from './node'
import type { Path } from './path'
import type { Location } from './location'

export interface Text {
  text: string
  [key: string]: unknown
}

export type TextEntry = NodeEntry<Text>

export function isText(value: any): value is Text {
  return isPlainObject(value)
    && typeof value.text === 'string'
}

export function getText(path: Path): Text | null {
  const text = getNode(path)
  return isText(text) ? text : null
}

export function getTextOrFail(path: Path): Text {
  const text = getText(path)
  if (!text) throw new Error(`Cannot get the leaf node at path [${ path }] because it refers to a non-leaf node: ${ JSON.stringify(text) }`)
  return text
}

export interface TextEntryOptions {
  depth?: number
  edge?: 'start' | 'end'
}

export function getTextEntry(at: Location, options?: TextEntryOptions): TextEntry | null {
  const path = getPath(at, options)
  const node = getText(path)
  return node ? [node, path] : null
}

export function getTextEntryOrFail(at: Location, options?: TextEntryOptions): TextEntry {
  const entry = getTextEntry(at, options)
  if (!entry) throw new Error(`Cannot get the leaf node at location [${ at }] because it refers to a non-leaf node: ${ JSON.stringify(entry) }`)
  return entry
}

export interface TextEntriesOptions {
  from?: Path
  to?: Path
  reverse?: boolean
  pass?: (node: NodeEntry) => boolean
}

export function *getTextEntries(
  options?: TextEntriesOptions,
): Generator<TextEntry, void, undefined> {
  for (const [node, path] of getNodes(options)) {
    if (isText(node)) yield [node, path]
  }
}

export interface TextContentOptions {
  voids?: boolean
}

export function getTextContent(
  at: Location,
  options?: TextContentOptions,
): string {
  const { voids = false } = options ?? {}
  const range = getRange(at)
  const [start, end] = getRangeEdgePoints(range)
  let text = ''
  for (const [node, path] of getNodeEntries<Text>({
    at: range,
    match: node => isText(node),
    voids,
  })) {
    let t = node.text
    if (isEqualPath(path, end.path)) t = t.slice(0, end.offset)
    if (isEqualPath(path, start.path)) t = t.slice(start.offset)
    text += t
  }
  return text
}

export function isEqualText(text: Text, another: Text, options?: { loose?: boolean }): boolean {
  const { loose = false } = options ?? {}
  function omitText(obj: Record<any, any>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { text, ...rest } = obj
    return rest
  }
  return isDeepEqual(
    loose ? omitText(text) : text,
    loose ? omitText(another) : another,
  )
}
