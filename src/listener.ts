import type { EditorListener } from './types'

export function useEditorListener(): EditorListener {
  const map = new Map<string, ((...args: any[]) => void)[]>()
  return {
    emit(type, ...args) {
      map.get(type)?.forEach(listener => {
        try {
          listener.call(this, ...args)
        } catch (err: any) {
          console.error(err)
        }
      })
    },
    on(type, listener) {
      const listeners = map.get(type) || []
      listeners.push(listener)
      map.set(type, listeners)
    },
    off(type, listener) {
      const listeners = map.get(type) || []
      listeners.splice(listeners.findIndex(v => v === listener), 1)
      if (!listeners.length) map.delete(type)
    },
  }
}
