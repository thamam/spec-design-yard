import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'

const captured = vi.hoisted(() => ({
  props: null as any,
}))

vi.mock('@excalidraw/excalidraw', () => {
  const Excalidraw = (props: any) => {
    captured.props = props
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: vi.fn(),
        scrollToContent: vi.fn(),
        getSceneElements: vi.fn(() => []),
      })
    }, [])
    return null
  }
  const Footer = (props: any) => props.children
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'
import { parseSpec } from '../lib/spec-model'
import { waitForWorkspaceHydration } from './wait-for-hydration'
import { installWorkspaceFetch, projectReply } from './workspace-fetch-double'

const SEED = `# retest seed - comments must survive
system:
  name: Canvas Retest
  components:
    - id: worker
      type: Stage
      name: Worker
    - id: orphan
      type: Stage
      name: Orphan
`

async function flushUntilCanvasMounted() {
  for (let i = 0; i < 40 && !captured.props; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  expect(captured.props).not.toBeNull()
}

function connectWorkerToOrphan() {
  const { spec } = parseSpec(SEED)
  const compiled = compileSpecToExcalidrawElements(spec)
  const good = {
    type: 'arrow',
    id: 'aConnect',
    isDeleted: false,
    startBinding: { elementId: 'worker' },
    endBinding: { elementId: 'orphan' },
  }
  act(() => {
    captured.props.onChange([...compiled, good], { cursorButton: 'up' })
  })
}

describe('canvas connect writeback vs file-mode sync', () => {
  beforeEach(() => {
    captured.props = null
    localStorage.clear()
    db.removeSpec('main')
  })

  afterEach(() => {
    localStorage.clear()
    db.removeSpec('main')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('an own-session canvas connect does not raise the external-change banner', async () => {
    const { puts } = installWorkspaceFetch({
      spec: {
        body: {
          id: 'main',
          title: 'Canvas Retest',
          yamlContent: SEED,
          rev: 'r-seed',
          epoch: 'e1',
        },
      },
      project: projectReply('/tmp/canvas-retest'),
    })

    render(<Workspace />)
    await waitForWorkspaceHydration()
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('# retest seed')
    expect(textarea.value).not.toMatch(/target:\s*orphan/)

    connectWorkerToOrphan()
    expect(textarea.value).toMatch(/target:\s*orphan/)
    expect(textarea.value).toContain('# retest seed')
    expect(screen.queryByTestId('sync-reload')).toBeNull()
    expect(screen.getByTestId('sync-status').textContent).not.toMatch(/changed outside|differs from this session/i)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(puts.some((p) => p.body.yamlContent?.includes('target: orphan'))).toBe(true)
    })
    expect(screen.queryByTestId('sync-reload')).toBeNull()
    expect(screen.queryByTestId('sync-download')).toBeNull()
    expect(screen.getByTestId('sync-status').textContent).not.toMatch(/changed outside|differs from this session/i)
    expect(textarea.value).toMatch(/target:\s*orphan/)
  })

  test('a 409 that leaves disk on the seed offers Retry, not Reload-and-discard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installWorkspaceFetch({
      spec: {
        body: {
          id: 'main',
          title: 'Canvas Retest',
          yamlContent: SEED,
          rev: 'r-seed',
          epoch: 'e1',
        },
      },
      project: projectReply('/tmp/canvas-retest'),
      put: { status: 409, body: { conflict: true } },
    })

    render(<Workspace />)
    await waitForWorkspaceHydration()
    await flushUntilCanvasMounted()

    connectWorkerToOrphan()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toMatch(/target:\s*orphan/)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(screen.getByTestId('sync-retry')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('sync-reload')).toBeNull()
    expect(screen.getByTestId('sync-download')).toBeInTheDocument()
    expect(screen.getByTestId('sync-status').textContent).toMatch(/have not reached disk/i)
    expect(screen.getByTestId('sync-status').textContent).not.toMatch(/changed outside/i)
    expect(textarea.value).toMatch(/target:\s*orphan/)
    expect(textarea.value).toContain('# retest seed')
  })
})
