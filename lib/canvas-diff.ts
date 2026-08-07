import { CanvasChange } from "./reconciler"

/**
 * Pure scene-diff for the Excalidraw canvas.
 *
 * Excalidraw's `onChange` fires for *every* scene mutation, including the ones
 * we caused ourselves by pushing `compileSpecToExcalidrawElements` output into
 * the scene. Telling a genuine user gesture apart from an echo of our own
 * compile is the entire job of this module: getting it wrong once wrote ghost
 * components into the user's YAML while they were typing (see the guard
 * comments on `compiledIds` / `compiledTexts` below).
 *
 * The module is React-free and side-effect-free: callers hold a
 * `CanvasDiffState` and swap it for the `nextState` returned here.
 */

export interface PendingRename {
  id: string
  name: string
  type?: string
}

export interface CanvasDiffState {
  /** Rect/arrow/label ids we have already reported as deleted. */
  deletedIds: Set<string>
  /** Rect ids we have already reported as user-drawn additions. */
  addedIds: Set<string>
  /** Arrow ids we have already reported as user-drawn connections. */
  connectedArrows: Set<string>
  /**
   * Every id the spec compiler has ever produced this session. While the user
   * types, a stale rect from a transient parse (e.g. "- id: a") can linger in
   * the scene after the compile set moved on; without this guard the add-sync
   * below mistakes it for a user-drawn shape and writes a ghost component
   * scaffold back into the YAML. User-drawn shapes get random Excalidraw ids,
   * which never collide with compiled ids.
   */
  compiledIds: Set<string>
  /**
   * Same idea for label texts: every text the compiler has ever emitted per
   * element id. A scene text that matches one of these is a stale echo of an
   * earlier compile (e.g. a ⚠️ marker or [type] tag that changed while the
   * user was typing in the editor), not a rename made on the canvas.
   */
  compiledTexts: Map<string, Set<string>>
  /** Rename already emitted but not yet visible in `parsedSpec`. */
  pendingRename: PendingRename | null
}

export interface DiffSceneInput {
  /** The scene as Excalidraw reports it. */
  updatedElements: any[]
  /** The last `compileSpecToExcalidrawElements` output pushed into the scene. */
  compiledElements: any[]
  /** Excalidraw `appState` from the same `onChange` call. */
  appState?: any
  parsedSpec?: any
  state: CanvasDiffState
}

export interface DiffSceneResult {
  /** Changes to forward to the reconciler, in emit order. */
  changes: CanvasChange[]
  /** Moved rectangles awaiting the caller's debounce, or null. */
  pendingElements: any[] | null
  nextState: CanvasDiffState
}

export function createCanvasDiffState(): CanvasDiffState {
  return {
    deletedIds: new Set(),
    addedIds: new Set(),
    connectedArrows: new Set(),
    compiledIds: new Set(),
    compiledTexts: new Map(),
    pendingRename: null,
  }
}

/** Copy-on-write set insert: returns the same set when nothing changes. */
function withId(set: Set<string>, id: string): Set<string> {
  if (set.has(id)) return set
  const next = new Set(set)
  next.add(id)
  return next
}

/**
 * Record everything the compiler just drew, so later scene echoes of these ids
 * and texts are never mistaken for user edits.
 */
export function registerCompiledElements(state: CanvasDiffState, elements: any[]): CanvasDiffState {
  let compiledIds = state.compiledIds
  let compiledTexts = state.compiledTexts
  let changed = false

  elements.forEach((el: any) => {
    if (!compiledIds.has(el.id)) {
      if (!changed) {
        compiledIds = new Set(compiledIds)
        compiledTexts = new Map(compiledTexts)
        changed = true
      }
      compiledIds.add(el.id)
    }
    if (el.type === "text" && typeof el.text === "string") {
      const existing = compiledTexts.get(el.id)
      if (!existing || !existing.has(el.text)) {
        if (!changed) {
          compiledIds = new Set(compiledIds)
          compiledTexts = new Map(compiledTexts)
          changed = true
        }
        const texts = new Set(compiledTexts.get(el.id) || [])
        texts.add(el.text)
        compiledTexts.set(el.id, texts)
      }
    }
  })

  if (!changed) return state
  return { ...state, compiledIds, compiledTexts }
}

/** Drop tracking entries for ids that are no longer in the compiled scene. */
export function pruneTracking(state: CanvasDiffState, elements: any[]): CanvasDiffState {
  const currentIds = new Set(elements.map((el: any) => el.id))
  let changed = false

  const prune = (set: Set<string>): Set<string> => {
    const kept = new Set<string>()
    set.forEach((id) => {
      if (currentIds.has(id)) kept.add(id)
    })
    if (kept.size === set.size) return set
    changed = true
    return kept
  }

  const deletedIds = prune(state.deletedIds)
  const addedIds = prune(state.addedIds)
  const connectedArrows = prune(state.connectedArrows)

  if (!changed) return state
  return { ...state, deletedIds, addedIds, connectedArrows }
}

/** Clear a pending rename once `parsedSpec` reflects it. */
export function resolvePendingRename(state: CanvasDiffState, parsedSpec: any): CanvasDiffState {
  if (!state.pendingRename) return state
  const { id, name, type } = state.pendingRename
  const comp = parsedSpec?.system?.components?.find((c: any) => c.id === id)
  if (comp && comp.name === name && (!type || comp.type === type)) {
    return { ...state, pendingRename: null }
  }
  return state
}

/**
 * Strip the exact ❌ or ⚠️ suffixes including preceding space to prevent
 * self-polluting UI-state serialization loops.
 */
export function stripDiagnosticMarkers(text: string): string {
  return text.replace(/ ❌$/, "").replace(/ ⚠️$/, "").trim()
}

export function getSourceAndTargetFromLabelId(labelId: string, parsedSpec: any): { source: string; target: string } {
  const compIds = parsedSpec?.system?.components?.map((c: any) => c.id) || []
  const sortedCompIds = [...compIds].sort((a, b) => b.length - a.length)
  for (const compId of sortedCompIds) {
    if (labelId.startsWith(`arrow-label-${compId}-`)) {
      return {
        source: compId,
        target: labelId.substring(`arrow-label-${compId}-`.length),
      }
    }
  }
  return { source: "", target: "" }
}

export function getSourceAndTargetFromArrowId(arrowId: string, parsedSpec: any): { source: string; target: string } {
  const compIds = parsedSpec?.system?.components?.map((c: any) => c.id) || []
  const sortedCompIds = [...compIds].sort((a, b) => b.length - a.length)
  for (const compId of sortedCompIds) {
    if (arrowId.startsWith(`arrow-${compId}-`)) {
      return {
        source: compId,
        target: arrowId.substring(`arrow-${compId}-`.length),
      }
    }
  }
  return { source: "", target: "" }
}

export function diffScene(input: DiffSceneInput): DiffSceneResult {
  const { updatedElements, compiledElements, appState, parsedSpec, state } = input

  let deletedIds = state.deletedIds
  let addedIds = state.addedIds
  let connectedArrows = state.connectedArrows
  let pendingRename = state.pendingRename

  const changes: CanvasChange[] = []
  let pendingElements: any[] | null = null

  const finish = (): DiffSceneResult => {
    const unchanged =
      deletedIds === state.deletedIds &&
      addedIds === state.addedIds &&
      connectedArrows === state.connectedArrows &&
      pendingRename === state.pendingRename
    return {
      changes,
      pendingElements,
      nextState: unchanged ? state : { ...state, deletedIds, addedIds, connectedArrows, pendingRename },
    }
  }

  const hasScene = !!updatedElements && updatedElements.length > 0

  // Optimization: single-pass element set lookup
  const currentElementIds = new Set(compiledElements.map((el: any) => el.id))

  // Avoid interrupting active drawing/resizing/editing gestures
  const isUserInteracting =
    !!appState?.draggingElement ||
    !!appState?.resizingElement ||
    !!appState?.editingElement

  // 2. Sync deletions back to editor spec
  if (hasScene) {
    const newlyDeletedRects = updatedElements.filter(
      (el: any) =>
        el.type === "rectangle" &&
        el.isDeleted &&
        !deletedIds.has(el.id) &&
        compiledElements.some((old: any) => old.id === el.id && !old.isDeleted)
    )
    if (newlyDeletedRects.length > 0) {
      const idsToDelete = newlyDeletedRects.map((r: any) => r.id)
      idsToDelete.forEach((id: string) => {
        deletedIds = withId(deletedIds, id)
      })
      changes.push({ type: "delete", payload: { ids: idsToDelete } })
      return finish()
    }

    const newlyDeletedArrows = updatedElements.filter(
      (el: any) =>
        el.type === "arrow" &&
        el.isDeleted &&
        !deletedIds.has(el.id) &&
        compiledElements.some((old: any) => old.id === el.id && !old.isDeleted)
    )
    if (newlyDeletedArrows.length > 0) {
      const arrow = newlyDeletedArrows[0]
      deletedIds = withId(deletedIds, arrow.id)

      let { source, target } = getSourceAndTargetFromArrowId(arrow.id, parsedSpec)
      if (!source || !target) {
        source = arrow.startBinding?.elementId
        target = arrow.endBinding?.elementId
      }

      if (source && target) {
        changes.push({ type: "disconnect", payload: { source, target } })
        return finish()
      }
    }

    const newlyDeletedLabels = updatedElements.filter(
      (el: any) =>
        el.type === "text" &&
        el.id.startsWith("arrow-label-") &&
        el.isDeleted &&
        !deletedIds.has(el.id) &&
        compiledElements.some((old: any) => old.id === el.id && !old.isDeleted)
    )
    if (newlyDeletedLabels.length > 0) {
      const labelEl = newlyDeletedLabels[0]
      deletedIds = withId(deletedIds, labelEl.id)

      const { source, target } = getSourceAndTargetFromLabelId(labelEl.id, parsedSpec)
      if (source && target) {
        changes.push({ type: "connection-label", payload: { source, target, label: "" } })
        return finish()
      }
    }
  }

  // If the user is actively drawing/dragging/resizing, do not sync additions/connections mid-gesture
  if (isUserInteracting) return finish()

  // 2b. Sync node additions back to editor spec
  if (hasScene) {
    const newlyCreatedRects = updatedElements.filter(
      (el: any) =>
        el.type === "rectangle" &&
        !el.isDeleted &&
        !addedIds.has(el.id) &&
        !currentElementIds.has(el.id) &&
        !state.compiledIds.has(el.id)
    )
    if (newlyCreatedRects.length > 0) {
      const rect = newlyCreatedRects[0] // process one at a time for stability
      addedIds = withId(addedIds, rect.id)
      changes.push({
        type: "add",
        payload: {
          id: rect.id,
          x: rect.x,
          y: rect.y,
          type: "Stage",
          name: `New Component ${rect.id.slice(0, 4)}`,
        },
      })
      return finish()
    }
  }

  // 2c. Sync connection/arrow creations back to editor spec
  if (hasScene) {
    const newlyCreatedArrows = updatedElements.filter(
      (el: any) =>
        el.type === "arrow" &&
        !el.isDeleted &&
        el.startBinding?.elementId &&
        el.endBinding?.elementId &&
        !connectedArrows.has(el.id) &&
        !currentElementIds.has(el.id) &&
        !state.compiledIds.has(el.id)
    )
    if (newlyCreatedArrows.length > 0) {
      const arrow = newlyCreatedArrows[0]
      const source = arrow.startBinding.elementId
      const target = arrow.endBinding.elementId
      const sourceExists = parsedSpec?.system?.components?.some((c: any) => c.id === source)
      const targetExists = parsedSpec?.system?.components?.some((c: any) => c.id === target)

      if (sourceExists && targetExists) {
        connectedArrows = withId(connectedArrows, arrow.id)
        changes.push({ type: "connect", payload: { source, target } })
        return finish()
      }
    }
  }

  // 3. Sync renames back to editor spec
  if (hasScene) {
    const changedTextElement = updatedElements.find((el: any) => {
      if (el.type !== "text" || !el.containerId || el.isDeleted) return false
      const oldEl = compiledElements.find((old: any) => old.id === el.id)
      if (!oldEl || oldEl.text === el.text) return false
      // Stale echo of an earlier compile, not a rename made on canvas
      if (state.compiledTexts.get(el.id)?.has(el.text)) return false
      return true
    })
    if (changedTextElement) {
      const isEditingThisElement = appState?.editingElement && appState.editingElement.id === changedTextElement.id
      if (!isEditingThisElement) {
        if (changedTextElement.id.startsWith("arrow-label-")) {
          const { source, target } = getSourceAndTargetFromLabelId(changedTextElement.id, parsedSpec)

          if (source && target) {
            // Loop Guard: verify that label has actually changed compared to state in parsedSpec
            const comp = parsedSpec?.system?.components?.find((c: any) => c.id === source)
            const conn = comp?.connections?.find((conn: any) => {
              if (typeof conn === 'string') return conn === target
              return conn && typeof conn === 'object' && conn.target === target
            })
            const currentLabel = typeof conn === 'string' ? "" : (conn?.label || "")
            const newLabel = changedTextElement.text.trim()

            if (String(currentLabel) !== newLabel) {
              changes.push({ type: "connection-label", payload: { source, target, label: newLabel } })
            }
          }
          return finish()
        }

        const lines = changedTextElement.text.split("\n")
        const firstLineRaw = lines[0] ? lines[0].trim() : ""
        const firstLine = stripDiagnosticMarkers(firstLineRaw)
        let newType: string | undefined = undefined

        if (lines[1]) {
          const match = lines[1].trim().match(/^\[(.*)\]$/)
          if (match && match[1]) {
            newType = match[1].trim()
          }
        }

        // Guard: Check if actually different from parsedSpec to avoid loops/redundant sets
        const comp = parsedSpec?.system?.components?.find((c: any) => c.id === changedTextElement.containerId)
        if (comp) {
          const currentName = comp.name || comp.id
          const currentType = comp.type || "Unit"
          const nameChanged = currentName !== firstLine
          const typeChanged = newType !== undefined && currentType !== newType

          if (nameChanged || typeChanged) {
            if (
              pendingRename &&
              pendingRename.id === changedTextElement.containerId &&
              pendingRename.name === firstLine &&
              pendingRename.type === newType
            ) {
              return finish()
            }

            pendingRename = {
              id: changedTextElement.containerId,
              name: firstLine,
              type: newType,
            }

            changes.push({
              type: "rename",
              payload: {
                id: changedTextElement.containerId,
                newName: firstLine,
                newType,
              },
            })
          }
        }
      }
    }
  }

  // 4. Sync coordinate changes back to editor spec
  if (hasScene) {
    const rects = updatedElements.filter((el: any) => el.type === 'rectangle' && !el.isDeleted)
    if (rects.length > 0) {
      const hasChanged = rects.some((r: any) => {
        const current = compiledElements.find((el: any) => el.id === r.id)
        return current && (Math.round(current.x) !== Math.round(r.x) || Math.round(current.y) !== Math.round(r.y))
      })
      if (hasChanged) {
        pendingElements = rects
      }
    }
  }

  return finish()
}
