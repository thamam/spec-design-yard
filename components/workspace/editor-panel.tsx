"use client"

import { useState, useEffect, useMemo } from "react"
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
} from "lucide-react"
import yaml from "yaml"
import { lintSpec } from "../../lib/linter"
import { reconcileSpec } from "../../lib/reconciler"

interface EditorPanelProps {
  specText?: string
  setSpecText?: (val: string) => void
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
}

/* ── Code Tab ── */
interface CodeTabProps {
  value: string
  onChange: (val: string) => void
}

function CodeTab({ value, onChange }: CodeTabProps) {
  return (
    <div className="flex-1 flex overflow-hidden font-mono text-[13px] leading-relaxed relative bg-zinc-950/80">
      <textarea
        data-testid="spec-textarea"
        id="spec-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 p-5 text-zinc-300 font-mono resize-none leading-6 overflow-y-auto"
        spellCheck="false"
      />
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

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  if (!parsedSpec?.system) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 text-xs min-h-[250px]">
        <NetworkIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
        <p>Awaiting valid YAML input to render tree structure...</p>
      </div>
    )
  }

  const components = parsedSpec.system.components || []

  return (
    <div className="flex-1 overflow-auto py-3 px-4 text-sm select-none">
      <div className="mb-2">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">System Directory Structure</span>
      </div>
      <div className="space-y-2 mt-2">
        <div className="flex items-center gap-1.5 text-zinc-200 cursor-pointer" onClick={() => toggleNode("system")}>
          {expandedNodes.system ? <ChevronDownIcon size={14} className="text-zinc-500" /> : <ChevronRightIcon size={14} className="text-zinc-500" />}
          <FolderIcon size={14} className="text-indigo-400" />
          <span className="font-semibold">{parsedSpec.system.name || "System Root"}</span>
        </div>

        {expandedNodes.system && (
          <div className="pl-4 space-y-2 border-l border-zinc-850 ml-1.5">
            <div className="flex items-center gap-1.5 text-zinc-300 cursor-pointer" onClick={() => toggleNode("components")}>
              {expandedNodes.components ? <ChevronDownIcon size={14} className="text-zinc-500" /> : <ChevronRightIcon size={14} className="text-zinc-500" />}
              <span className="text-emerald-400">❖</span>
              <span className="font-medium text-zinc-400">components</span>
            </div>

            {expandedNodes.components && (
              <div className="pl-4 space-y-2 border-l border-zinc-850 ml-1.5">
                {components.map((comp: any) => {
                  const isExpanded = !!expandedNodes[comp.id]
                  return (
                    <div key={comp.id} className="space-y-1.5">
                      <div
                        onClick={() => {
                          toggleNode(comp.id)
                          setSelectedUnit(comp.id)
                        }}
                        className={`flex items-center justify-between py-1 px-2.5 rounded border transition-all cursor-pointer ${
                          selectedUnit === comp.id
                            ? "bg-indigo-500/10 border-indigo-500 text-indigo-200"
                            : "bg-zinc-900/50 border-zinc-850 hover:border-zinc-800 text-zinc-300"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-indigo-400">📄</span>
                          <span className="font-mono text-xs">{comp.id}</span>
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded uppercase">
                          {comp.type}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="pl-4 py-1.5 text-[11px] text-zinc-400 font-mono space-y-1 bg-zinc-900/20 rounded-md p-2 border border-zinc-850">
                          <div>
                            <span className="text-zinc-500">name:</span> {comp.name || comp.id}
                          </div>
                          {comp.connections && comp.connections.length > 0 && (
                            <div>
                              <span className="text-zinc-500">connections:</span>
                              {comp.connections.map((conn: any, idx: number) => (
                                <div key={idx} className="pl-3 text-emerald-400/80">
                                  → {conn.target}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
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
  parsedSpec: any
  selectedUnit: string | null
  setSelectedUnit: (val: string | null) => void
}

function FocusTab({ parsedSpec, selectedUnit, setSelectedUnit }: FocusTabProps) {
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

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col h-full">
      {selectedUnit ? (
        <div className="flex-1 flex flex-col overflow-hidden h-full">
          <div className="h-8 px-3 border border-indigo-500/30 bg-indigo-500/5 rounded-t-lg flex items-center justify-between shrink-0">
            <span className="font-mono text-indigo-300 text-[11px]">
              Selected: <span className="font-bold">{selectedUnit}</span>
            </span>
            <button
              onClick={() => setSelectedUnit(null)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold font-sans"
            >
              Clear Selection
            </button>
          </div>
          <pre className="flex-1 border-x border-b border-zinc-800 bg-zinc-950 p-4 rounded-b-lg overflow-auto leading-6 text-emerald-400/90 whitespace-pre-wrap select-text font-mono text-xs">
            {getSelectedUnitSpec()}
          </pre>
        </div>
      ) : (
        <div className="flex-1 border border-dashed border-zinc-850 rounded-lg flex flex-col items-center justify-center p-6 text-center text-zinc-500 min-h-[250px]">
          <FocusIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
          <p className="text-xs font-semibold">Diagram Selection Sync Active</p>
          <p className="text-[11px] text-zinc-600 mt-1 max-w-xs leading-relaxed">
            Click any component or container box in the Excalidraw diagram or the directory tree, and this view will automatically isolate and show only its specific spec block.
          </p>
        </div>
      )}
    </div>
  )
}

type TabId = "code" | "tree" | "focus"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "code",  label: "Code",  icon: <CodeIcon size={12} /> },
  { id: "tree",  label: "Tree",  icon: <NetworkIcon size={12} /> },
  { id: "focus", label: "Focus", icon: <FocusIcon size={12} /> },
]

export function EditorPanel({
  specText: propSpecText,
  setSpecText: propSetSpecText,
  parsedSpec: propParsedSpec,
  selectedUnit: propSelectedUnit,
  setSelectedUnit: propSetSelectedUnit,
}: EditorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("code")
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

  useEffect(() => {
    try {
      const parsed = yaml.parse(specText)
      setYamlSyntaxError(null)
      if (propParsedSpec === undefined && parsed && typeof parsed === "object") {
        setLocalParsedSpec(parsed)
      }
    } catch (e: any) {
      setYamlSyntaxError(e.message || "Invalid YAML syntax")
    }
  }, [specText, propParsedSpec])

  const diagnostics = useMemo(() => {
    if (yamlSyntaxError) return []
    return lintSpec(parsedSpec)
  }, [parsedSpec, yamlSyntaxError])

  const [localSelectedUnit, setLocalSelectedUnit] = useState<string | null>(null)
  const selectedUnit = propSelectedUnit !== undefined ? propSelectedUnit : localSelectedUnit
  const setSelectedUnit = propSetSelectedUnit || setLocalSelectedUnit

  const handleQuickFix = (path: string, fixType: string, extraData?: any) => {
    const updated = reconcileSpec(specText, {
      type: "quick-fix",
      payload: { path, fixType, extraData }
    })
    if (updated !== specText) {
      setSpecText(updated)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(specText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section
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
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <CodeTab value={specText} onChange={setSpecText} />
      </div>

      <div
        id="tabpanel-tree"
        role="tabpanel"
        aria-labelledby="tab-tree"
        hidden={activeTab !== "tree"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <TreeTab parsedSpec={parsedSpec} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
      </div>

      <div
        id="tabpanel-focus"
        role="tabpanel"
        aria-labelledby="tab-focus"
        hidden={activeTab !== "focus"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <FocusTab parsedSpec={parsedSpec} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
      </div>

      {/* Diagnostics Panel */}
      <div
        className="border-t shrink-0 flex flex-col font-sans select-none"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Panel header */}
        <div
          onClick={() => setShowDiagnostics((s) => !s)}
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
            {showDiagnostics ? "Collapse" : "Expand"}
          </span>
        </div>

        {/* Panel body */}
        {showDiagnostics && (
          <div
            className="border-t overflow-y-auto max-h-32 p-3 bg-zinc-950/60 font-mono text-[11px] leading-relaxed space-y-1.5"
            style={{ borderColor: "var(--border)" }}
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
                      {d.code === "duplicate-id" && (
                        <button
                          onClick={() => handleQuickFix(d.path!, "duplicate-id")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
                        >
                          Deduplicate ID
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
