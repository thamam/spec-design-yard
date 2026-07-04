import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useUndoRedo } from "../components/workspace/use-undo-redo"

describe("Undo/Redo History Hook", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("initializes with the initial spec and empty stack state", () => {
    const { result } = renderHook(() => useUndoRedo("initial spec"))

    expect(result.current.specText).toBe("initial spec")
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  test("pushes state immediately for structural changes", () => {
    const { result } = renderHook(() => useUndoRedo("state 1"))

    act(() => {
      result.current.updateSpecText("state 2", { immediate: true })
    })

    expect(result.current.specText).toBe("state 2")
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    act(() => {
      result.current.undo()
    })

    expect(result.current.specText).toBe("state 1")
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.redo()
    })

    expect(result.current.specText).toBe("state 2")
  })

  test("debounces manual text entry edits to group keystrokes", () => {
    const { result } = renderHook(() => useUndoRedo("initial"))

    // Simulate fast typing
    act(() => {
      result.current.updateSpecText("initial t")
    })
    act(() => {
      result.current.updateSpecText("initial ty")
    })
    act(() => {
      result.current.updateSpecText("initial typ")
    })
    act(() => {
      result.current.updateSpecText("initial typi")
    })

    // At this point, timers shouldn't have fired. No history commit.
    expect(result.current.specText).toBe("initial typi")
    expect(result.current.canUndo).toBe(false) // Not committed to history stack yet

    // Fast-forward time to trigger the debounce commit
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.canUndo).toBe(true)

    // Undo should go back to "initial", not individual letters
    act(() => {
      result.current.undo()
    })

    expect(result.current.specText).toBe("initial")
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    act(() => {
      result.current.redo()
    })

    expect(result.current.specText).toBe("initial typi")
  })

  test("supports functional state updates", () => {
    const { result } = renderHook(() => useUndoRedo("value"))

    act(() => {
      result.current.updateSpecText((prev) => prev + " appended", { immediate: true })
    })

    expect(result.current.specText).toBe("value appended")
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.undo()
    })

    expect(result.current.specText).toBe("value")
  })

  test("clears the redo stack when a new change is made", () => {
    const { result } = renderHook(() => useUndoRedo("initial"))

    act(() => {
      result.current.updateSpecText("state A", { immediate: true })
    })
    act(() => {
      result.current.updateSpecText("state B", { immediate: true })
    })

    // Go back to state A
    act(() => {
      result.current.undo()
    })
    expect(result.current.specText).toBe("state A")
    expect(result.current.canRedo).toBe(true)

    // Make new change
    act(() => {
      result.current.updateSpecText("state C", { immediate: true })
    })
    expect(result.current.specText).toBe("state C")
    expect(result.current.canRedo).toBe(false) // Redo is cleared
  })

  test("caps history size at a maximum limit of 100", () => {
    const { result } = renderHook(() => useUndoRedo("0"))

    // Perform 110 changes immediately
    for (let i = 1; i <= 110; i++) {
      act(() => {
        result.current.updateSpecText(String(i), { immediate: true })
      })
    }

    expect(result.current.specText).toBe("110")
    expect(result.current.canUndo).toBe(true)

    // We should be able to undo at most 99 times, back to state "11" (not "10")
    for (let i = 0; i < 99; i++) {
      act(() => {
        result.current.undo()
      })
    }

    expect(result.current.specText).toBe("11")
    expect(result.current.canUndo).toBe(false)
  })
})
