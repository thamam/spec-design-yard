import { describe, test, expect } from 'vitest'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'

describe('Canvas Simulation Visualization', () => {
  const mockSpec = {
    system: {
      name: 'Simulation Test Spec',
      components: [
        {
          id: 'inbox',
          type: 'Store',
          connections: [{ target: 'digest_stage', label: 'process' }]
        },
        {
          id: 'digest_stage',
          type: 'Stage'
        }
      ]
    }
  }

  test('compileSpecToExcalidrawElements produces streaming particles during active simulation', () => {
    // 1. Idle state - no particles
    const elementsIdle = compileSpecToExcalidrawElements(
      mockSpec,
      'inbox',
      'digest_stage',
      [],
      'idle',
      0,
      100
    )
    const particlesIdle = elementsIdle.filter((el: any) => el.id.startsWith('particle-'))
    expect(particlesIdle.length).toBe(0)

    // 2. Running state - should have particles on the active edge
    const elementsRunning = compileSpecToExcalidrawElements(
      mockSpec,
      'inbox',
      'digest_stage',
      [],
      'running',
      10, // 10 simulated packets
      100
    )

    // We expect 3 particles along the active connection edge: inbox -> digest_stage
    const particlesRunning = elementsRunning.filter((el: any) => el.id.startsWith('particle-inbox-digest_stage'))
    expect(particlesRunning.length).toBe(3)

    // Verify particle attributes (ellipse type, filled, custom styling)
    const p1 = particlesRunning[0]
    expect(p1.type).toBe('ellipse')
    expect(p1.fillStyle).toBe('solid')
    expect(p1.strokeColor).toBe('#34d399') // Neon Green
    expect(p1.backgroundColor).toBe('#10b981') // Solid Emerald
  })

  test('active nodes on path are styled with active neon green outline/bg during simulation', () => {
    const elementsRunning = compileSpecToExcalidrawElements(
      mockSpec,
      'inbox',
      'digest_stage',
      [],
      'running',
      50,
      100
    )

    const inboxRect = elementsRunning.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    expect(inboxRect).toBeDefined()
    expect(inboxRect.strokeColor).toBe('#34d399') // Active neon green
    expect(inboxRect.backgroundColor).toBe('rgba(52, 211, 153, 0.25)') // Active green bg glow
  })
})
