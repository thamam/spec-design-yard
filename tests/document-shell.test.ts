import { describe, test, expect } from 'vitest'
import Document from '../pages/_document'
import { WORKSPACE_BOOTSTRAP_BG, WORKSPACE_BOOTSTRAP_FG } from '../lib/status-copy'

describe('HTML document shell', () => {
  test('paints a dark workspace before CSS loads', () => {
    const tree = Document()
    expect(tree.props.style.backgroundColor).toBe(WORKSPACE_BOOTSTRAP_BG)
    expect(tree.props.style.color).toBe(WORKSPACE_BOOTSTRAP_FG)
    const body = tree.props.children[1]
    expect(body.type).toBe('body')
    expect(body.props.style.backgroundColor).toBe(WORKSPACE_BOOTSTRAP_BG)
    expect(body.props.style.margin).toBe(0)
  })
})
