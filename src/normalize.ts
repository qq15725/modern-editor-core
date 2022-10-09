import type { EditorNormalize } from './types'

export function useEditorNormalize(): EditorNormalize {
  return {
    dirtyPaths: [],
    dirtyPathKeys: new Set(),
    isNormalizing: true,
    normalize(options = {}) {
      if (!this.isNormalizing) return
      const { force = false } = options
      const popDirtyPath = () => {
        const path = this.dirtyPaths.pop()!
        const key = path.join(',')
        this.dirtyPathKeys.delete(key)
        return path
      }
      if (force) {
        this.dirtyPaths = Array.from(this.queryNodes(), ([, p]) => p)
        this.dirtyPathKeys = new Set(this.dirtyPaths.map(p => p.join(',')))
      }
      if (this.dirtyPaths.length === 0) return
      this.withoutNormalizing(() => {
        for (const dirtyPath of this.dirtyPaths) {
          if (this.hasNode(dirtyPath)) {
            const entry = this.queryNode(dirtyPath)
            const node = entry[0]
            if (this.isElement(node) && node.children.length === 0) this.normalizeNode(entry)
          }
        }
        const max = this.dirtyPaths.length * 42
        let m = 0
        while (this.dirtyPaths.length !== 0) {
          if (m > max) {
            throw new Error(`Could not completely normalize the editor after ${ max } iterations! This is usually due to incorrect normalization logic that leaves a node in an invalid state.`)
          }
          const dirtyPath = popDirtyPath()
          if (this.hasNode(dirtyPath)) {
            this.normalizeNode(this.queryNode(dirtyPath))
          }
          m++
        }
      })
    },
    withoutNormalizing(fn) {
      const value = this.isNormalizing
      this.isNormalizing = false
      try {
        fn()
      } finally {
        this.isNormalizing = value
      }
      this.normalize()
    },
  }
}
