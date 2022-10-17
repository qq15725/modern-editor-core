import { getCurrentEditorOrFail } from './editor-core'
import { getFirstChildNodeEntry, getLastChildNodeEntry } from './node'
import { isPoint } from './point'
import { getRangeEndPoint, getRangeStartPoint, isRange } from './range'
import type { Location } from './location'
import type { Operation } from './operation'

export type Path = number[]
export interface PathRef {
  current: Path | null
  affinity: 'forward' | 'backward' | null
  unref(): Path | null
}

export function comparePath(path: Path, another: Path): -1 | 0 | 1 {
  const min = Math.min(path.length, another.length)
  for (let i = 0; i < min; i++) {
    if (path[i] < another[i]) return -1
    if (path[i] > another[i]) return 1
  }
  return 0
}

export function isPath(value: any): value is Path {
  return Array.isArray(value)
    && value.every(v => typeof v === 'number')
}

export function isEqualPath(path: Path, another: Path): boolean {
  return path.length === another.length
    && path.every((n, i) => n === another[i])
}

export function isBeforePath(path: Path, another: Path): boolean {
  return comparePath(path, another) === -1
}

export function isAfterPath(path: Path, another: Path): boolean {
  return comparePath(path, another) === 1
}

export function isAncestorPath(path: Path, another: Path): boolean {
  return path.length < another.length
    && comparePath(path, another) === 0
}

export function isEndsBeforePath(path: Path, another: Path): boolean {
  const i = path.length - 1
  return isEqualPath(path.slice(0, i), another.slice(0, i))
    && path[i] < another[i]
}

export function isSiblingPath(path: Path, another: Path): boolean {
  if (path.length !== another.length) return false
  return path[path.length - 1] !== another[another.length - 1]
    && isEqualPath(path.slice(0, -1), another.slice(0, -1))
}

export function isCommonPath(path: Path, another: Path): boolean {
  return path.length <= another.length
    && comparePath(path, another) === 0
}

export function hasPreviousPath(path: Path): boolean {
  return path[path.length - 1] > 0
}

export function getParentPath(path: Path): Path {
  if (path.length === 0) throw new Error(`Cannot get the parent path of the root path [${ path }].`)
  return path.slice(0, -1)
}

export function getPreviousPath(path: Path): Path {
  if (path.length === 0) throw new Error(`Cannot get the previous path of a root path [${ path }], because it has no previous index.`)
  const last = path[path.length - 1]
  if (last <= 0) throw new Error(`Cannot get the previous path of a first child path [${ path }] because it would result in a negative index.`)
  return path.slice(0, -1).concat(last - 1)
}

export function getNextPath(path: Path): Path {
  if (path.length === 0) throw new Error(`Cannot get the next path of a root path [${ path }], because it has no next index.`)
  return path.slice(0, -1).concat(path[path.length - 1] + 1)
}

export function getCommonPath(path: Path, another: Path): Path {
  const common: Path = []
  for (let i = 0; i < path.length && i < another.length; i++) {
    const av = path[i]
    if (av !== another[i]) break
    common.push(av)
  }
  return common
}

export function getLevelPaths(path: Path, options?: { reverse?: boolean }): Path[] {
  const { reverse = false } = options ?? {}
  const paths: Path[] = []
  for (let i = 0; i <= path.length; i++) paths.push(path.slice(0, i))
  if (reverse) paths.reverse()
  return paths
}

export function getAncestorPaths(path: Path, options?: { reverse?: boolean }): Path[] {
  const { reverse = false } = options ?? {}
  const paths = getLevelPaths(path, options)
  if (reverse) {
    return paths.slice(1)
  } else {
    return paths.slice(0, -1)
  }
}

export interface PathOptions {
  depth?: number
  edge?: 'start' | 'end'
}

export function getPath(at: Location, options?: PathOptions): Path {
  const { depth, edge } = options ?? {}
  if (isPoint(at)) {
    at = at.path
  } else if (isRange(at)) {
    at = edge === 'start'
      ? getRangeStartPoint(at).path
      : edge === 'end'
        ? getRangeEndPoint(at).path
        : getCommonPath(at.anchor.path, at.focus.path)
  }
  if (isPath(at) && depth != null) {
    at = at.slice(0, depth)
  }
  return at as Path
}

export function getFirstChildPath(path: Path): Path {
  return getFirstChildNodeEntry(path)[1]
}

export function getLastChildPath(path: Path): Path {
  return getLastChildNodeEntry(path)[1]
}
export interface PathRefOptions {
  affinity?: 'forward' | 'backward' | null
}

export function getPathRef(
  path: Path,
  options: PathRefOptions = {},
): PathRef {
  const editor = getCurrentEditorOrFail()
  const { affinity = 'forward' } = options
  const ref: PathRef = {
    current: path,
    affinity,
    unref: () => {
      const { current } = ref
      const refs = editor.pathRefs
      refs.delete(ref)
      ref.current = null
      return current
    },
  }
  editor.pathRefs.add(ref)
  return ref
}

export interface TransformPathOptions {
  affinity?: 'forward' | 'backward' | null
}

export function transformPath(
  path: Path | null,
  operation: Operation,
  options: TransformPathOptions = {},
): Path | null {
  const { affinity = 'forward' } = options
  if (!path || path?.length === 0) return null
  const p = [...path]
  switch (operation.type) {
    case 'insert_node': {
      const { path: op } = operation
      if (
        isEqualPath(op, p)
        || isEndsBeforePath(op, p)
        || isAncestorPath(op, p)
      ) {
        p[op.length - 1] += 1
      }
      break
    }
    case 'remove_node': {
      const { path: op } = operation
      if (isEqualPath(op, p) || isAncestorPath(op, p)) {
        return null
      } else if (isEndsBeforePath(op, p)) {
        p[op.length - 1] -= 1
      }
      break
    }
    case 'merge_node': {
      const { path: op, position } = operation
      if (isEqualPath(op, p) || isEndsBeforePath(op, p)) {
        p[op.length - 1] -= 1
      } else if (isAncestorPath(op, p)) {
        p[op.length - 1] -= 1
        p[op.length] += position
      }
      break
    }
    case 'split_node': {
      const { path: op, position } = operation
      if (isEqualPath(op, p)) {
        if (affinity === 'forward') {
          p[p.length - 1] += 1
        } else if (affinity === 'backward') {
          // Nothing, because it still refers to the right path.
        } else {
          return null
        }
      } else if (isEndsBeforePath(op, p)) {
        p[op.length - 1] += 1
      } else if (isAncestorPath(op, p) && path[op.length] >= position) {
        p[op.length - 1] += 1
        p[op.length] -= position
      }
      break
    }
    case 'move_node': {
      const { path: op, newPath: onp } = operation
      if (isEqualPath(op, onp)) return null
      if (isAncestorPath(op, p) || isEqualPath(op, p)) {
        const copy = onp.slice()
        if (isEndsBeforePath(op, onp) && op.length < onp.length) {
          copy[op.length - 1] -= 1
        }
        return copy.concat(p.slice(op.length))
      } else if (
        isSiblingPath(op, onp)
        && (isAncestorPath(onp, p) || isEqualPath(onp, p))
      ) {
        if (isEndsBeforePath(op, p)) {
          p[op.length - 1] -= 1
        } else {
          p[op.length - 1] += 1
        }
      } else if (
        isEndsBeforePath(onp, p)
        || isEqualPath(onp, p)
        || isAncestorPath(onp, p)
      ) {
        if (isEndsBeforePath(op, p)) {
          p[op.length - 1] -= 1
        }

        p[onp.length - 1] += 1
      } else if (isEndsBeforePath(op, p)) {
        if (isEqualPath(onp, p)) {
          p[onp.length - 1] += 1
        }
        p[op.length - 1] -= 1
      }
      break
    }
  }
  return p
}
