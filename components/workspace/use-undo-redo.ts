import { useState, useRef, useEffect, useCallback } from "react"

export interface UndoRedoOptions {
  immediate?: boolean
}

export function useUndoRedo(initialText: string, maxHistory = 100) {
  const [specText, setSpecTextState] = useState(initialText)

  // Maintain current text ref to evaluate functional updates safely without triggering extra renders
  const currentTextRef = useRef<string>(initialText)

  // Use refs to store the history and pointer to avoid triggering re-renders or recreating callbacks
  const historyRef = useRef<string[]>([initialText])
  const pointerRef = useRef<number>(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const updateStatus = useCallback(() => {
    setCanUndo(pointerRef.current > 0)
    setCanRedo(pointerRef.current < historyRef.current.length - 1)
  }, [])

  const commitToHistory = useCallback((text: string) => {
    const history = historyRef.current
    const pointer = pointerRef.current

    // If the text is identical to the current checkpoint, do nothing
    if (history[pointer] === text) {
      return
    }

    // Prune the history stack after pointer (clearing redo states)
    const prunedHistory = history.slice(0, pointer + 1)
    prunedHistory.push(text)

    // Enforce max history length
    if (prunedHistory.length > maxHistory) {
      prunedHistory.shift()
      pointerRef.current = prunedHistory.length - 1
    } else {
      pointerRef.current = prunedHistory.length - 1
    }

    historyRef.current = prunedHistory
    updateStatus()
  }, [maxHistory, updateStatus])

  const updateSpecText = useCallback((
    nextTextOrFn: string | ((prev: string) => string),
    options?: UndoRedoOptions
  ) => {
    const current = currentTextRef.current
    const nextText = typeof nextTextOrFn === "function" ? nextTextOrFn(current) : nextTextOrFn

    // 1. Always update the current visual spec text immediately
    currentTextRef.current = nextText
    setSpecTextState(nextText)

    // Clear any active debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (options?.immediate) {
      // Commit immediately
      commitToHistory(nextText)
    } else {
      // Prune history stack after pointer immediately on typing to clear redo states visually and disable Redo button
      if (pointerRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, pointerRef.current + 1)
        updateStatus()
      }

      // Debounce the commit to history (800ms)
      debounceTimerRef.current = setTimeout(() => {
        commitToHistory(nextText)
        debounceTimerRef.current = null
      }, 800)
    }
  }, [commitToHistory, updateStatus])

  const undo = useCallback(() => {
    // If there is a pending debounce timer, commit its text before performing undo
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      commitToHistory(currentTextRef.current)
    }

    if (pointerRef.current > 0) {
      pointerRef.current -= 1
      const previousText = historyRef.current[pointerRef.current]
      currentTextRef.current = previousText
      setSpecTextState(previousText)
      updateStatus()
    }
  }, [commitToHistory, updateStatus])

  const redo = useCallback(() => {
    // If there is a pending debounce timer, clear it (redo overrides active typing)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (pointerRef.current < historyRef.current.length - 1) {
      pointerRef.current += 1
      const nextText = historyRef.current[pointerRef.current]
      currentTextRef.current = nextText
      setSpecTextState(nextText)
      updateStatus()
    }
  }, [updateStatus])

  // A helper to reset the history stack (useful if a new spec is loaded from database)
  const resetHistory = useCallback((text: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    historyRef.current = [text]
    pointerRef.current = 0
    currentTextRef.current = text
    setSpecTextState(text)
    updateStatus()
  }, [updateStatus])

  return {
    specText,
    updateSpecText,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  }
}
