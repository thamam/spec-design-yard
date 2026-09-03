import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

const captured = vi.hoisted(() => ({
  uiOptions: null as any,
  childTypes: [] as string[],
}))

vi.mock('@excalidraw/excalidraw', () => {
  const WelcomeScreen = () => React.createElement('div', { 'data-testid': 'excalidraw-welcome' })
  WelcomeScreen.displayName = 'WelcomeScreen'
  const Footer = (props: any) => React.createElement('div', { 'data-testid': 'excalidraw-footer' }, props.children)
  const Excalidraw = (props: any) => {
    captured.uiOptions = props.UIOptions
    captured.childTypes = React.Children.toArray(props.children).map((c: any) => c?.type?.displayName || c?.type?.name || '')
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: vi.fn(),
        scrollToContent: vi.fn(),
        getSceneElements: vi.fn(() => []),
        getAppState: vi.fn(() => ({})),
      })
    }, [])
    return React.createElement('div', { 'data-testid': 'excalidraw-stub' }, props.children)
  }
  return { Excalidraw, Footer, WelcomeScreen, default: Excalidraw }
})

import { ExcalidrawCanvas } from '../components/workspace/excalidraw-canvas'

describe('Excalidraw welcome / onboarding', () => {
  beforeEach(() => {
    captured.uiOptions = null
    captured.childTypes = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('does not mount Excalidraw WelcomeScreen and disables the welcome UI', async () => {
    render(<ExcalidrawCanvas parsedSpec={{ system: { name: 'Empty', components: [] } }} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(captured.uiOptions?.welcomeScreen).toBe(false)
    expect(captured.childTypes).not.toContain('WelcomeScreen')
    expect(document.querySelector('[data-testid="excalidraw-welcome"]')).toBeNull()
  })
})
