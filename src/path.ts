import { PATH_REFS } from './weak-maps'
import type { EditorPath, Path, PathRef } from './types'

export function useEditorPath(): EditorPath {
  return {
    isPath(value): value is Path {
      return Array.isArray(value)
        && (value.length === 0 || typeof value[0] === 'number')
    },
    isBeforePath(path, another) {
      return this.comparePath(path, another) === -1
    },
    isAfterPath(path, another) {
      return this.comparePath(path, another) === 1
    },
    isAncestorPath(path, another) {
      return path.length < another.length
        && this.comparePath(path, another) === 0
    },
    isEndsBeforePath(path, another) {
      const i = path.length - 1
      const as = path.slice(0, i)
      const bs = another.slice(0, i)
      const av = path[i]
      const bv = another[i]
      return this.equalsPath(as, bs) && av < bv
    },
    isSiblingPath(path, another) {
      if (path.length !== another.length) return false
      const as = path.slice(0, -1)
      const bs = another.slice(0, -1)
      const al = path[path.length - 1]
      const bl = another[another.length - 1]
      return al !== bl && this.equalsPath(as, bs)
    },
    isCommonPath(path, another) {
      return path.length <= another.length && this.comparePath(path, another) === 0
    },
    hasPreviousPath(path) {
      return path[path.length - 1] > 0
    },
    getPath(at, options = {}) {
      const { depth, edge } = options
      if (this.isPath(at)) {
        if (edge === 'start') {
          at = this.getFirstNode(at)[1]
        } else if (edge === 'end') {
          at = this.getLastNode(at)[1]
        }
      }
      if (this.isRange(at)) {
        if (edge === 'start') {
          at = this.getRangeEdges(at)[0]
        } else if (edge === 'end') {
          at = this.getRangeEdges(at)[1]
        } else {
          at = this.getCommonPath(at.anchor.path, at.focus.path)
        }
      }
      if (this.isPoint(at)) {
        at = at.path
      }
      if (Array.isArray(at) && depth != null) {
        at = at.slice(0, depth)
      }
      return at as Path
    },
    getParentPath(path) {
      if (path.length === 0) throw new Error(`Cannot get the parent path of the root path [${ path }].`)
      return path.slice(0, -1)
    },
    getPreviousPath(path) {
      if (path.length === 0) throw new Error(`Cannot get the previous path of a root path [${ path }], because it has no previous index.`)
      const last = path[path.length - 1]
      if (last <= 0) throw new Error(`Cannot get the previous path of a first child path [${ path }] because it would result in a negative index.`)
      return path.slice(0, -1).concat(last - 1)
    },
    getNextPath(path) {
      if (path.length === 0) throw new Error(`Cannot get the next path of a root path [${ path }], because it has no next index.`)
      const last = path[path.length - 1]
      return path.slice(0, -1).concat(last + 1)
    },
    getCommonPath(path, another) {
      const common: Path = []
      for (let i = 0; i < path.length && i < another.length; i++) {
        const av = path[i]
        const bv = another[i]
        if (av !== bv) break
        common.push(av)
      }
      return common
    },
    getLevelPaths(path, options = {}) {
      const { reverse = false } = options
      const paths: Path[] = []
      for (let i = 0; i <= path.length; i++) paths.push(path.slice(0, i))
      if (reverse) paths.reverse()
      return paths
    },
    getPathRef(path, options = {}) {
      const { affinity = 'forward' } = options
      const ref: PathRef = {
        current: path,
        affinity,
        unref: () => {
          const { current } = ref
          const refs = this.getPathRefs()
          refs.delete(ref)
          ref.current = null
          return current
        },
      }
      const refs = this.getPathRefs()
      refs.add(ref)
      return ref
    },
    getPathRefs() {
      let refs = PATH_REFS.get(this)
      if (!refs) {
        refs = new Set()
        PATH_REFS.set(this, refs)
      }
      return refs
    },
    comparePath(path, another) {
      const min = Math.min(path.length, another.length)
      for (let i = 0; i < min; i++) {
        if (path[i] < another[i]) return -1
        if (path[i] > another[i]) return 1
      }
      return 0
    },
    equalsPath(path, another) {
      return path.length === another.length
        && path.every((n, i) => n === another[i])
    },
    transformPath(path, operation, options = {}) {
      const { affinity = 'forward' } = options
      if (!path || path?.length === 0) return null
      const p = [...path]
      switch (operation.type) {
        case 'insert_node': {
          const { path: op } = operation
          if (
            this.equalsPath(op, p)
            || this.isEndsBeforePath(op, p)
            || this.isAncestorPath(op, p)
          ) {
            p[op.length - 1] += 1
          }
          break
        }
        case 'remove_node': {
          const { path: op } = operation
          if (this.equalsPath(op, p) || this.isAncestorPath(op, p)) {
            return null
          } else if (this.isEndsBeforePath(op, p)) {
            p[op.length - 1] -= 1
          }
          break
        }
        case 'merge_node': {
          const { path: op, position } = operation
          if (this.equalsPath(op, p) || this.isEndsBeforePath(op, p)) {
            p[op.length - 1] -= 1
          } else if (this.isAncestorPath(op, p)) {
            p[op.length - 1] -= 1
            p[op.length] += position
          }
          break
        }
        case 'split_node': {
          const { path: op, position } = operation
          if (this.equalsPath(op, p)) {
            if (affinity === 'forward') {
              p[p.length - 1] += 1
            } else if (affinity === 'backward') {
              // Nothing, because it still refers to the right path.
            } else {
              return null
            }
          } else if (this.isEndsBeforePath(op, p)) {
            p[op.length - 1] += 1
          } else if (this.isAncestorPath(op, p) && path[op.length] >= position) {
            p[op.length - 1] += 1
            p[op.length] -= position
          }
          break
        }
        case 'move_node': {
          const { path: op, newPath: onp } = operation
          if (this.equalsPath(op, onp)) return null
          if (this.isAncestorPath(op, p) || this.equalsPath(op, p)) {
            const copy = onp.slice()
            if (this.isEndsBeforePath(op, onp) && op.length < onp.length) {
              copy[op.length - 1] -= 1
            }
            return copy.concat(p.slice(op.length))
          } else if (
            this.isSiblingPath(op, onp)
            && (this.isAncestorPath(onp, p) || this.equalsPath(onp, p))
          ) {
            if (this.isEndsBeforePath(op, p)) {
              p[op.length - 1] -= 1
            } else {
              p[op.length - 1] += 1
            }
          } else if (
            this.isEndsBeforePath(onp, p)
            || this.equalsPath(onp, p)
            || this.isAncestorPath(onp, p)
          ) {
            if (this.isEndsBeforePath(op, p)) {
              p[op.length - 1] -= 1
            }

            p[onp.length - 1] += 1
          } else if (this.isEndsBeforePath(op, p)) {
            if (this.equalsPath(onp, p)) {
              p[onp.length - 1] += 1
            }
            p[op.length - 1] -= 1
          }
          break
        }
      }
      return p
    },
  }
}
