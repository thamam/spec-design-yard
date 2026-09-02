"use client"

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {
  CodeIcon,
  FocusIcon,
  NetworkIcon,
  CopyIcon,
  WrapTextIcon,
  SearchIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileJsonIcon,
  FolderIcon,
  BarChart2Icon,
  Shield,
} from "lucide-react"
import yaml from "yaml"
import { lintSpec, droppedConnectionDiagnostics, type Diagnostic } from "../../lib/linter"
import { reconcileSpec, type FixType } from "../../lib/reconciler"
import { getAutocompleteSuggestions, detectIndentContext } from "../../lib/autocomplete"
import { applyIndent } from "../../lib/editor-indent"
import { YamlHighlightOverlay } from "./yaml-highlight-overlay"
import { isFixable, fixTypeForCode, FIXABLE_DIAGNOSTIC_CODES } from "../../lib/quick-fixes"
import { normalizeConnections, parseSpec, type DroppedConnection } from "../../lib/spec-model"
import { generateArchitectureAuditReport, architectureAuditReportFilename } from "../../lib/export-report"
import { triggerDownload } from "./download"
import { MetricsTab } from "./metrics-tab"

interface EditorPanelProps {
  specText?: string
  setSpecText?: (val: string | ((prev: string) => string), options?: { isTyping?: boolean; immediate?: boolean }) => void
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  pathSource?: string
  setPathSource?: (val: string) => void
  pathTarget?: string
  setPathTarget?: (val: string) => void
  activeTab?: TabId
  setActiveTab?: (tab: TabId) => void
  /** False while the workspace is hydrating; the editor refuses input until then. */
  isHydrated?: boolean
}

// The pane measurement has to happen before paint, but this page is
// server-rendered and useLayoutEffect warns there — so fall back to useEffect
// on the server, where there is no layout to measure anyway.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/* ── Code Tab ── */
interface CodeTabProps {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

function CodeTab({ value, onChange, disabled = false }: CodeTabProps) {
  const [cursorPos, setCursorPos] = useState<number | null>(null)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [suppressAutocomplete, setSuppressAutocomplete] = useState(false)
  const [hasNavigated, setHasNavigated] = useState(false)
  const [releaseFocusOnTab, setReleaseFocusOnTab] = useState(false)
  // The Esc escape is armed for the NEXT Tab only, and any intervening edit
  // disarms it — including one the user did not type: Auto-Fix All, a canvas
  // drag, a quick fix. Keying on `value` covers those; the keydown and change
  // handlers cover the rest.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  // Where the caret/selection must land once the edited value has been
  // committed to the DOM. A setTimeout(0) was not good enough: in a real
  // browser React commits the new value asynchronously, so the timer fired
  // against the OLD value, its range was clamped to the old length, and the
  // commit then dropped the caret at the end — a multi-line Tab lost the
  // selection over the block it had just indented. jsdom's fake timers hid it;
  // scripts/e2e-editor-ergonomics.py asserts the real selection bounds.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  /**
   * Hand the edited text to the parent and say where the selection must end
   * up once that edit commits.
   *
   * When the text is UNCHANGED there is nothing for React to commit, so the
   * layout effect never runs and an armed ref would stay armed until some
   * later, unrelated commit fired it — stealing focus back into the textarea
   * and re-selecting a block the user had moved on from. So a no-op applies
   * the range synchronously and arms nothing.
   */
  const commitWithSelection = (
    nextValue: string,
    selection: { start: number; end: number },
    target: HTMLTextAreaElement | null
  ) => {
    if (nextValue === value) {
      // Nothing to commit, so nothing will ever consume a pending range —
      // apply it now, or it would sit armed until an unrelated edit fired it.
      target?.setSelectionRange(selection.start, selection.end)
      setCursorPos(selection.start)
      return
    }
    // Arm BEFORE onChange: the commit onChange triggers is the one the layout
    // effect must see the ref on.
    pendingSelectionRef.current = selection
    onChange(nextValue)
  }

  const didMountRef = useRef(false)
  useEffect(() => {
    // Not on the first render: mounting is not an edit.
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    setReleaseFocusOnTab(false)
  }, [value])

  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const overlay = overlayRef.current
    if (overlay) {
      overlay.scrollTop = e.currentTarget.scrollTop
      overlay.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  // No dependency list: this must run after EVERY commit, because the commit
  // that carries the new value is the one that moved the caret.
  useIsomorphicLayoutEffect(() => {
    const pending = pendingSelectionRef.current
    if (!pending) return
    pendingSelectionRef.current = null
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(pending.start, pending.end)
    setCursorPos(pending.start)
  })

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value
    onChange(nextVal)
    setCursorPos(e.target.selectionStart)
    setSuppressAutocomplete(false)
    setReleaseFocusOnTab(false)
  }

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart)
  }

  const autocomplete = useMemo(() => {
    if (cursorPos === null || suppressAutocomplete) return null
    const res = getAutocompleteSuggestions(value, cursorPos)
    if (res.suggestions.length > 0) return res
    return null
  }, [value, cursorPos, suppressAutocomplete])

  const suggestionsKey = autocomplete?.suggestions.join(',') || ""
  useEffect(() => {
    setActiveSuggestionIndex(0)
    setHasNavigated(false)
  }, [suggestionsKey])

  const safeActiveIndex = autocomplete && activeSuggestionIndex < autocomplete.suggestions.length
    ? activeSuggestionIndex
    : 0

  const handleApplySuggestion = (sug: string) => {
    if (!autocomplete) return
    const [start, end] = autocomplete.replaceRange
    const newValue = value.substring(0, start) + sug + value.substring(end)
    const newCursorPos = start + sug.length
    // Commit regardless of the ref; only the caret restore needs the element.
    // Returning early here would have dropped the whole edit if the ref were
    // ever null — currently unreachable, but the wrong thing to lose.
    commitWithSelection(newValue, { start: newCursorPos, end: newCursorPos }, textareaRef.current)
  }

  const handleIndent = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    const { text, selStart, selEnd } = applyIndent(value, target.selectionStart, target.selectionEnd, {
      outdent: e.shiftKey,
    })
    commitWithSelection(text, { start: selStart, end: selEnd }, target)
  }

  const handleEnterIndent = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    // upToCursor: the text after the caret is about to move to the new line,
    // so only the half being left behind can decide the block.
    const { indentLevel, opensBlock } = detectIndentContext(value, target.selectionStart, {
      upToCursor: true,
    })
    const newIndent = " ".repeat(indentLevel + (opensBlock ? 2 : 0))
    // Spec text is LF-only by the time it reaches state (spec-model's
    // normalizeLineEndings at the load seam), so the textarea's offsets index
    // exactly this string and a bare LF is the right break.
    const insertion = "\n" + newIndent
    const newValue = value.slice(0, target.selectionStart) + insertion + value.slice(target.selectionEnd)
    const newCursorPos = target.selectionStart + insertion.length
    commitWithSelection(newValue, { start: newCursorPos, end: newCursorPos }, target)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME owns its own Enter and Tab: they commit or cycle a composition
    // candidate. Intercepting them throws the composition away and inserts an
    // indented newline instead. keyCode 229 is the legacy signal browsers
    // still send for a composing key.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    // WCAG 2.1.2 keyboard-trap escape hatch: Esc arms a one-shot release so
    // the very next Tab moves focus out via the browser default, regardless
    // of whether the suggestion popup was open.
    if (e.key === "Escape") {
      e.preventDefault()
      setSuppressAutocomplete(true)
      setReleaseFocusOnTab(true)
      return
    }

    if (releaseFocusOnTab) {
      setReleaseFocusOnTab(false)
      if (e.key === "Tab") {
        return
      }
    }

    // Indent gestures outrank the suggestion popup. A Tab over a selection
    // that spans lines, and every Shift+Tab, can only mean indent/outdent —
    // the popup used to claim both and splice its suggestion at the selection
    // start instead. A collapsed caret with the popup open still accepts.
    if (e.key === "Tab") {
      const target = e.currentTarget
      const spansLines =
        target.selectionStart !== target.selectionEnd &&
        target.value.slice(target.selectionStart, target.selectionEnd).includes("\n")
      if (e.shiftKey || spansLines) {
        handleIndent(e)
        return
      }
    }

    if (autocomplete && autocomplete.suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveSuggestionIndex((prev) => (prev + 1) % autocomplete.suggestions.length)
        setHasNavigated(true)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveSuggestionIndex((prev) => (prev - 1 + autocomplete.suggestions.length) % autocomplete.suggestions.length)
        setHasNavigated(true)
      } else if (e.key === "Tab") {
        e.preventDefault()
        const selectedSug = autocomplete.suggestions[safeActiveIndex]
        if (selectedSug) {
          handleApplySuggestion(selectedSug)
        }
      } else if (e.key === "Enter") {
        if (hasNavigated) {
          e.preventDefault()
          const selectedSug = autocomplete.suggestions[safeActiveIndex]
          if (selectedSug) {
            handleApplySuggestion(selectedSug)
          }
        } else {
          handleEnterIndent(e)
        }
      }
    } else if (e.key === "Tab") {
      handleIndent(e)
    } else if (e.key === "Enter") {
      handleEnterIndent(e)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden font-mono text-[13px] leading-relaxed relative bg-zinc-950/80">
      <YamlHighlightOverlay ref={overlayRef} value={value} />
      <textarea
        ref={textareaRef}
        data-testid="spec-textarea"
        data-focus-field="spec-textarea"
        id="spec-textarea"
        value={value}
        onChange={handleTextareaChange}
        onSelect={handleTextareaSelect}
        onKeyDown={handleKeyDown}
        onScroll={handleTextareaScroll}
        disabled={disabled}
        // scrollbar-gutter:stable must match the overlay's (yaml-highlight-overlay.tsx)
        // so both layers agree on content width when a scrollbar appears.
        className={`w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 p-5 text-transparent caret-zinc-300 font-mono resize-none leading-6 overflow-y-auto [scrollbar-gutter:stable]${disabled ? " opacity-40 cursor-wait" : ""}`}
        spellCheck="false"
      />

      {autocomplete && autocomplete.suggestions.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 bg-zinc-900 border border-indigo-500/30 rounded-lg p-2.5 flex items-center justify-between gap-3 shadow-lg z-20">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-[80%] scrollbar-none">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-sans pr-1">
              Suggesting {autocomplete.type === "id" ? "IDs" : autocomplete.type === "field" || autocomplete.type === "metadata-key" || autocomplete.type === "connection-key" ? "Keys" : "Values"}:
            </span>
            {autocomplete.suggestions.map((sug, idx) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleApplySuggestion(sug)}
                className={`px-2 py-0.5 text-xs font-mono rounded border active:scale-95 transition-all whitespace-nowrap ${
                  idx === safeActiveIndex
                    ? "bg-indigo-500 text-white border-indigo-400 shadow-md ring-1 ring-indigo-400"
                    : "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/20"
                }`}
              >
                {sug}
              </button>
            ))}
          </div>
          <span className="text-[9px] text-zinc-500 font-sans italic shrink-0 pr-1">
            Arrow keys to select, Tab/Enter to apply
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Tree Tab ── */
interface TreeTabProps {
  parsedSpec: any
  selectedUnit: string | null
  setSelectedUnit: (val: string | null) => void
}

function TreeTab({ parsedSpec, selectedUnit, setSelectedUnit }: TreeTabProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    system: true,
    components: true,
  })

  const [treeSearch, setTreeSearch] = useState("")
  const [treeType, setTreeType] = useState("all")

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  const components = useMemo(() => {
    return Array.isArray(parsedSpec?.system?.components) ? parsedSpec.system.components : []
  }, [parsedSpec])

  const filteredComponents = useMemo(() => {
    const query = treeSearch.toLowerCase().trim()
    const filterType = treeType.toLowerCase()

    return components.filter((comp: any) => {
      if (!comp || typeof comp !== "object") return false
      
      const id = String(comp.id || "").toLowerCase()
      const name = String(comp.name || "").toLowerCase()
      const type = String(comp.type || "").toLowerCase()
      
      const matchesSearch = 
        id.includes(query) || 
        name.includes(query) || 
        type.includes(query)
        
      const matchesType = 
        filterType === "all" || 
        type === filterType
        
      return matchesSearch && matchesType
    })
  }, [components, treeSearch, treeType])

  if (!parsedSpec?.system) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 text-xs min-h-[250px]">
        <NetworkIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
        <p>Awaiting valid YAML input to render tree structure...</p>
      </div>
    )
  }

  const isFiltered = treeSearch.trim() !== "" || treeType !== "all"

  return (
    <div className="flex-1 overflow-auto py-3 px-4 text-sm select-none flex flex-col h-full" data-testid="tree-tab-container">
      <div className="mb-2 shrink-0">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">System Directory Structure</span>
      </div>

      {/* Interactive Controls */}
      <div className="mb-3 shrink-0 flex flex-col gap-2 p-2.5 rounded-lg border border-zinc-900 bg-zinc-950/40">
        <div className="relative flex items-center">
          <span className="absolute left-2 text-zinc-500 pointer-events-none">
            <SearchIcon size={12} />
          </span>
          <input
            type="text"
            data-testid="tree-search-input"
            placeholder="Search directory..."
            aria-label="Search components by ID or name"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 pl-7 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {treeSearch && (
            <button
              type="button"
              onClick={() => setTreeSearch("")}
              aria-label="Clear search"
              className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tree-type-filter" className="text-[10px] text-zinc-500 font-bold uppercase">Filter by Type</label>
          <select
            id="tree-type-filter"
            data-testid="tree-type-select"
            aria-label="Filter by Type"
            value={treeType}
            onChange={(e) => setTreeType(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="gateway">Gateways</option>
            <option value="stage">Stages</option>
            <option value="brick">Bricks</option>
            <option value="store">Stores</option>
          </select>
        </div>

        {isFiltered && (
          <div
            data-testid="tree-match-stats"
            className="text-[10px] font-mono text-indigo-400 mt-1 bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-950/40 text-center"
          >
            Matched: {filteredComponents.length} of {components.length}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        <div className="flex items-center gap-1.5 text-zinc-200 cursor-pointer" onClick={() => toggleNode("system")}>
          {expandedNodes.system ? <ChevronDownIcon size={14} className="text-zinc-500" /> : <ChevronRightIcon size={14} className="text-zinc-500" />}
          <FolderIcon size={14} className="text-indigo-400" />
          <span className="font-semibold">{parsedSpec.system.name || "System Root"}</span>
        </div>

        {expandedNodes.system && (
          <div className="pl-4 space-y-2 border-l border-zinc-900 ml-1.5">
            <div className="flex items-center gap-1.5 text-zinc-300 cursor-pointer" onClick={() => toggleNode("components")}>
              {expandedNodes.components ? <ChevronDownIcon size={14} className="text-zinc-500" /> : <ChevronRightIcon size={14} className="text-zinc-500" />}
              <span className="text-emerald-400">❖</span>
              <span className="font-medium text-zinc-400">components</span>
            </div>

            {expandedNodes.components && (
              <div className="pl-4 space-y-2 border-l border-zinc-900 ml-1.5">
                {components.length === 0 ? (
                  <div className="text-zinc-500 text-xs py-4 text-center font-mono border border-dashed border-zinc-900 rounded bg-zinc-950/10">
                    No components in system
                  </div>
                ) : filteredComponents.length === 0 ? (
                  <div className="text-zinc-500 text-xs py-4 text-center font-mono border border-dashed border-zinc-900 rounded bg-zinc-950/10">
                    No components match search criteria
                  </div>
                ) : (
                  filteredComponents.map((comp: any, compIdx: number) => {
                    const isExpanded = !!expandedNodes[comp.id]
                    const compKey = comp.id ? `${comp.id}-${compIdx}` : `unnamed-${compIdx}`
                    return (
                      <div key={compKey} className="space-y-1.5">
                        <div
                          data-component-id={comp.id}
                          onClick={() => {
                            if (comp.id) {
                              toggleNode(comp.id)
                              setSelectedUnit(comp.id)
                            }
                          }}
                          className={`flex items-center justify-between py-1 px-2.5 rounded border transition-all cursor-pointer ${
                            selectedUnit === comp.id
                              ? "bg-indigo-500/10 border-indigo-500 text-indigo-200"
                              : "bg-zinc-900/50 border-zinc-900 hover:border-zinc-800 text-zinc-300"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-indigo-400">📄</span>
                            <span className="font-mono text-xs">{comp.id || "unnamed"}</span>
                          </span>
                          <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded uppercase">
                            {comp.type || "unknown"}
                          </span>
                        </div>

                        {isExpanded && comp.id && (
                          <div className="pl-4 py-1.5 text-[11px] text-zinc-400 font-mono space-y-1 bg-zinc-900/20 rounded-md p-2 border border-zinc-900">
                            <div>
                              <span className="text-zinc-500">name:</span> {comp.name || comp.id}
                            </div>
                            {Array.isArray(comp.connections) && comp.connections.length > 0 && (
                              <div>
                                <span className="text-zinc-500">connections:</span>
                                {comp.connections.map((conn: any, idx: number) => {
                                  if (!conn || typeof conn !== "object") return null
                                  return (
                                    <div key={idx} className="pl-3 text-emerald-400/80">
                                      → {conn.target || "unknown"}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Focus Tab ── */
interface FocusTabProps {
  specText: string
  setSpecText: (val: string | ((prev: string) => string), options?: { isTyping?: boolean; immediate?: boolean }) => void
  parsedSpec: any
  selectedUnit: string | null
  setSelectedUnit: (val: string | null) => void
  diagnostics?: Diagnostic[]
  onQuickFix?: (path: string, fixType: string, extraData?: any) => void
}

function getConnectionBadgeLabel(d: Diagnostic): string {
  if (d.code === "orphan-connection") return "Target Missing"
  if (d.code === "gateway-to-store") return "Gateway to Store"
  if (d.code === "store-to-store") return "Store to Store"
  if (d.code === "stage-brick-to-gateway") return "Stage/Brick to Gateway"
  if (d.code === "brick-to-brick") return "Brick to Brick"
  if (d.code === "gateway-to-gateway") return "Gateway to Gateway"
  if (d.code === "self-connection") return "Self Connection"
  if (d.code === "duplicate-connection") return "Duplicate Connection"
  if (d.code === "connection-case-mismatch") return "Case Mismatch"
  return d.message
}

function FocusTab({
  specText,
  setSpecText,
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  diagnostics = [],
  onQuickFix,
}: FocusTabProps) {
  const getSelectedUnitSpec = () => {
    if (!selectedUnit || !parsedSpec) return "Select a component on the diagram to inspect its isolated spec."
    try {
      const component = parsedSpec?.system?.components?.find((c: any) => c.id === selectedUnit)
      if (component) {
        return yaml.stringify({ component })
      }
      return `No component found with ID: ${selectedUnit}`
    } catch (e) {
      return "Error extracting focused spec."
    }
  }

  const comp = parsedSpec?.system?.components?.find((c: any) => c.id === selectedUnit)

  const compIdx = useMemo(() => {
    if (!parsedSpec?.system?.components || !selectedUnit) return -1
    return parsedSpec.system.components.findIndex((c: any) => c && c.id === selectedUnit)
  }, [parsedSpec, selectedUnit])

  const compDiagnostics = useMemo(() => {
    if (compIdx === -1 || !diagnostics) return []
    return diagnostics.filter(d => {
      const path = d.path
      if (!path) return false
      return path === `system.components[${compIdx}]` || path.startsWith(`system.components[${compIdx}].`)
    })
  }, [diagnostics, compIdx])

  const handleApplySingleFix = (d: Diagnostic) => {
    if (!onQuickFix || !d.path || !d.code) return
    const fixType = fixTypeForCode(d.code) ?? d.code
    const extraData: any = d.code === "unrecognized-type" ? { type: "Stage" } : undefined

    onQuickFix(d.path, fixType, extraData)
  }

  // Global system settings state
  const [globalFormState, setGlobalFormState] = useState<Record<string, string>>({
    systemName: "",
    systemVersion: "",
    systemStatus: "draft",
    systemOwner: "",
    systemDescription: "",
  })

  const globalDebounceTimersRef = useRef<Record<string, NodeJS.Timeout>>(Object.create(null))

  // Synchronize global settings state with parsed spec (for un-focused elements)
  useEffect(() => {
    if (!selectedUnit && parsedSpec?.system) {
      const sys = parsedSpec.system
      const sysMeta = sys.metadata || {}
      setGlobalFormState(prev => {
        const activeEl = typeof document !== "undefined" ? document.activeElement : null
        const activeFocusField = activeEl?.getAttribute("data-focus-field")

        const systemName = activeFocusField !== "focus-system-name-input" ? (sys.name || "") : prev.systemName
        const systemVersion = activeFocusField !== "focus-system-version-input" ? (sysMeta.version || "") : prev.systemVersion
        const systemStatus = activeFocusField !== "focus-system-status-select" ? (sysMeta.status || "draft") : prev.systemStatus
        const systemOwner = activeFocusField !== "focus-system-owner-input" ? (sysMeta.owner || "") : prev.systemOwner
        const systemDescription = activeFocusField !== "focus-system-description-textarea" ? (sysMeta.description || "") : prev.systemDescription

        if (
          systemName === prev.systemName &&
          systemVersion === prev.systemVersion &&
          systemStatus === prev.systemStatus &&
          systemOwner === prev.systemOwner &&
          systemDescription === prev.systemDescription
        ) {
          return prev
        }

        return { systemName, systemVersion, systemStatus, systemOwner, systemDescription }
      })
    }
  }, [parsedSpec, selectedUnit])

  const handleGlobalFieldChange = (
    field: "systemName" | "systemVersion" | "systemStatus" | "systemOwner" | "systemDescription",
    path: string,
    value: string
  ) => {
    // 1. Instantly update local state so character insertion is buttery-smooth (60fps)
    setGlobalFormState(prev => ({
      ...prev,
      [field]: value
    }))

    // 2. Debounce parent AST/YAML updates (200ms) per field
    if (globalDebounceTimersRef.current[field]) {
      clearTimeout(globalDebounceTimersRef.current[field])
    }

    globalDebounceTimersRef.current[field] = setTimeout(() => {
      setSpecText(prev => {
        return reconcileSpec(prev, {
          type: "update-property",
          payload: { id: "system", path, value }
        })
      })
    }, 200)
  }

  // 1. Local state for form fields to guarantee zero-lag typing
  const [formState, setFormState] = useState<Record<string, string>>({})
  const [prevUnit, setPrevUnit] = useState<string | null>(null)
  
  // Component ID rename states
  const [idInput, setIdInput] = useState("")
  const [idError, setIdError] = useState<string | null>(null)

  // Outgoing connection states
  const [newConnTarget, setNewConnTarget] = useState("")
  const [newConnLabel, setNewConnLabel] = useState("")
  const [localConnectionLabels, setLocalConnectionLabels] = useState<Record<string, string>>({})

  // Inbound connection states
  const [newInboundConnSource, setNewInboundConnSource] = useState("")
  const [newInboundConnLabel, setNewInboundConnLabel] = useState("")
  const [localInboundConnectionLabels, setLocalInboundConnectionLabels] = useState<Record<string, string>>({})

  // Separate connection label debounce ref
  const connectionDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inboundConnectionDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 2. Reset form state on selection change
  if (selectedUnit !== prevUnit) {
    setPrevUnit(selectedUnit)
    if (selectedUnit && comp) {
      setFormState({
        name: comp.name || "",
        type: comp.type || "Stage",
        owner: comp.metadata?.owner || "",
        status: comp.metadata?.status || "draft",
        color: comp.metadata?.color || "zinc",
        version: comp.metadata?.version || "",
        description: comp.metadata?.description || "",
        latency: comp.metadata?.latency !== undefined ? String(comp.metadata.latency) : "",
        throughput: comp.metadata?.throughput !== undefined ? String(comp.metadata.throughput) : "",
      })
      setNewConnTarget("")
      setNewConnLabel("")
      setLocalConnectionLabels({})
      setNewInboundConnSource("")
      setNewInboundConnLabel("")
      setLocalInboundConnectionLabels({})
      setIdInput(selectedUnit)
      setIdError(null)
    } else {
      setFormState({})
      setNewConnTarget("")
      setNewConnLabel("")
      setLocalConnectionLabels({})
      setNewInboundConnSource("")
      setNewInboundConnLabel("")
      setLocalInboundConnectionLabels({})
      setIdInput("")
      setIdError(null)
    }
  }

  // 3. Keep form state synchronized with external YAML updates, but only for un-focused elements to prevent cursor jumps
  useEffect(() => {
    if (selectedUnit && comp) {
      setFormState(prev => {
        const activeEl = typeof document !== "undefined" ? document.activeElement : null
        const activeFocusField = activeEl?.getAttribute("data-focus-field")

        const nextState = { ...prev }
        if (activeFocusField !== "focus-name-input") nextState.name = comp.name || ""
        if (activeFocusField !== "focus-type-select") nextState.type = comp.type || "Stage"
        if (activeFocusField !== "focus-owner-input") nextState.owner = comp.metadata?.owner || ""
        if (activeFocusField !== "focus-status-select") nextState.status = comp.metadata?.status || "draft"
        if (activeFocusField !== "focus-color-select") nextState.color = comp.metadata?.color || "zinc"
        if (activeFocusField !== "focus-version-input") nextState.version = comp.metadata?.version || ""
        if (activeFocusField !== "focus-description-textarea") nextState.description = comp.metadata?.description || ""
        if (activeFocusField !== "focus-latency-input") nextState.latency = comp.metadata?.latency !== undefined ? String(comp.metadata.latency) : ""
        if (activeFocusField !== "focus-throughput-input") nextState.throughput = comp.metadata?.throughput !== undefined ? String(comp.metadata.throughput) : ""
        return nextState
      })
    }
  }, [comp, selectedUnit])

  // Sync component ID field with external changes when not focused
  useEffect(() => {
    if (selectedUnit) {
      const activeEl = typeof document !== "undefined" ? document.activeElement : null
      const activeFocusField = activeEl?.getAttribute("data-focus-field")
      if (activeFocusField !== "focus-id-input") {
        setIdInput(selectedUnit)
      }
    }
  }, [selectedUnit])

  // Synchronize connection labels from external YAML updates dynamically
  useEffect(() => {
    if (comp) {
      const conns = Array.isArray(comp.connections) ? comp.connections : []
      const newLabels: Record<string, string> = {}
      conns.forEach((c: any) => {
        if (c && typeof c === "object" && typeof c.target === "string") {
          newLabels[c.target] = c.label || ""
        } else if (typeof c === "string") {
          newLabels[c] = ""
        }
      })

      // Query DOM properties outside state setter to maintain pure callback behavior
      const activeEl = typeof document !== "undefined" ? document.activeElement : null
      const activeFocusField = activeEl?.getAttribute("data-focus-field") || ""

      setLocalConnectionLabels(prev => {
        const next: Record<string, string> = {}
        Object.keys(newLabels).forEach(target => {
          if (activeFocusField === `focus-conn-label-input-${target}`) {
            next[target] = prev[target] ?? newLabels[target]
          } else {
            next[target] = newLabels[target]
          }
        })
        return next
      })
    }
  }, [comp])

  // Synchronize inbound connection labels from external YAML updates dynamically
  useEffect(() => {
    if (selectedUnit && parsedSpec?.system?.components) {
      const newInboundLabels: Record<string, string> = Object.create(null)
      parsedSpec.system.components.forEach((c: any) => {
        if (!c || !c.id || c.id === selectedUnit) return
        const conns = Array.isArray(c.connections) ? c.connections : []
        conns.forEach((conn: any) => {
          if (typeof conn === "string" && conn === selectedUnit) {
            newInboundLabels[c.id] = ""
          } else if (conn && typeof conn === "object" && conn.target === selectedUnit) {
            newInboundLabels[c.id] = conn.label || ""
          }
        })
      })

      const activeEl = typeof document !== "undefined" ? document.activeElement : null
      const activeFocusField = activeEl?.getAttribute("data-focus-field") || ""

      setLocalInboundConnectionLabels(prev => {
        const next: Record<string, string> = {}
        Object.keys(newInboundLabels).forEach(source => {
          if (activeFocusField === `focus-inbound-conn-label-input-${source}`) {
            next[source] = prev[source] ?? newInboundLabels[source]
          } else {
            next[source] = newInboundLabels[source] || ""
          }
        })
        return next
      })
    }
  }, [parsedSpec, selectedUnit])

  // 4. Debounce AST reconciliation / parent state updates
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>(Object.create(null))

  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(timer => {
        if (timer) clearTimeout(timer)
      })
      if (connectionDebounceTimerRef.current) {
        clearTimeout(connectionDebounceTimerRef.current)
      }
      if (inboundConnectionDebounceTimerRef.current) {
        clearTimeout(inboundConnectionDebounceTimerRef.current)
      }
      Object.values(globalDebounceTimersRef.current).forEach(timer => {
        if (timer) clearTimeout(timer)
      })
    }
  }, [selectedUnit])

  const handleFieldChange = (path: string, value: any) => {
    // Instantly update local state so character insertion is buttery-smooth (60fps)
    setFormState(prev => {
      const next = { ...prev }
      if (path === "name") next.name = value
      else if (path === "type") next.type = value
      else if (path === "metadata.owner") next.owner = value
      else if (path === "metadata.status") next.status = value
      else if (path === "metadata.color") next.color = value
      else if (path === "metadata.version") next.version = value
      else if (path === "metadata.description") next.description = value
      else if (path === "metadata.latency") next.latency = value
      else if (path === "metadata.throughput") next.throughput = value
      return next
    })

    // Debounce the heavier parent AST/Excalidraw updates (200ms) per specific path to prevent race conditions
    if (debounceTimersRef.current[path]) {
      clearTimeout(debounceTimersRef.current[path])
    }

    debounceTimersRef.current[path] = setTimeout(() => {
      if (!selectedUnit) return
      
      let reconciledValue = value
      if (path === "metadata.latency" || path === "metadata.throughput") {
        const parsed = parseInt(value, 10)
        if (!isNaN(parsed) && String(parsed) === String(value).trim()) {
          reconciledValue = parsed
        } else if (value === "") {
          reconciledValue = undefined // support removing the property entirely
        }
      }

      setSpecText(prev => {
        const updated = reconcileSpec(prev, {
          type: "update-property",
          payload: { id: selectedUnit, path, value: reconciledValue }
        })
        return updated
      })
    }, 200)
  }

  const handleIdRename = () => {
    if (!selectedUnit) return
    const cleaned = idInput.trim()
    if (cleaned === selectedUnit) {
      setIdError(null)
      return
    }
    if (cleaned === "") {
      setIdError("ID cannot be empty.")
      return
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(cleaned)) {
      setIdError("ID must be alphanumeric, hyphen, or underscore.")
      return
    }
    const idExists = parsedSpec?.system?.components?.some((c: any) => c && c.id && c.id.toLowerCase() === cleaned.toLowerCase() && c.id !== selectedUnit)
    if (idExists) {
      setIdError(`Component ID "${cleaned}" already exists.`)
      return
    }

    const updated = reconcileSpec(specText, {
      type: "rename-id",
      payload: { id: selectedUnit, newId: cleaned }
    })
    
    if (updated !== specText) {
      setSpecText(updated)
      setSelectedUnit(cleaned)
      setIdError(null)
    }
  }

  const connectionsList = useMemo(() => normalizeConnections(comp), [comp?.connections])

  const handleDisconnect = (target: string) => {
    if (!selectedUnit) return
    const updated = reconcileSpec(specText, {
      type: "disconnect",
      payload: { source: selectedUnit, target }
    })
    if (updated !== specText) {
      setSpecText(updated)
    }
  }

  const handleAddConnection = () => {
    if (!selectedUnit || !newConnTarget) return
    let updated = reconcileSpec(specText, {
      type: "connect",
      payload: { source: selectedUnit, target: newConnTarget }
    })
    if (newConnLabel.trim()) {
      updated = reconcileSpec(updated, {
        type: "connection-label",
        payload: { source: selectedUnit, target: newConnTarget, label: newConnLabel.trim() }
      })
    }
    if (updated !== specText) {
      setSpecText(updated)
      setNewConnTarget("")
      setNewConnLabel("")
    }
  }

  const handleConnectionLabelChange = (target: string, value: string) => {
    if (target === "__proto__" || target === "constructor" || target === "prototype") return
    setLocalConnectionLabels(prev => ({ ...prev, [target]: value }))

    if (connectionDebounceTimerRef.current) {
      clearTimeout(connectionDebounceTimerRef.current)
    }
    connectionDebounceTimerRef.current = setTimeout(() => {
      if (!selectedUnit) return
      setSpecText(prev => {
        return reconcileSpec(prev, {
          type: "connection-label",
          payload: { source: selectedUnit, target, label: value }
        })
      })
    }, 200)
  }

  const inboundConnectionsList = useMemo(() => {
    if (!selectedUnit || !parsedSpec?.system?.components) return []
    const list: { source: string; label: string; sourceIdx: number; originalIdx: number }[] = []
    parsedSpec.system.components.forEach((c: any, sourceIdx: number) => {
      if (!c || !c.id || c.id === selectedUnit) return
      normalizeConnections(c).forEach((conn) => {
        if (conn.target === selectedUnit) {
          list.push({ source: c.id, label: conn.label, sourceIdx, originalIdx: conn.originalIdx })
        }
      })
    })
    return list
  }, [parsedSpec, selectedUnit])

  const handleInboundConnectionLabelChange = (source: string, value: string) => {
    if (source === "__proto__" || source === "constructor" || source === "prototype") return
    setLocalInboundConnectionLabels(prev => ({ ...prev, [source]: value }))

    if (inboundConnectionDebounceTimerRef.current) {
      clearTimeout(inboundConnectionDebounceTimerRef.current)
    }
    inboundConnectionDebounceTimerRef.current = setTimeout(() => {
      if (!selectedUnit) return
      setSpecText(prev => {
        return reconcileSpec(prev, {
          type: "connection-label",
          payload: { source, target: selectedUnit, label: value }
        })
      })
    }, 200)
  }

  const handleInboundDisconnect = (source: string) => {
    if (!selectedUnit) return
    const updated = reconcileSpec(specText, {
      type: "disconnect",
      payload: { source, target: selectedUnit }
    })
    if (updated !== specText) {
      setSpecText(updated)
    }
  }

  const handleAddInboundConnection = () => {
    if (!selectedUnit || !newInboundConnSource) return
    let updated = reconcileSpec(specText, {
      type: "connect",
      payload: { source: newInboundConnSource, target: selectedUnit }
    })
    if (newInboundConnLabel.trim()) {
      updated = reconcileSpec(updated, {
        type: "connection-label",
        payload: { source: newInboundConnSource, target: selectedUnit, label: newInboundConnLabel.trim() }
      })
    }
    if (updated !== specText) {
      setSpecText(updated)
      setNewInboundConnSource("")
      setNewInboundConnLabel("")
    }
  }

  const handleDuplicate = () => {
    if (!selectedUnit || !parsedSpec) return
    const components = parsedSpec?.system?.components || []
    const existingIds = new Set<string>(components.map((c: any) => c?.id).filter(Boolean))
    let suffix = 1
    let newId = `${selectedUnit}_copy_${suffix}`
    while (existingIds.has(newId)) {
      suffix++
      newId = `${selectedUnit}_copy_${suffix}`
    }

    const updated = reconcileSpec(specText, {
      type: "duplicate",
      payload: { id: selectedUnit, newId }
    })
    if (updated !== specText) {
      setSpecText(updated)
      setSelectedUnit(newId)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col h-full gap-4 text-zinc-300 font-sans">
      {selectedUnit && comp ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-4">
          <div className="h-8 px-3 border border-indigo-500/30 bg-indigo-500/5 rounded-lg flex items-center justify-between shrink-0 font-mono">
            <span className="text-indigo-300 text-[11px]">
              Selected: <span className="font-bold">{selectedUnit}</span>
              <span className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: '0' }}>Selected Unit: {selectedUnit}</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="focus-duplicate-btn"
                onClick={handleDuplicate}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold font-sans uppercase tracking-wider"
              >
                Duplicate
              </button>
              <span className="text-zinc-800">|</span>
              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold font-sans uppercase tracking-wider"
              >
                Clear Selection
              </button>
            </div>
          </div>

          {/* Component Diagnostics Panel */}
          {compDiagnostics.length > 0 && (
            <div data-testid="focus-diagnostics-container" className="border border-amber-500/30 bg-amber-500/5 p-4 rounded-xl flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                <span>⚠️</span>
                Validation Issues ({compDiagnostics.length})
              </h3>
              <div className="flex flex-col gap-2">
                {compDiagnostics.map((d, idx) => {
                  const fixable = d.code && d.path && FIXABLE_DIAGNOSTIC_CODES.has(d.code)
                  return (
                    <div key={idx} className="flex items-start justify-between gap-4 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-900/60 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-zinc-300">{d.message}</span>
                        {d.path && (
                          <span className="text-[9px] text-zinc-500 font-mono">
                            {d.path}
                          </span>
                        )}
                      </div>
                      {fixable && onQuickFix && (
                        <button
                          type="button"
                          data-testid={`focus-quick-fix-${d.code}`}
                          onClick={() => handleApplySingleFix(d)}
                          className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-white rounded shadow transition-colors active:scale-95 shrink-0"
                        >
                          Quick-Fix
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Form Editor Panel */}
          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-xl flex flex-col gap-3.5 shrink-0">
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/20" />
              Interactive Property Editor
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Component ID with Rename trigger */}
              <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Component ID (System Key)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    data-testid="focus-id-input"
                    data-focus-field="focus-id-input"
                    value={idInput}
                    onChange={(e) => {
                      setIdInput(e.target.value)
                      setIdError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleIdRename()
                      }
                    }}
                    className="flex-1 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                    placeholder="e.g. processor"
                  />
                  <button
                    type="button"
                    onClick={handleIdRename}
                    data-testid="focus-id-rename-btn"
                    className="px-3.5 py-1.5 rounded-md text-xs font-sans font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/20 transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    Rename ID
                  </button>
                </div>
                {idError && (
                  <span className="text-[10px] text-red-400 mt-0.5" data-testid="focus-id-error">
                    ⚠️ {idError}
                  </span>
                )}
              </div>

              {/* Name field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Display Name</label>
                <input
                  type="text"
                  data-testid="focus-name-input"
                  data-focus-field="focus-name-input"
                  value={formState.name || ""}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                  placeholder="e.g. My Processing Stage"
                />
              </div>

              {/* Type select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Component Type</label>
                <select
                  data-testid="focus-type-select"
                  data-focus-field="focus-type-select"
                  value={formState.type || "Stage"}
                  onChange={(e) => handleFieldChange("type", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2 py-1.5 rounded-md font-sans focus:outline-none transition-all cursor-pointer"
                >
                  <option value="Gateway">Gateway (Entry)</option>
                  <option value="Stage">Stage (Worker)</option>
                  <option value="Brick">Brick (Service)</option>
                  <option value="Store">Store (Database)</option>
                </select>
              </div>

              {/* Metadata Owner */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Owner / Contact</label>
                <input
                  type="text"
                  data-testid="focus-owner-input"
                  data-focus-field="focus-owner-input"
                  value={formState.owner || ""}
                  onChange={(e) => handleFieldChange("metadata.owner", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                  placeholder="e.g. tom"
                />
              </div>

              {/* Metadata Status */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Deployment Status</label>
                <select
                  data-testid="focus-status-select"
                  data-focus-field="focus-status-select"
                  value={formState.status || "draft"}
                  onChange={(e) => handleFieldChange("metadata.status", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2 py-1.5 rounded-md font-sans focus:outline-none transition-all cursor-pointer"
                >
                  <option value="draft">Draft (Planning)</option>
                  <option value="active">Active (Production)</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>

              {/* Metadata Color */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Theme / Color</label>
                <select
                  data-testid="focus-color-select"
                  data-focus-field="focus-color-select"
                  value={formState.color || "zinc"}
                  onChange={(e) => handleFieldChange("metadata.color", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2 py-1.5 rounded-md font-sans focus:outline-none transition-all cursor-pointer"
                >
                  <option value="zinc">zinc (neutral)</option>
                  <option value="indigo">indigo (store)</option>
                  <option value="purple">purple (stage)</option>
                  <option value="emerald">emerald (brick)</option>
                  <option value="amber">amber (gateway)</option>
                  <option value="rose">rose (danger)</option>
                  <option value="sky">sky (info)</option>
                </select>
              </div>

              {/* Metadata Version */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Semantic Version</label>
                <input
                  type="text"
                  data-testid="focus-version-input"
                  data-focus-field="focus-version-input"
                  value={formState.version || ""}
                  onChange={(e) => handleFieldChange("metadata.version", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                  placeholder="e.g. 1.0.0"
                />
              </div>

              {/* Metadata Latency */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Latency (ms)</label>
                <input
                  type="text"
                  data-testid="focus-latency-input"
                  data-focus-field="focus-latency-input"
                  value={formState.latency || ""}
                  onChange={(e) => handleFieldChange("metadata.latency", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                  placeholder="e.g. 40"
                />
              </div>

              {/* Metadata Throughput */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Throughput (req/s)</label>
                <input
                  type="text"
                  data-testid="focus-throughput-input"
                  data-focus-field="focus-throughput-input"
                  value={formState.throughput || ""}
                  onChange={(e) => handleFieldChange("metadata.throughput", e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md font-mono focus:outline-none transition-all"
                  placeholder="e.g. 300"
                />
              </div>
            </div>

            {/* Metadata Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Architectural Description</label>
              <textarea
                data-testid="focus-description-textarea"
                data-focus-field="focus-description-textarea"
                value={formState.description || ""}
                onChange={(e) => handleFieldChange("metadata.description", e.target.value)}
                rows={2}
                className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs px-2.5 py-1.5 rounded-md focus:outline-none transition-all resize-none font-mono"
                placeholder="Briefly describe what this component does..."
              />
            </div>
          </div>

          {/* Outgoing Connections Manager */}
          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-xl flex flex-col gap-3.5 shrink-0">
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/20" />
              Outgoing Connections
            </h3>

            {/* List of existing connections */}
            {connectionsList.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                {connectionsList.map((conn) => {
                  const connDiagnostics = diagnostics.filter(d => {
                    if (!d.path) return false
                    const exactPath = `system.components[${compIdx}].connections[${conn.originalIdx}]`
                    return d.path === exactPath || d.path === `${exactPath}.target`
                  })
                  return (
                    <div key={conn.target} className="flex flex-col gap-1 bg-zinc-950/40 p-2 rounded-lg border border-zinc-900/60">
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={() => setSelectedUnit(conn.target)}
                          className="text-xs font-mono font-semibold text-indigo-400 hover:text-indigo-300 hover:underline transition-all truncate max-w-[120px]"
                          title={`Focus on ${conn.target}`}
                        >
                          {conn.target}
                        </button>
                        <input
                          type="text"
                          data-testid={`focus-conn-label-input-${conn.target}`}
                          data-focus-field={`focus-conn-label-input-${conn.target}`}
                          value={localConnectionLabels[conn.target] || ""}
                          onChange={(e) => handleConnectionLabelChange(conn.target, e.target.value)}
                          placeholder="Add connection label..."
                          className="flex-1 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-[11px] px-2 py-1 rounded focus:outline-none transition-all font-mono"
                        />
                        <button
                          onClick={() => handleDisconnect(conn.target)}
                          className="px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer shrink-0"
                        >
                          Disconnect
                        </button>
                      </div>
                      {connDiagnostics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5 px-1">
                          {connDiagnostics.map((d, dIdx) => (
                            <span
                              key={dIdx}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border ${
                                d.severity === "error"
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                              }`}
                            >
                              <span>{d.severity === "error" ? "❌" : "⚠️"}</span>
                              <span>{getConnectionBadgeLabel(d)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">No outgoing connections from this component.</p>
            )}

            {/* Add connection controls */}
            <div className="border-t border-zinc-900/60 pt-3 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Add Connection</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  data-testid="add-connection-select"
                  value={newConnTarget}
                  onChange={(e) => setNewConnTarget(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-xs px-2 py-1.5 rounded focus:outline-none transition-all cursor-pointer flex-1"
                >
                  <option value="">Select target...</option>
                  {(Array.from(new Set((parsedSpec?.system?.components || [])
                    .map((c: any) => c.id)
                    .filter((id: any): id is string => typeof id === "string")
                  )) as string[])
                    .filter((id: string) => id !== selectedUnit && !connectionsList.some((nc) => nc.target === id))
                    .map((id: string) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  data-testid="add-connection-label-input"
                  value={newConnLabel}
                  onChange={(e) => setNewConnLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-xs px-2 py-1.5 rounded focus:outline-none transition-all font-mono flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddConnection}
                  disabled={!newConnTarget}
                  className="px-3 py-1.5 rounded text-xs font-sans font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border-zinc-900 disabled:cursor-not-allowed text-white border border-indigo-500/20 transition-all cursor-pointer shrink-0"
                >
                  Add Connection
                </button>
              </div>
            </div>
          </div>

          {/* Incoming Connections Manager */}
          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-xl flex flex-col gap-3.5 shrink-0">
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/20" />
              Incoming Connections
            </h3>

            {/* List of existing inbound connections */}
            {inboundConnectionsList.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                {inboundConnectionsList.map((conn, idx) => {
                  const inboundDiagnostics = diagnostics.filter(d => {
                    if (!d.path) return false
                    const exactPath = `system.components[${conn.sourceIdx}].connections[${conn.originalIdx}]`
                    return d.path === exactPath || d.path === `${exactPath}.target`
                  })
                  return (
                    <div key={`${conn.source}-${idx}`} className="flex flex-col gap-1 bg-zinc-950/40 p-2 rounded-lg border border-zinc-900/60">
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={() => setSelectedUnit(conn.source)}
                          className="text-xs font-mono font-semibold text-indigo-400 hover:text-indigo-300 hover:underline transition-all truncate max-w-[120px]"
                          title={`Focus on ${conn.source}`}
                        >
                          {conn.source}
                        </button>
                        <input
                          type="text"
                          data-testid={`focus-inbound-conn-label-input-${conn.source}`}
                          data-focus-field={`focus-inbound-conn-label-input-${conn.source}`}
                          value={localInboundConnectionLabels[conn.source] || ""}
                          onChange={(e) => handleInboundConnectionLabelChange(conn.source, e.target.value)}
                          placeholder="Add inbound connection label..."
                          className="flex-1 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-[11px] px-2 py-1 rounded focus:outline-none transition-all font-mono"
                        />
                        <button
                          onClick={() => handleInboundDisconnect(conn.source)}
                          data-testid={`disconnect-inbound-${conn.source}`}
                          className="px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer shrink-0"
                        >
                          Remove Inbound
                        </button>
                      </div>
                      {inboundDiagnostics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5 px-1">
                          {inboundDiagnostics.map((d, dIdx) => (
                            <span
                              key={dIdx}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border ${
                                d.severity === "error"
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                              }`}
                            >
                              <span>{d.severity === "error" ? "❌" : "⚠️"}</span>
                              <span>{getConnectionBadgeLabel(d)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">No incoming connections to this component.</p>
            )}

            {/* Add inbound connection controls */}
            <div className="border-t border-zinc-900/60 pt-3 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Add Incoming Connection</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  data-testid="add-inbound-connection-select"
                  value={newInboundConnSource}
                  onChange={(e) => setNewInboundConnSource(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-xs px-2 py-1.5 rounded focus:outline-none transition-all cursor-pointer flex-1"
                >
                  <option value="">Select source...</option>
                  {(Array.from(new Set((parsedSpec?.system?.components || [])
                    .map((c: any) => c.id)
                    .filter((id: any): id is string => typeof id === "string")
                  )) as string[])
                    .filter((id: string) => id !== selectedUnit && !inboundConnectionsList.some((nc) => nc.source === id))
                    .map((id: string) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  data-testid="add-inbound-connection-label-input"
                  value={newInboundConnLabel}
                  onChange={(e) => setNewInboundConnLabel(e.target.value)}
                  placeholder="Inbound label (optional)"
                  className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-xs px-2 py-1.5 rounded focus:outline-none transition-all font-mono flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddInboundConnection}
                  data-testid="add-inbound-connection-btn"
                  disabled={!newInboundConnSource}
                  className="px-3 py-1.5 rounded text-xs font-sans font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border-zinc-900 disabled:cursor-not-allowed text-white border border-indigo-500/20 transition-all cursor-pointer shrink-0"
                >
                  Add Inbound Connection
                </button>
              </div>
            </div>
          </div>

          {/* Live Compiled YAML Spec Viewer */}
          <div className="flex-1 flex flex-col min-h-[150px] overflow-hidden">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 shrink-0 font-mono">Live AST-Reconciled Spec</h4>
            <pre className="flex-1 border border-zinc-900 bg-zinc-950 p-4 rounded-lg overflow-auto leading-6 text-emerald-400/90 whitespace-pre-wrap select-text font-mono text-xs">
              {getSelectedUnitSpec()}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-4">
          {/* Header */}
          <div className="border border-zinc-900 bg-zinc-950/40 p-4 rounded-lg flex flex-col gap-1.5 shrink-0">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <FocusIcon size={16} className="text-indigo-400" />
              Global System Settings
            </h3>
            <p className="text-[11px] text-zinc-500 leading-normal">
              View and edit global system metadata, version, owner, and documentation rules.
            </p>
          </div>

          {/* Form */}
          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-lg flex flex-col gap-4 shrink-0">
            {/* System Name field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">System Name</label>
              <input
                type="text"
                data-testid="focus-system-name-input"
                data-focus-field="focus-system-name-input"
                value={globalFormState.systemName || ""}
                onChange={(e) => handleGlobalFieldChange("systemName", "system.name", e.target.value)}
                placeholder="My System Name"
                className="w-full h-8 px-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs rounded transition-all focus:outline-none font-mono"
              />
            </div>

            {/* Metadata check */}
            {(() => {
              const hasSystemMetadata = !!parsedSpec?.system?.metadata
              if (!hasSystemMetadata) {
                return (
                  <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded-lg text-center gap-2">
                    <p className="text-xs text-zinc-500 italic max-w-sm">
                      System metadata is not initialized. Initialize metadata to configure owner, description, version, and status.
                    </p>
                    {onQuickFix && (
                      <button
                        type="button"
                        data-testid="focus-system-init-metadata-btn"
                        onClick={() => onQuickFix("system", "missing-system-metadata")}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold uppercase tracking-wide transition-colors active:scale-95 cursor-pointer border border-indigo-500/20"
                      >
                        Initialize System Metadata
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <div className="flex flex-col gap-4 border-t border-zinc-900/60 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* System Version */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">System Version</label>
                      <input
                        type="text"
                        data-testid="focus-system-version-input"
                        data-focus-field="focus-system-version-input"
                        value={globalFormState.systemVersion || ""}
                        onChange={(e) => handleGlobalFieldChange("systemVersion", "system.metadata.version", e.target.value)}
                        placeholder="e.g. 1.0.0"
                        className="w-full h-8 px-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs rounded transition-all focus:outline-none font-mono"
                      />
                    </div>

                    {/* System Status */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">System Status</label>
                      <select
                        data-testid="focus-system-status-select"
                        data-focus-field="focus-system-status-select"
                        value={globalFormState.systemStatus || "draft"}
                        onChange={(e) => handleGlobalFieldChange("systemStatus", "system.metadata.status", e.target.value)}
                        className="w-full h-8 px-2 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-300 text-xs rounded transition-all focus:outline-none cursor-pointer font-sans"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                      </select>
                    </div>
                  </div>

                  {/* System Owner */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">System Owner</label>
                    <input
                      type="text"
                      data-testid="focus-system-owner-input"
                      data-focus-field="focus-system-owner-input"
                      value={globalFormState.systemOwner || ""}
                      onChange={(e) => handleGlobalFieldChange("systemOwner", "system.metadata.owner", e.target.value)}
                      placeholder="e.g. architecture-team"
                      className="w-full h-8 px-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs rounded transition-all focus:outline-none font-mono"
                    />
                  </div>

                  {/* System Description */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">System Description</label>
                    <textarea
                      data-testid="focus-system-description-textarea"
                      data-focus-field="focus-system-description-textarea"
                      value={globalFormState.systemDescription || ""}
                      onChange={(e) => handleGlobalFieldChange("systemDescription", "system.metadata.description", e.target.value)}
                      placeholder="Enter high-level architecture description..."
                      rows={3}
                      className="w-full p-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-zinc-200 text-xs rounded transition-all focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Prompt / hint */}
          <div className="border border-dashed border-zinc-900/60 rounded-lg flex flex-col items-center justify-center p-5 text-center text-zinc-500 shrink-0">
            <p className="text-[10px] font-semibold text-zinc-400">Diagram Selection Sync Active</p>
            <p className="text-[9.5px] text-zinc-600 mt-1 max-w-xs leading-normal">
              Click any component or box in the visual diagram, and this view will automatically switch to inspect and edit its properties.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

interface SecurityTabProps {
  parsedSpec?: any
  diagnostics?: Diagnostic[]
  onQuickFixAll?: (fixes: { path: string; fixType: string; extraData?: any }[]) => void
  onExportReport?: () => void
}

function SecurityTab({ parsedSpec, diagnostics = [], onQuickFixAll, onExportReport }: SecurityTabProps) {
  const spoofingDiags = diagnostics.filter(d => d.code === "stride-spoofing")
  const hasSpoofing = spoofingDiags.length > 0

  const tamperingDiags = diagnostics.filter(d => d.code === "stride-tampering")
  const hasTampering = tamperingDiags.length > 0

  const repudiationDiags = diagnostics.filter(d => d.code === "stride-repudiation")
  const hasRepudiation = repudiationDiags.length > 0

  const infoDiags = diagnostics.filter(d => d.code === "stride-information-disclosure")
  const hasInfo = infoDiags.length > 0

  const elevationDiags = diagnostics.filter(d => d.code === "stride-elevation-of-privilege")
  const hasElevation = elevationDiags.length > 0

  const dosDiags = diagnostics.filter(d => d.code === "stride-denial-of-service")
  const hasDos = dosDiags.length > 0

  const secretDiags = diagnostics.filter(d => d.code === "stride-secret-leak")
  const hasSecrets = secretDiags.length > 0

  let score = 100
  if (hasSpoofing) score -= 15
  if (hasTampering) score -= 15
  if (hasRepudiation) score -= 5
  if (hasInfo) score -= 15
  if (hasElevation) score -= 15
  if (hasDos) score -= 15
  if (hasSecrets) score -= 15
  score = Math.max(0, score)

  const threatCategories = [
    {
      id: "spoofing",
      name: "Spoofing (S)",
      desc: "Gateway elements must use security/auth labels to establish trusted identity.",
      vulnerable: hasSpoofing,
      diags: spoofingDiags,
      recommendation: "Ensure all outgoing connections from Gateways have security/auth labels."
    },
    {
      id: "tampering",
      name: "Tampering (T)",
      desc: "Connection channels must specify secure communication explicitly (e.g., TLS/gRPC/HTTPS).",
      vulnerable: hasTampering,
      diags: tamperingDiags,
      recommendation: "Apply TLS, HTTPS, or gRPC communication labels explicitly to connections."
    },
    {
      id: "repudiation",
      name: "Repudiation (R)",
      desc: "Key data Stores must attach to an audited event ledger or logging neighbor.",
      vulnerable: hasRepudiation,
      diags: repudiationDiags,
      recommendation: "Connect store nodes to auditing log/ledger bricks (e.g., b2_ledger)."
    },
    {
      id: "information-disclosure",
      name: "Information Disclosure (I)",
      desc: "Direct Gateway-to-Store flows bypassing validation checkpoints are prohibited.",
      vulnerable: hasInfo,
      diags: infoDiags,
      recommendation: "Insert an Auth Verifier validation Stage component to protect raw data stores."
    },
    {
      id: "elevation-of-privilege",
      name: "Elevation of Privilege (E)",
      desc: "Administrative or privileged nodes must require verification module connections.",
      vulnerable: hasElevation,
      diags: elevationDiags,
      recommendation: "Connect administrative/privileged component nodes to verification modules."
    },
    {
      id: "denial-of-service",
      name: "Denial of Service (DoS)",
      desc: "High fan-in bottleneck nodes (fan-in >= 3) must configure rate limits or throttling.",
      vulnerable: hasDos,
      diags: dosDiags,
      recommendation: "Add 'rate_limit: true' or 'throttled: true' under metadata configurations."
    },
    {
      id: "secrets",
      name: "Hardcoded Secrets Leakage",
      desc: "Raw credentials, tokens, or private keys must not be stored in system metadata.",
      vulnerable: hasSecrets,
      diags: secretDiags,
      recommendation: "Redact actual secrets with environment variable placeholders like '${API_KEY}'."
    }
  ]

  const handleFixThreat = (categoryDiags: Diagnostic[]) => {
    if (!onQuickFixAll || categoryDiags.length === 0) return
    // Batch into one reconcile: calling onQuickFix per diagnostic reconciles
    // against the same stale render-snapshot specText, so only the last fix
    // would survive.
    const fixes = categoryDiags
      .filter(d => d.path && d.code)
      .map(d => ({ path: d.path!, fixType: d.code! }))
    if (fixes.length > 0) {
      onQuickFixAll(fixes)
    }
  }

  const handleFixAllThreats = () => {
    if (!onQuickFixAll) return
    const allSecurityDiags = [
      ...spoofingDiags,
      ...tamperingDiags,
      ...repudiationDiags,
      ...infoDiags,
      ...elevationDiags,
      ...dosDiags,
      ...secretDiags
    ]
    handleFixThreat(allSecurityDiags)
  }

  const getScoreColor = (val: number) => {
    if (val >= 90) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
    if (val >= 70) return "text-amber-400 border-amber-500/30 bg-amber-500/5"
    return "text-red-400 border-red-500/30 bg-red-500/5"
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4 font-sans select-none">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">STRIDE Threat Modeling Dashboard</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Continuous automated security & vulnerability scanning</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="export-security-report-btn"
            onClick={onExportReport}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 rounded text-xs font-bold transition-all cursor-pointer"
          >
            Export Report
          </button>
          <button
            onClick={handleFixAllThreats}
            disabled={score === 100}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
              score === 100
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow"
            }`}
          >
            Fix All Gaps
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-4 p-3 border rounded-lg ${getScoreColor(score)}`}>
        <div className="text-2xl font-black font-mono tracking-tighter shrink-0">{score}%</div>
        <div className="min-w-0">
          <div className="text-xs font-bold">Security Compliance Score</div>
          <p className="text-[10px] text-zinc-400 leading-normal mt-0.5">
            {score === 100
              ? "Excellent! Your system blueprint fully mitigates all analyzed STRIDE threat boundaries."
              : `System has active security warnings. Compliance score dropped to ${score}%. Apply recommendations below to secure it.`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {threatCategories.map(cat => (
          <div
            key={cat.id}
            data-testid={`threat-category-${cat.id}`}
            className="p-3 border border-zinc-800/80 bg-zinc-900/20 rounded-md space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    cat.vulnerable ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                <span className="font-bold text-[11px] text-zinc-200">{cat.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  data-testid={`threat-status-${cat.id}`}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide ${
                    cat.vulnerable
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {cat.vulnerable ? "Vulnerable" : "Secured"}
                </span>
                {cat.vulnerable && (
                  <button
                    data-testid={`fix-threat-btn-${cat.id}`}
                    onClick={() => handleFixThreat(cat.diags)}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-all shadow-sm"
                  >
                    Auto-Fix
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 leading-relaxed">{cat.desc}</p>

            {cat.vulnerable && (
              <div className="mt-2 bg-red-950/20 border border-red-500/10 rounded p-2 text-[10px] space-y-1">
                <div className="font-bold text-red-400 uppercase tracking-wide text-[9px]">Active Vulnerabilities:</div>
                <ul className="list-disc pl-3.5 space-y-1 text-zinc-400 leading-normal">
                  {cat.diags.map((d, i) => (
                    <li key={i}>
                      {d.message} <span className="font-mono text-zinc-600 text-[9px]">({d.path || "N/A"})</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[10px] text-indigo-300 font-medium leading-relaxed mt-1">
                  <span className="font-bold text-indigo-400">Recommendation:</span> {cat.recommendation}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

type TabId = "code" | "tree" | "focus" | "metrics" | "security"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "code",  label: "Code",  icon: <CodeIcon size={12} /> },
  { id: "tree",  label: "Tree",  icon: <NetworkIcon size={12} /> },
  { id: "focus", label: "Focus", icon: <FocusIcon size={12} /> },
  { id: "metrics", label: "Metrics", icon: <BarChart2Icon size={12} /> },
  { id: "security", label: "Security", icon: <Shield size={12} /> },
]

// Diagnostics panel sizing. The panel is the last flex child of a
// `flex flex-col h-full` section whose active tab panel above it is
// `flex-1 min-h-0`, so it simply takes the height it asks for — which is why
// an unclamped ask can eat the YAML textarea whole on a short pane.
const DIAGNOSTICS_DEFAULT_HEIGHT = 128 // what the old `max-h-32` cap allowed
const DIAGNOSTICS_MIN_HEIGHT = 72 // one issue row plus its action button
// The Auto-Fix-All strip's BUDGET, not a measurement: its real box is ~45px,
// so reserving 48 leaves the panel a couple of pixels shorter than asked,
// never taller. It is chrome above the scrollable body, paid for out of the
// panel's own height rather than added to it — see the JSX comment on the
// strip for why both halves of that matter.
const DIAGNOSTICS_BANNER_HEIGHT = 48
const DIAGNOSTICS_MAX_HEIGHT = 480 // the ceiling on a tall viewport
// Everything in the pane that is not diagnostics body: the fixed chrome (tab
// bar 36 + breadcrumb 28 + resize handle 5 + panel header 32 = 101) plus a
// ~160px floor for the spec textarea, so the editor stays usable.
const DIAGNOSTICS_RESERVED_HEIGHT = 261

/**
 * The panel's ceiling for a pane of `paneHeight`. A measurement of 0 — jsdom,
 * or a first render before layout — falls back to the flat constant so the
 * behaviour stays deterministic.
 *
 * On a pane too short to pay both floors they cannot both be honoured, and
 * holding the panel's 72px left the textarea a 27px box carrying 40px of its
 * own padding — not one visible editing line. The editor wins that contest.
 *
 * The panel is then either at least one issue row or collapsed, never in
 * between: anything under DIAGNOSTICS_MIN_HEIGHT is a clipped sliver of the
 * first row, which is neither usable nor an honest collapse. 72px remains the
 * floor of a drag on any pane that can afford it.
 */
function diagnosticsMaxHeight(paneHeight: number) {
  if (!(paneHeight > 0)) return DIAGNOSTICS_MAX_HEIGHT
  const available = paneHeight - DIAGNOSTICS_RESERVED_HEIGHT
  // One whole issue row or nothing — a sliver of a row is neither usable nor
  // an honest collapse. The banner is NOT part of this test: see the sizing
  // block in the component for why presence must not depend on content.
  if (available < DIAGNOSTICS_MIN_HEIGHT) return 0
  return Math.min(DIAGNOSTICS_MAX_HEIGHT, available)
}

function clampDiagnosticsHeight(
  height: number,
  maxHeight = DIAGNOSTICS_MAX_HEIGHT,
  minHeight = DIAGNOSTICS_MIN_HEIGHT
) {
  return Math.min(Math.max(height, minHeight), maxHeight)
}

export function EditorPanel({
  specText: propSpecText,
  setSpecText: propSetSpecText,
  parsedSpec: propParsedSpec,
  selectedUnit: propSelectedUnit,
  setSelectedUnit: propSetSelectedUnit,
  pathSource: propPathSource,
  setPathSource: propSetPathSource,
  pathTarget: propPathTarget,
  setPathTarget: propSetPathTarget,
  activeTab: propActiveTab,
  setActiveTab: propSetActiveTab,
  isHydrated: propIsHydrated,
}: EditorPanelProps) {
  const [localSelectedUnit, setLocalSelectedUnit] = useState<string | null>(null)
  const selectedUnit = propSelectedUnit !== undefined ? propSelectedUnit : localSelectedUnit
  const setSelectedUnit = propSetSelectedUnit || setLocalSelectedUnit

  const [localActiveTab, setLocalActiveTab] = useState<TabId>("code")
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab
  const setActiveTab = propSetActiveTab || setLocalActiveTab

  // Automatically switch to Focus tab when a component is selected
  useEffect(() => {
    if (selectedUnit) {
      setActiveTab("focus")
    }
  }, [selectedUnit, setActiveTab])
  
  const [localPathSource, setLocalPathSource] = useState<string>("")
  const [localPathTarget, setLocalPathTarget] = useState<string>("")
  const pathSource = propPathSource !== undefined ? propPathSource : localPathSource
  const setPathSource = propSetPathSource || setLocalPathSource
  const pathTarget = propPathTarget !== undefined ? propPathTarget : localPathTarget
  const setPathTarget = propSetPathTarget || setLocalPathTarget

  const [wordWrap, setWordWrap] = useState(false)
  const [copied, setCopied] = useState(false)

  // Standard fallback state if no props provided
  const [localSpecText, setLocalSpecText] = useState(`system:
  name: External Brain
  components:
    - id: api_gateway
      type: Gateway
      name: Public API Gateway
      connections:
        - target: inbox`)
  const specText = propSpecText !== undefined ? propSpecText : localSpecText
  const setSpecText = propSetSpecText || setLocalSpecText

  const [localParsedSpec, setLocalParsedSpec] = useState<any>(null)
  const parsedSpec = propParsedSpec !== undefined ? propParsedSpec : localParsedSpec

  const [yamlSyntaxError, setYamlSyntaxError] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(true)
  // A ceiling of 0 means the pane cannot pay the panel's one-row floor. The
  // body must then be UNMOUNTED, not merely zero-height: under border-box a
  // height-0 body still paints its border-t and p-3 as an empty strip, under a
  // header offering to "Collapse" what is already invisible.
  // The height the USER asked for, never overwritten by a window resize: the
  // rendered height is derived from it against the current ceiling. Storing
  // only the clamped value meant shrinking the window until the panel hit its
  // floor and then enlarging again gave back the floor, not the dragged height.
  const diagnosticsHeightRef = useRef(DIAGNOSTICS_DEFAULT_HEIGHT)
  const [wantedDiagnosticsHeight, setWantedDiagnosticsHeight] = useState(DIAGNOSTICS_DEFAULT_HEIGHT)
  const [measuredPaneHeight, setMeasuredPaneHeight] = useState(0)
  const [isResizingDiagnostics, setIsResizingDiagnostics] = useState(false)
  const diagnosticsDragStartY = useRef(0)
  const diagnosticsDragStartHeight = useRef(DIAGNOSTICS_DEFAULT_HEIGHT)
  // Written during render (below, once the diagnostics are known) so the drag
  // and resize handlers, which run after it, see the current bounds.
  const diagnosticsMaxRef = useRef(DIAGNOSTICS_MAX_HEIGHT)
  const diagnosticsMinRef = useRef(DIAGNOSTICS_MIN_HEIGHT)
  // The pane the panel lives in — measured, so the ceiling tracks a 900px
  // laptop or a short split instead of assuming a tall viewport.
  const editorPaneRef = useRef<HTMLElement>(null)

  // Drag-to-resize, adapted from the pane splitter in workspace-layout.tsx:
  // clientX becomes clientY, and the delta sign is inverted because the handle
  // sits on the panel's TOP edge — dragging up has to make the panel taller.
  const startDiagnosticsResize = (clientY: number) => {
    diagnosticsDragStartY.current = clientY
    diagnosticsDragStartHeight.current = diagnosticsHeightRef.current
    setIsResizingDiagnostics(true)
  }

  // Measure only. The ceiling and the rendered height are derived from this
  // during render, so a resize can never destroy the user's wanted height.
  // Layout phase, so no over-tall frame is ever painted; jsdom and any
  // pre-layout render measure 0 and keep the constant default.
  useIsomorphicLayoutEffect(() => {
    const measure = () =>
      setMeasuredPaneHeight(editorPaneRef.current?.getBoundingClientRect().height ?? 0)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  useEffect(() => {
    if (!isResizingDiagnostics) return

    const resizeTo = (clientY: number) => {
      const delta = clientY - diagnosticsDragStartY.current
      setWantedDiagnosticsHeight(
        clampDiagnosticsHeight(
          diagnosticsDragStartHeight.current - delta,
          diagnosticsMaxRef.current,
          diagnosticsMinRef.current
        )
      )
    }
    const onMouseMove = (e: MouseEvent) => resizeTo(e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) resizeTo(touch.clientY)
    }
    const onRelease = () => setIsResizingDiagnostics(false)

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onRelease)
    window.addEventListener("touchmove", onTouchMove)
    window.addEventListener("touchend", onRelease)
    // A gesture the browser cancels never sends touchend; without this the
    // resize stays armed and the next unrelated touch drags the panel.
    window.addEventListener("touchcancel", onRelease)
    // Alt-tab with the button still down and the mouseup may never arrive;
    // without this the next pointer move over the page resizes a panel the
    // user has already let go of.
    window.addEventListener("blur", onRelease)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onRelease)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onRelease)
      window.removeEventListener("touchcancel", onRelease)
      window.removeEventListener("blur", onRelease)
    }
  }, [isResizingDiagnostics])
  const [droppedConnections, setDroppedConnections] = useState<DroppedConnection[]>([])
  const lastParsedTextRef = useRef<string>("")

  useEffect(() => {
    if (specText === lastParsedTextRef.current) return
    lastParsedTextRef.current = specText
    const { spec, error, droppedConnections: dropped } = parseSpec(specText)
    setYamlSyntaxError(error)
    setDroppedConnections(dropped)
    if (propParsedSpec === undefined && spec) {
      setLocalParsedSpec(spec)
    }
  }, [specText, propParsedSpec])

  const diagnostics = useMemo(() => {
    if (yamlSyntaxError) return []
    return [...lintSpec(parsedSpec), ...droppedConnectionDiagnostics(droppedConnections)]
  }, [parsedSpec, yamlSyntaxError, droppedConnections])

  const handleQuickFix = (path: string, fixType: string, extraData?: any) => {
    const updated = reconcileSpec(specText, {
      type: "quick-fix",
      payload: { path, fixType: fixType as FixType, extraData }
    })
    if (updated !== specText) {
      setSpecText(updated)
    }
  }

  // Batched variant: one reconcile for many fixes, so every fix sees the
  // accumulated text instead of the same stale snapshot (only the last would
  // survive otherwise).
  const handleQuickFixAll = (fixes: { path: string; fixType: string; extraData?: any }[]) => {
    if (fixes.length === 0) return
    // Diagnostic codes are not always FixType names ("empty-system-name" →
    // "missing-system-name"); route each through the same mapping the
    // single-fix path uses, falling back to the code itself when it already
    // names a FixType (e.g. the stride-* codes).
    const mapped = fixes.map((f) => ({ ...f, fixType: (fixTypeForCode(f.fixType) ?? f.fixType) as FixType }))
    const updated = reconcileSpec(specText, {
      type: "quick-fix-all",
      payload: { fixes: mapped }
    })
    if (updated !== specText) {
      setSpecText(updated)
    }
  }

  const fixableDiagnostics = useMemo(() => {
    return diagnostics.filter((d) => {
      return d.code && d.path && isFixable(d)
    })
  }, [diagnostics])

  // ── Diagnostics panel sizing, derived ──
  // Computed here rather than with the state above because the floor depends
  // on whether the Auto-Fix-All banner is rendered, which is only known once
  // the diagnostics are. The refs carry the result to the drag and resize
  // handlers, which run after this render.
  // Panel sizing, in one place and in this order — the order is the point.
  //
  //   available < 72                  -> no panel at all
  //   72 <= available < 72 + banner   -> panel at the bare floor, NO banner
  //   available >= 72 + banner        -> panel and banner
  //
  // Whether the PANEL exists depends only on the pane's height, never on what
  // the spec happens to contain. Tying the two together (as the first version
  // of this did) meant that in a narrow band of pane heights, typing an
  // unrecognised type made the whole panel vanish and the editor jump taller,
  // and fixing it popped the panel back — the mid-edit resize this sizing
  // exists to avoid. The banner is what yields; each issue row keeps its own
  // action button, so the fix is still one click away without it.
  const hasFixBanner = !yamlSyntaxError && fixableDiagnostics.length > 0
  const diagnosticsCeiling = diagnosticsMaxHeight(measuredPaneHeight)
  const showsFixBanner =
    hasFixBanner && diagnosticsCeiling >= DIAGNOSTICS_MIN_HEIGHT + DIAGNOSTICS_BANNER_HEIGHT
  const bannerHeight = showsFixBanner ? DIAGNOSTICS_BANNER_HEIGHT : 0
  // The floor is one whole issue row, plus the strip above it when it shows.
  const diagnosticsMin = DIAGNOSTICS_MIN_HEIGHT + bannerHeight
  const diagnosticsHeight = clampDiagnosticsHeight(
    wantedDiagnosticsHeight,
    diagnosticsCeiling,
    diagnosticsMin
  )
  const diagnosticsBodyHeight = Math.max(0, diagnosticsHeight - bannerHeight)
  diagnosticsMinRef.current = diagnosticsMin
  diagnosticsMaxRef.current = diagnosticsCeiling
  diagnosticsHeightRef.current = diagnosticsHeight
  /** The pane can afford the panel AND the user has not collapsed it. */
  const diagnosticsFits = diagnosticsCeiling > 0
  const bodyVisible = showDiagnostics && diagnosticsFits

  const handleFixAll = () => {
    const fixes = fixableDiagnostics.map((d) => {
      const fixType = fixTypeForCode(d.code!) ?? d.code!
      const extraData: any = d.code === "unrecognized-type" ? { type: "Stage" } : undefined

      return {
        path: d.path!,
        fixType,
        extraData
      }
    })

    if (fixes.length > 0) {
      const updated = reconcileSpec(specText, {
        type: "quick-fix-all",
        payload: { fixes: fixes as { path: string; fixType: FixType; extraData?: any }[] }
      })
      if (updated !== specText) {
        setSpecText(updated)
      }
    }
  }

  const handleExportMarkdownReport = () => {
    const md = generateArchitectureAuditReport(parsedSpec, diagnostics)
    const systemName = parsedSpec?.system?.name || "Unnamed System"

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const p = navigator.clipboard.writeText(md)
      if (p && typeof p.catch === "function") {
        p.catch((e) => console.error("Clipboard copy failed:", e))
      }
    }

    triggerDownload(
      "data:text/markdown;charset=utf-8," + encodeURIComponent(md),
      architectureAuditReportFilename(systemName)
    )
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(specText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section
      ref={editorPaneRef}
      data-testid="editor-panel"
      className="flex flex-col h-full"
      style={{ background: "var(--surface)" }}
      aria-label="Spec editor"
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          height: 36,
        }}
      >
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Editor views">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-1.5 px-3 h-9 text-[12px] font-medium transition-colors duration-100 select-none"
                style={{
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  background: isActive ? "var(--surface-elevated)" : "transparent",
                  borderRadius: "4px 4px 0 0",
                }}
              >
                <span style={{ color: isActive ? "var(--accent)" : "var(--foreground-muted)" }}>
                  {tab.icon}
                </span>
                {tab.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {activeTab === "code" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWordWrap((w) => !w)}
              title="Toggle word wrap"
              aria-label="Toggle word wrap"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{
                color: wordWrap ? "var(--accent)" : "var(--foreground-muted)",
                background: wordWrap ? "var(--accent-dim)" : "transparent",
              }}
            >
              <WrapTextIcon size={12} />
            </button>
            <button
              title="Search"
              aria-label="Search in file"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{ color: "var(--foreground-muted)" }}
            >
              <SearchIcon size={12} />
            </button>
            <button
              onClick={handleCopy}
              title="Copy"
              aria-label="Copy code"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{ color: copied ? "var(--success)" : "var(--foreground-muted)" }}
            >
              <CopyIcon size={12} />
            </button>
          </div>
        )}
      </div>

      {/* File path breadcrumb */}
      <div
        className="flex items-center gap-1.5 px-3 h-7 shrink-0 text-[11px] select-none"
        style={{
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
          color: "var(--foreground-muted)",
        }}
      >
        <FileJsonIcon size={11} style={{ color: "var(--warning)" }} />
        <span>workspace</span>
        <span style={{ color: "var(--foreground-dim)" }}>/</span>
        <span>specs</span>
        <span style={{ color: "var(--foreground-dim)" }}>/</span>
        <span style={{ color: "var(--foreground)" }}>main.spec.yaml</span>
        <span
          className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}
        >
          YAML
        </span>
      </div>

      {/* Tab panels */}
      <div
        id="tabpanel-code"
        role="tabpanel"
        aria-labelledby="tab-code"
        hidden={activeTab !== "code"}
        className={activeTab === "code" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}
        style={{ background: "var(--background)" }}
      >
        <CodeTab value={specText} onChange={(val) => setSpecText(val, { isTyping: true })} disabled={propIsHydrated === false} />
      </div>

      <div
        id="tabpanel-tree"
        role="tabpanel"
        aria-labelledby="tab-tree"
        hidden={activeTab !== "tree"}
        className={activeTab === "tree" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}
        style={{ background: "var(--background)" }}
      >
        <TreeTab parsedSpec={parsedSpec} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
      </div>

      <div
        id="tabpanel-focus"
        role="tabpanel"
        aria-labelledby="tab-focus"
        hidden={activeTab !== "focus"}
        className={activeTab === "focus" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}
        style={{ background: "var(--background)" }}
      >
        <FocusTab
          specText={specText}
          setSpecText={setSpecText}
          parsedSpec={parsedSpec}
          selectedUnit={selectedUnit}
          setSelectedUnit={setSelectedUnit}
          diagnostics={diagnostics}
          onQuickFix={handleQuickFix}
        />
      </div>

      <div
        id="tabpanel-metrics"
        role="tabpanel"
        aria-labelledby="tab-metrics"
        hidden={activeTab !== "metrics"}
        className={activeTab === "metrics" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}
        style={{ background: "var(--background)" }}
      >
        <MetricsTab
          parsedSpec={parsedSpec}
          selectedUnit={selectedUnit}
          setSelectedUnit={setSelectedUnit}
          diagnostics={diagnostics}
          onQuickFix={handleQuickFix}
          pathSource={pathSource}
          setPathSource={setPathSource}
          pathTarget={pathTarget}
          setPathTarget={setPathTarget}
          storeHydrated={propIsHydrated}
        />
      </div>

      <div
        id="tabpanel-security"
        role="tabpanel"
        aria-labelledby="tab-security"
        hidden={activeTab !== "security"}
        className={activeTab === "security" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}
        style={{ background: "var(--background)" }}
      >
        <SecurityTab
          parsedSpec={parsedSpec}
          diagnostics={diagnostics}
          onQuickFixAll={handleQuickFixAll}
          onExportReport={handleExportMarkdownReport}
        />
      </div>

      {/* Diagnostics Panel */}
      <div
        className="border-t shrink-0 flex flex-col font-sans select-none"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Resize handle. Deliberately its own strip ABOVE the header: the
            collapse toggle is the entire header div's onClick, so a handle
            placed inside it would collapse the panel on mouseup. */}
        {bodyVisible && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize diagnostics panel"
            data-testid="diagnostics-resize-handle"
            onMouseDown={(e) => {
              e.preventDefault()
              startDiagnosticsResize(e.clientY)
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0]
              if (touch) startDiagnosticsResize(touch.clientY)
            }}
            className="relative flex items-center justify-center h-[5px] shrink-0 group cursor-row-resize select-none z-10"
            style={{ background: "var(--border)" }}
          >
            {/* Visual track + dots */}
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px transition-colors duration-150"
              style={{
                background: isResizingDiagnostics ? "var(--accent)" : "var(--border-subtle)",
              }}
            />
            <div
              className="relative flex gap-[3px] z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              aria-hidden="true"
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="block w-[3px] h-[3px] rounded-full"
                  style={{
                    background: isResizingDiagnostics ? "var(--accent)" : "var(--foreground-muted)",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Panel header */}
        <div
          data-testid="diagnostics-header"
          onClick={() => {
            // Nothing to toggle when the pane cannot show the panel at all.
            if (!diagnosticsFits) return
            setShowDiagnostics((s) => !s)
          }}
          title={diagnosticsFits ? undefined : "The editor pane is too short to show diagnostics"}
          className="flex items-center justify-between px-3 h-8 cursor-pointer hover:bg-zinc-900/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background:
                  yamlSyntaxError || diagnostics.some((d) => d.severity === "error")
                    ? "#ef4444" // red
                    : diagnostics.some((d) => d.severity === "warning")
                    ? "#f59e0b" // amber
                    : "#10b981", // emerald
              }}
            />
            <span>Spec Diagnostics</span>
            {(yamlSyntaxError || diagnostics.length > 0) ? (
              <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono font-medium">
                {yamlSyntaxError
                  ? "syntax error"
                  : `${diagnostics.length} issue${diagnostics.length > 1 ? "s" : ""}`}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500 font-medium">all checks passing</span>
            )}
          </div>
          <span className="text-zinc-500 text-[11px] font-medium">
            {bodyVisible ? "Collapse" : "Expand"}
          </span>
        </div>

        {/* Auto-Fix-All strip. OUTSIDE the scrollable body — rendered inside
            it, above the rows, it ate the whole one-row floor and clipped the
            first issue row, the floor's whole promise. And paid for out of the
            PANEL's height rather than added to it, so the panel's total height
            does not change when the strip appears or disappears mid-edit;
            adding it on top resized the editor as the user typed and
            desynchronised the highlight overlay from the textarea's scroll. */}
        {bodyVisible && showsFixBanner && (
          <div
            data-testid="diagnostics-fix-banner"
            className="shrink-0 flex items-center justify-between bg-indigo-500/10 border-t border-indigo-500/25 p-2.5 font-sans select-none"
          >
            <div className="text-indigo-300 text-xs">
              Found <span className="font-bold">{fixableDiagnostics.length}</span> auto-fixable issue{fixableDiagnostics.length > 1 ? 's' : ''}!
            </div>
            <button
              type="button"
              onClick={handleFixAll}
              className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow transition-colors active:scale-95 shrink-0"
            >
              Auto-Fix All
            </button>
          </div>
        )}

        {/* Panel body */}
        {bodyVisible && (
          <div
            data-testid="diagnostics-body"
            className="border-t overflow-y-auto p-3 bg-zinc-950/60 font-mono text-[11px] leading-relaxed space-y-1.5"
            style={{ borderColor: "var(--border)", height: diagnosticsBodyHeight }}
          >
            {yamlSyntaxError && (
              <div className="text-red-400 flex items-start gap-1.5">
                <span className="text-red-500">❌</span>
                <div>
                  <div className="font-bold">YAML Syntax Error:</div>
                  <div className="text-zinc-400 whitespace-pre-wrap">{yamlSyntaxError}</div>
                </div>
              </div>
            )}

            {!yamlSyntaxError && diagnostics.length === 0 && (
              <div className="text-emerald-400 flex items-center gap-1.5 py-0.5">
                <span className="text-emerald-500">✓</span>
                <span>No issues found. Your specification is syntactically sound and logically consistent!</span>
              </div>
            )}

            {!yamlSyntaxError &&
              diagnostics.map((d, i) => (
                <div
                  key={i}
                  className="flex flex-col border-b border-zinc-900/40 pb-1.5 last:border-0"
                >
                  <div
                    className={`flex items-start gap-1.5 ${
                      d.severity === "error"
                        ? "text-red-400"
                        : d.severity === "warning"
                        ? "text-amber-400"
                        : "text-blue-400"
                    }`}
                  >
                    <span>{d.severity === "error" ? "❌" : d.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                    <div>
                      <span>{d.message}</span>
                      {d.path && (
                        <span className="text-[9px] text-zinc-600 bg-zinc-900/50 px-1 py-0.2 rounded ml-1.5 font-mono">
                          {d.path}
                        </span>
                      )}
                    </div>
                  </div>
                  {d.path && (
                    <div className="mt-1 flex flex-wrap gap-1.5 pl-6">
                      {d.code === "unrecognized-type" && (
                        <>
                          {["Store", "Stage", "Brick", "Gateway"].map((type) => (
                            <button
                              key={type}
                              onClick={() => handleQuickFix(d.path!, "unrecognized-type", { type })}
                              className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                            >
                              Set to {type}
                            </button>
                          ))}
                        </>
                      )}
                      {d.code === "component-overlap" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "component-overlap")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Resolve Overlap (Shift x)
                        </button>
                      )}
                      {d.code === "orphan-connection" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "orphan-connection")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                        >
                          Create Component
                        </button>
                      )}
                      {d.code === "self-connection" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "self-connection")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Connection
                        </button>
                      )}
                      {d.code === "empty-connection-target" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "empty-connection-target")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Empty Connection
                        </button>
                      )}
                      {d.code === "duplicate-connection" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "duplicate-connection")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Remove Duplicate
                        </button>
                      )}
                      {d.code === "connection-case-mismatch" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "connection-case-mismatch")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Fix Casing
                        </button>
                      )}
                      {d.code === "invalid-id-format" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-id-format")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Fix ID Format
                        </button>
                      )}
                      {d.code === "duplicate-id" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "duplicate-id")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Deduplicate ID
                        </button>
                      )}
                      {d.code === "disconnected-component" && (
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleQuickFix(d.path!, "delete-component")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                          >
                            Delete Component
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-from-gateway")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                          >
                            Connect from Gateway
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-to-store")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                          >
                            Connect to Store
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-to-stage")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-all"
                          >
                            Connect to Stage
                          </button>
                        </div>
                      )}
                      {d.code === "unused-store" && (
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleQuickFix(d.path!, "delete-component")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                          >
                            Delete Store
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-to-store")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                          >
                            Connect Node to Store
                          </button>
                        </div>
                      )}
                      {d.code === "unreachable-component" && (
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleQuickFix(d.path!, "delete-component")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                          >
                            Delete Component
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-from-gateway")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                          >
                            Connect from Gateway
                          </button>
                        </div>
                      )}
                      {(d.code === "gateway-to-store" || d.code === "store-to-store") && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "insert-stage")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Insert Stage
                        </button>
                      )}
                      {d.code === "circular-dependency" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "circular-dependency")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Connection
                        </button>
                      )}
                      {d.code === "unrecognized-metadata-key" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "unrecognized-metadata-key")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Key
                        </button>
                      )}
                      {d.code === "unrecognized-component-key" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "unrecognized-component-key")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Key
                        </button>
                      )}
                      {d.code === "unrecognized-system-key" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "unrecognized-system-key")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Key
                        </button>
                      )}
                      {d.code === "unrecognized-connection-key" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "unrecognized-connection-key")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Key
                        </button>
                      )}
                      {d.code === "invalid-metadata-status" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-metadata-status")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Set to Draft
                        </button>
                      )}
                      {d.code === "invalid-metadata-color" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-metadata-color")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Set to Zinc
                        </button>
                      )}
                      {d.code === "missing-metadata-description" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "missing-metadata-description")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Add Description
                        </button>
                      )}
                      {d.code === "missing-metadata-owner" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "missing-metadata-owner")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Add Owner
                        </button>
                      )}
                      {d.code === "invalid-metadata-version" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "set-default-version")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Set Default Version
                        </button>
                      )}
                      {d.code === "sink-stage-brick" && (
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleQuickFix(d.path!, "convert-to-store")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                          >
                            Convert to Store
                          </button>
                          <button
                            onClick={() => handleQuickFix(d.path!, "connect-to-store")}
                            className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                          >
                            Connect to Store
                          </button>
                        </div>
                      )}
                      {d.code === "empty-gateway" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "connect-to-stage")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all"
                        >
                          Connect to Stage
                        </button>
                      )}
                      {(d.code === "missing-system-name" || d.code === "empty-system-name") && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "missing-system-name")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Set Default System Name
                        </button>
                      )}
                      {d.code === "missing-component-id" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "missing-component-id")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Generate Unique ID
                        </button>
                      )}
                      {d.code === "missing-component-type" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "missing-component-type")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all"
                        >
                          Set to Stage
                        </button>
                      )}
                      {d.code === "stride-secret-leak" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "stride-secret-leak")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Use Environment Variable
                        </button>
                      )}
                      {d.code === "invalid-metadata-object" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-metadata-object")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Reset Metadata to &#123;&#125;
                        </button>
                      )}
                      {d.code === "invalid-connections-array" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-connections-array")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Reset Connections to []
                        </button>
                      )}
                      {d.code === "invalid-connection-object" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "invalid-connection-object")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Remove Invalid Connection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  )
}
