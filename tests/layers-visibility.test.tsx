import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Layer Visibility System', () => {
  test('compileSpecToExcalidrawElements supports hiding specific component types', () => {
    const mockSpec = {
      system: {
        name: 'Test System',
        components: [
          { id: 'g1', type: 'Gateway', x: 10, y: 10, connections: [{ target: 's1', label: 'route' }] },
          { id: 's1', type: 'Store', x: 100, y: 10, connections: [{ target: 'b1', label: 'save' }] },
          { id: 'b1', type: 'Brick', x: 200, y: 10 }
        ]
      }
    }

    // 1. Compile with no hidden types
    const elementsAll = compileSpecToExcalidrawElements(mockSpec, undefined, undefined, [])
    const g1Rect = elementsAll.find((el: any) => el.id === 'g1' && el.type === 'rectangle')
    const s1Rect = elementsAll.find((el: any) => el.id === 's1' && el.type === 'rectangle')
    const b1Rect = elementsAll.find((el: any) => el.id === 'b1' && el.type === 'rectangle')
    const arrowG1ToS1 = elementsAll.find((el: any) => el.id === 'arrow-g1-s1')
    const arrowS1ToB1 = elementsAll.find((el: any) => el.id === 'arrow-s1-b1')

    expect(g1Rect).toBeDefined()
    expect(s1Rect).toBeDefined()
    expect(b1Rect).toBeDefined()
    expect(arrowG1ToS1).toBeDefined()
    expect(arrowS1ToB1).toBeDefined()

    // 2. Hide Store components
    const elementsHiddenStore = compileSpecToExcalidrawElements(mockSpec, undefined, undefined, ['Store'])
    const g1Rect2 = elementsHiddenStore.find((el: any) => el.id === 'g1' && el.type === 'rectangle')
    const s1Rect2 = elementsHiddenStore.find((el: any) => el.id === 's1' && el.type === 'rectangle')
    const b1Rect2 = elementsHiddenStore.find((el: any) => el.id === 'b1' && el.type === 'rectangle')
    const arrowG1ToS1_2 = elementsHiddenStore.find((el: any) => el.id === 'arrow-g1-s1')
    const arrowS1ToB1_2 = elementsHiddenStore.find((el: any) => el.id === 'arrow-s1-b1')

    expect(g1Rect2).toBeDefined()
    expect(s1Rect2).toBeUndefined() // Should be hidden!
    expect(b1Rect2).toBeDefined()
    
    // Connections pointing to or starting from hidden components should be skipped!
    expect(arrowG1ToS1_2).toBeUndefined()
    expect(arrowS1ToB1_2).toBeUndefined()
  })

  test('Workspace supports hiding and showing layers via the LayersView and dynamically filters GridView cards', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Layers view in Canvas Panel
    const layersViewBtn = screen.getByRole('tab', { name: /Layers/i })
    fireEvent.click(layersViewBtn)

    // Find the toggle button for Store layer
    const hideStoreBtn = screen.getByRole('button', { name: /Hide Store layer/i })
    expect(hideStoreBtn).toBeInTheDocument()

    // 2. Switch to Grid View first to see that inbox (Store) card is visible
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)
    expect(screen.getByRole('button', { name: /Select component inbox/i })).toBeInTheDocument()

    // 3. Go back to Layers view and hide Store
    fireEvent.click(layersViewBtn)
    const hideStoreBtnFresh = screen.getByRole('button', { name: /Hide Store layer/i })
    fireEvent.click(hideStoreBtnFresh)

    // The toggle button's label should now be "Show Store layer"
    expect(screen.getByRole('button', { name: /Show Store layer/i })).toBeInTheDocument()

    // 4. Switch back to Grid View and verify that the inbox card is filtered out
    fireEvent.click(gridViewBtn)
    expect(screen.queryByRole('button', { name: /Select component inbox/i })).not.toBeInTheDocument()

    // 5. Unhide Store from Layers view and verify it reappears
    fireEvent.click(layersViewBtn)
    const showStoreBtn = screen.getByRole('button', { name: /Show Store layer/i })
    fireEvent.click(showStoreBtn)

    // Switch to Grid View and verify inbox card is visible again
    fireEvent.click(gridViewBtn)
    expect(screen.getByRole('button', { name: /Select component inbox/i })).toBeInTheDocument()
  })

  test('compileSpecToExcalidrawElements handles mixed-case type layer groupings and untyped units robustly', () => {
    const mockSpec = {
      system: {
        name: 'Mixed Spec',
        components: [
          { id: 'c1', type: 'gateway', x: 10, y: 10 },
          { id: 'c2', type: 'Gateway', x: 100, y: 10 },
          { id: 'c3', x: 200, y: 10 } // Untyped -> defaults to Unit
        ]
      }
    }

    // Hide Gateway (using lowercase in search, but should match both Gateway and gateway)
    const elements1 = compileSpecToExcalidrawElements(mockSpec, undefined, undefined, ['gateway'])
    expect(elements1.find((el: any) => el.id === 'c1')).toBeUndefined()
    expect(elements1.find((el: any) => el.id === 'c2')).toBeUndefined()
    expect(elements1.find((el: any) => el.id === 'c3')).toBeDefined() // Unit is visible

    // Hide Unit layer (defaults)
    const elements2 = compileSpecToExcalidrawElements(mockSpec, undefined, undefined, ['unit'])
    expect(elements2.find((el: any) => el.id === 'c1')).toBeDefined()
    expect(elements2.find((el: any) => el.id === 'c2')).toBeDefined()
    expect(elements2.find((el: any) => el.id === 'c3')).toBeUndefined() // Hidden!
  })
})
