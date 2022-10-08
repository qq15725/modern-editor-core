import { domRangeToRange, rangeToDomRange } from './dom'
import type { EditorCore, Element, Node, Path, Point, Range } from './types'

function hotkey(keydown: (key: string, event: KeyboardEvent) => void) {
  const keys = new Map<string, string>()
  return {
    onBlur: () => keys.clear(),
    onKeydown: (event: KeyboardEvent) => {
      if (event.isComposing) return
      const { code, key } = event
      keys.set(code, key)
      keydown([...keys.values()].join('+'), event)
    },
    onKeyup: ({ code, key }: KeyboardEvent) => {
      key === 'Meta' ? keys.clear() : keys.delete(code)
    },
  }
}

export function render(
  editor: EditorCore,
  styles: Record<string, any>,
  hasSelection: boolean,
  createElement: (tag: string, attrs: Record<string, any>, children: any[]) => any,
  createAttributes?: (node: Node) => Record<string, any>,
) {
  function renderNode(node: Node, path: Path, parent: Element): any {
    const attrs: Record<string, any> = {
      ...createAttributes?.(node),
      'data-editor-path': path.join('-'),
    }
    if (editor.isText(node)) {
      attrs['data-editor-node'] = 'text'
    } else {
      attrs['data-editor-node'] = 'element'
      if (editor.isInlineElement(node)) {
        attrs['data-editor-inline'] = true
      }
      if (editor.isVoidElement(node)) {
        attrs['data-editor-void'] = true
      }
    }
    if (editor.isText(node)) {
      return createElement('span', attrs, [
        createElement('span', { 'data-editor-leaf': true }, [
          editor.isVoid(parent)
            ? createElement('span', {
              'data-editor-zero-width': 'z',
              'data-editor-length': editor.getNodeTextContent(node).length,
            }, ['\uFEFF'])
            : node.text === ''
              ? createElement('span', { 'data-editor-zero-width': 'z' }, ['\uFEFF'])
              : createElement('span', { 'data-editor-string': true }, [node.text]),
        ]),
      ])
    } else if (editor.isElement(node)) {
      return createElement(
        editor.isBlock(node) ? 'div' : 'span',
        attrs,
        node.children.map((child, index) => {
          const vnode = renderNode(child, [...path, index], node)
          if (editor.isVoid(node)) {
            return createElement('span', {
              'data-editor-spacer': true,
              'style': {
                height: '0px',
                color: 'transparent',
                outline: 'none',
                position: 'absolute',
              },
            }, vnode)
          }
          return vnode
        }),
      )
    }
  }

  const isEmpty = !hasSelection && editor.getNodeTextContent(editor) === ''

  return createElement(
    'div',
    {
      'role': 'textbox',
      'contentEditable': true,
      'aria-multiline': true,
      'data-gramm': false,
      'data-editor': true,
      'data-editor-node': 'value',
      'style': {
        outline: 'none',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        color: isEmpty ? 'grey' : undefined,
        ...styles,
      },
      'onBeforeinput': (event: InputEvent) => {
        event.preventDefault()
        if (!(editor as any).isCompositing && event.data) {
          editor.insertText(event.data)
        }
      },
      'onCompositionstart': () => (editor as any).isCompositing = true,
      'onCompositionend': (event: CompositionEvent) => {
        event.preventDefault()
        event.data && editor.insertText(event.data)
        ;(editor as any).isCompositing = false
      },
      ...hotkey((key, event) => {
        switch (key) {
          case 'Shift+Enter':
            event.preventDefault()
            editor.insertSoftBreak()
            break
          case 'Enter':
            event.preventDefault()
            editor.insertBreak()
            break
          case 'Backspace':
            event.preventDefault()
            if (editor.selection && editor.isExpandedRange(editor.selection)) {
              editor.deleteFragment({ direction: 'backward' })
            } else {
              editor.deleteBackward()
            }
            break
          case 'Delete':
            event.preventDefault()
            if (editor.selection && editor.isExpandedRange(editor.selection)) {
              editor.deleteFragment({ direction: 'forward' })
            } else {
              editor.deleteForward()
            }
            break
          case 'mod+z':
            event.preventDefault()
            if ((editor as any).undo) {
              (editor as any).undo()
            }
            break
        }
      }),
    },
    isEmpty
      ? [
          renderNode({
            children: [
              { text: '请输入...' },
            ],
          }, [0], editor as unknown as Element),
        ]
      : editor.children.map((node, index) => renderNode(node, [index], editor as unknown as Element)),

  )
}

export function selectionChange(editor: EditorCore) {
  if ((editor as any).isCompositing) return
  const domSelection = window.getSelection()
  if (!domSelection) return
  if (editor.selection) {
    try {
      if (editor.equalsRange(editor.selection, domRangeToRange(domSelection))) return
      const newDomRange = rangeToDomRange(editor, editor.selection)
      if (editor.isBackwardRange(editor.selection)) {
        domSelection.setBaseAndExtent(
          newDomRange.endContainer,
          newDomRange.endOffset,
          newDomRange.startContainer,
          newDomRange.startOffset,
        )
      } else {
        domSelection.setBaseAndExtent(
          newDomRange.startContainer,
          newDomRange.startOffset,
          newDomRange.endContainer,
          newDomRange.endOffset,
        )
      }
    } catch (err: any) {
      //
    }
  } else {
    domSelection.removeAllRanges()
  }
}

export function DOMSelectionChange(editor: EditorCore) {
  if ((editor as any).isCompositing) return
  const { activeElement } = window.document
  const domSelection = window.getSelection()
  if (!domSelection) return
  if ((activeElement as HTMLElement)?.dataset.editor) {
    let range: Range | Point
    try {
      range = domRangeToRange(domSelection)
    } catch (err) {
      range = editor.getEndPoint()
    }
    editor.select(range)
  } else {
    editor.deselect()
  }
}
