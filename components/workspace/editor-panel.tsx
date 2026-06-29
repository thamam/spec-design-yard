"use client"

import { useState, useEffect, useMemo, useRef } from "react"
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
  Trash as TrashIcon,
  Plus as PlusIcon,
  Settings as SettingsIcon,
} from "lucide-react"
import yaml from "yaml"
import { lintSpec, type Diagnostic } from "../../lib/linter"
import { reconcileSpec } from "../../lib/reconciler"
import { getAutocompleteSuggestions } from "../../lib/autocomplete"

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
  const [cursorPos, setCursorPos] = useState<number | null>(null)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [suppressAutocomplete, setSuppressAutocomplete] = useState(false)
  const [hasNavigated, setHasNavigated] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value
    onChange(nextVal)
    setCursorPos(e.target.selectionStart)
    setSuppressAutocomplete(false)
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
    onChange(newValue)

    // Return focus to textarea and adjust cursor position
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const textarea = document.getElementById("spec-textarea") as HTMLTextAreaElement
      if (textarea) {
        textarea.focus()
        const newCursorPos = start + sug.length
        textarea.setSelectionRange(newCursorPos, newCursorPos)
        setCursorPos(newCursorPos)
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        setSuppressAutocomplete(true)
      }
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden font-mono text-[13px] leading-relaxed relative bg-zinc-950/80">
      <textarea
        data-testid="spec-textarea"
        id="spec-textarea"
        value={value}
        onChange={handleTextareaChange}
        onSelect={handleTextareaSelect}
        onKeyDown={handleKeyDown}
        className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 p-5 text-zinc-300 font-mono resize-none leading-6 overflow-y-auto"
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

  const components = Array.isArray(parsedSpec.system.components) ? parsedSpec.system.components : []

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
  specText: string
  setSpecText: (val: string) => void
  parsedSpec: any
  selectedUnit: string | null
  setSelectedUnit: (val: string | null) => void
}

function FocusTab({ specText, setSpecText, parsedSpec, selectedUnit, setSelectedUnit }: FocusTabProps) {
  const component = useMemo(() => {
    if (!selectedUnit || !parsedSpec) return null
    return parsedSpec?.system?.components?.find((c: any) => c.id === selectedUnit)
  }, [selectedUnit, parsedSpec])

  const [tempId, setTempId] = useState("")
  const [tempName, setTempName] = useState("")
  const [tempType, setTempType] = useState("Stage")
  const [tempColor, setTempColor] = useState("zinc")
  const [tempStatus, setTempStatus] = useState("draft")
  const [tempOwner, setTempOwner] = useState("")
  const [tempDescription, setTempDescription] = useState("")

  const [newConnTarget, setNewConnTarget] = useState("")
  const [newConnLabel, setNewConnLabel] = useState("")

  const [showRawYaml, setShowRawYaml] = useState(false)

  useEffect(() => {
    if (component) {
      setTempId(component.id || "")
      setTempName(component.name || "")
      setTempType(component.type || "Stage")
      
      const meta = component.metadata || {}
      setTempColor(meta.color || "zinc")
      setTempStatus(meta.status || "draft")
      setTempOwner(meta.owner || "")
      setTempDescription(meta.description || "")
    } else {
      setTempId("")
      setTempName("")
      setTempType("Stage")
      setTempColor("zinc")
      setTempStatus("draft")
      setTempOwner("")
      setTempDescription("")
    }
    setNewConnTarget("")
    setNewConnLabel("")
  }, [selectedUnit, component])

  const handleUpdate = (updates: any) => {
    if (!selectedUnit || !specText) return
    const updated = reconcileSpec(specText, {
      type: "update-component" as any,
      payload: {
        id: selectedUnit,
        updates
      }
    })
    if (updated !== specText) {
      setSpecText(updated)
      if (updates.id && updates.id !== selectedUnit) {
        setSelectedUnit(updates.id.trim())
      }
    }
  }

  const handleIdBlur = () => {
    const nextId = tempId.trim()
    if (nextId && nextId !== selectedUnit) {
      handleUpdate({ id: nextId })
    }
  }

  const handleNameBlur = () => {
    if (tempName !== (component?.name || "")) {
      handleUpdate({ name: tempName })
    }
  }

  const handleTypeChange = (newType: string) => {
    setTempType(newType)
    handleUpdate({ type: newType })
  }

  const handleMetaBlur = (metaField: string, val: string) => {
    const currentMeta = component?.metadata || {}
    if (val !== (currentMeta[metaField] || "")) {
      const updatedMeta = { ...currentMeta, [metaField]: val || undefined }
      handleUpdate({ metadata: updatedMeta })
    }
  }

  const handleMetaSelectChange = (metaField: string, val: string) => {
    const currentMeta = component?.metadata || {}
    if (val !== (currentMeta[metaField] || "")) {
      const updatedMeta = { ...currentMeta, [metaField]: val }
      handleUpdate({ metadata: updatedMeta })
    }
  }

  const handleAddConnection = () => {
    if (!newConnTarget || !selectedUnit) return
    
    // 1. Establish the connection
    let nextSpec = reconcileSpec(specText, {
      type: "connect",
      payload: { source: selectedUnit, target: newConnTarget }
    })

    // 2. Set the connection label if provided
    if (newConnLabel.trim() !== "") {
      nextSpec = reconcileSpec(nextSpec, {
        type: "connection-label" as any,
        payload: { source: selectedUnit, target: newConnTarget, label: newConnLabel.trim() }
      })
    }

    if (nextSpec !== specText) {
      setSpecText(nextSpec)
    }

    setNewConnTarget("")
    setNewConnLabel("")
  }

  const handleRemoveConnection = (targetId: string) => {
    if (!selectedUnit) return
    const nextSpec = reconcileSpec(specText, {
      type: "disconnect",
      payload: { source: selectedUnit, target: targetId }
    })
    if (nextSpec !== specText) {
      setSpecText(nextSpec)
    }
  }

  const otherComponentIds = useMemo(() => {
    if (!parsedSpec?.system?.components) return []
    return parsedSpec.system.components
      .map((c: any) => c?.id)
      .filter((id: any) => typeof id === "string" && id !== selectedUnit)
  }, [parsedSpec, selectedUnit])

  const getSelectedUnitSpec = () => {
    if (!component) return ""
    try {
      return yaml.stringify({ component })
    } catch (e) {
      return "Error serializing yaml preview"
    }
  }

  const currentConnections = component?.connections || []

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col h-full bg-zinc-950/20 text-zinc-300">
      {selectedUnit && component ? (
        <div className="flex-1 flex flex-col gap-4 overflow-auto pb-6">
          {/* Header */}
          <div className="h-10 px-3 border border-indigo-500/30 bg-indigo-500/5 rounded-lg flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <SettingsIcon size={14} className="text-indigo-400" />
              <span className="font-mono text-indigo-300 text-[12px] font-semibold">
                Selected: <span className="text-white font-bold">{selectedUnit}</span>
              </span>
            </div>
            <button
              onClick={() => setSelectedUnit(null)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold font-sans px-2 py-1 rounded bg-zinc-900 border border-zinc-800 transition"
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Core Settings Card */}
            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col gap-3 shadow-md">
              <h3 className="text-xs font-bold text-zinc-100 border-b border-zinc-800 pb-2 mb-1 flex items-center gap-1.5 uppercase tracking-wider font-sans">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                Core Settings
              </h3>

              {/* ID Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-id">Component ID</label>
                <input
                  id="focus-comp-id"
                  type="text"
                  value={tempId}
                  onChange={(e) => setTempId(e.target.value)}
                  onBlur={handleIdBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleIdBlur()}
                  placeholder="e.g. database"
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-xs text-white focus:border-indigo-500/60 focus:outline-none transition"
                />
              </div>

              {/* Name Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-name">Display Name</label>
                <input
                  id="focus-comp-name"
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
                  placeholder="e.g. PostgreSQL Database"
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-indigo-500/60 focus:outline-none transition"
                />
              </div>

              {/* Type Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-type">Component Type</label>
                <select
                  id="focus-comp-type"
                  value={tempType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-indigo-500/60 focus:outline-none cursor-pointer transition"
                >
                  <option value="Store">Store</option>
                  <option value="Stage">Stage</option>
                  <option value="Brick">Brick</option>
                  <option value="Gateway">Gateway</option>
                </select>
              </div>
            </div>

            {/* Metadata Card */}
            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col gap-3 shadow-md">
              <h3 className="text-xs font-bold text-zinc-100 border-b border-zinc-800 pb-2 mb-1 flex items-center gap-1.5 uppercase tracking-wider font-sans">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Metadata (Blueprint Keys)
              </h3>

              {/* Color Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-color">Color Palette</label>
                <select
                  id="focus-comp-color"
                  value={tempColor}
                  onChange={(e) => handleMetaSelectChange("color", e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500/60 focus:outline-none cursor-pointer transition"
                >
                  <option value="zinc">Zinc (Default)</option>
                  <option value="indigo">Indigo</option>
                  <option value="purple">Purple</option>
                  <option value="emerald">Emerald</option>
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="rose">Rose</option>
                  <option value="amber">Amber</option>
                </select>
              </div>

              {/* Status Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-status">Release Status</label>
                <select
                  id="focus-comp-status"
                  value={tempStatus}
                  onChange={(e) => handleMetaSelectChange("status", e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500/60 focus:outline-none cursor-pointer transition"
                >
                  <option value="draft">Draft</option>
                  <option value="wip">WIP</option>
                  <option value="active">Active</option>
                  <option value="stable">Stable</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>

              {/* Owner Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-owner">Lead Owner</label>
                <input
                  id="focus-comp-owner"
                  type="text"
                  value={tempOwner}
                  onChange={(e) => setTempOwner(e.target.value)}
                  onBlur={() => handleMetaBlur("owner", tempOwner)}
                  onKeyDown={(e) => e.key === "Enter" && handleMetaBlur("owner", tempOwner)}
                  placeholder="e.g. Tomer / Sentinel"
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500/60 focus:outline-none transition"
                />
              </div>

              {/* Description Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400" htmlFor="focus-comp-description">Description</label>
                <input
                  id="focus-comp-description"
                  type="text"
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  onBlur={() => handleMetaBlur("description", tempDescription)}
                  onKeyDown={(e) => e.key === "Enter" && handleMetaBlur("description", tempDescription)}
                  placeholder="e.g. Ingestion pipeline focal store"
                  className="px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500/60 focus:outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Connections Card */}
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col gap-3 shadow-md">
            <h3 className="text-xs font-bold text-zinc-100 border-b border-zinc-800 pb-2 mb-1 flex items-center gap-1.5 uppercase tracking-wider font-sans">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
              Connections & Flows
            </h3>

            {/* List Current Connections */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Active Outgoing Connections</label>
              {currentConnections.length > 0 ? (
                <div className="flex flex-col gap-1 max-h-[150px] overflow-auto">
                  {currentConnections.map((conn: any, idx: number) => {
                    const targetId = typeof conn === "string" ? conn : conn?.target
                    const label = typeof conn === "object" ? conn?.label : ""
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800/80 font-mono text-xs"
                      >
                        <div className="flex items-center gap-2 text-zinc-100">
                          <span className="text-zinc-500">→</span>
                          <span className="font-bold">{targetId}</span>
                          {label && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950/40 text-purple-300 border border-purple-900/30 font-sans">
                              {label}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveConnection(targetId)}
                          title="Remove Connection"
                          aria-label={`Remove connection to ${targetId}`}
                          className="p-1 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 rounded transition"
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 italic py-1">No active connections. This component is currently a sink.</p>
              )}
            </div>

            {/* Add Connection Tool */}
            {otherComponentIds.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Establish New Link</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newConnTarget}
                    onChange={(e) => setNewConnTarget(e.target.value)}
                    className="sm:col-span-1 px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="">Select Target...</option>
                    {otherComponentIds.map((id: string) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newConnLabel}
                    onChange={(e) => setNewConnLabel(e.target.value)}
                    placeholder="Link Label (optional)"
                    className="sm:col-span-1 px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={handleAddConnection}
                    disabled={!newConnTarget}
                    className="sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition"
                  >
                    <PlusIcon size={12} />
                    Add Connection
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sync Live YAML Preview Card */}
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col gap-2 shadow-md">
            <button
              onClick={() => setShowRawYaml(!showRawYaml)}
              className="flex items-center justify-between text-xs font-bold text-zinc-400 hover:text-zinc-200 uppercase tracking-wider font-sans focus:outline-none"
            >
              <span className="flex items-center gap-1.5">
                <CodeIcon size={12} className="text-zinc-500" />
                Live Sync YAML Block
              </span>
              <span>{showRawYaml ? "Hide" : "Show"}</span>
            </button>
            {showRawYaml && (
              <pre className="mt-2 border border-zinc-800 bg-zinc-950 p-3 rounded-md overflow-auto leading-5 text-emerald-400/90 whitespace-pre-wrap select-text font-mono text-[11px]">
                {getSelectedUnitSpec()}
              </pre>
            )}
          </div>
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

interface MetricsTabProps {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  diagnostics?: Diagnostic[]
}

const EMPTY_DIAGNOSTICS: Diagnostic[] = []

function MetricsTab({ parsedSpec, selectedUnit, setSelectedUnit, diagnostics = EMPTY_DIAGNOSTICS }: MetricsTabProps) {
  const metrics = useMemo(() => {
    const components = Array.isArray(parsedSpec?.system?.components) ? parsedSpec.system.components : []
    const systemName = parsedSpec?.system?.name || "Unnamed System"

    // Compute metrics
    const totalComponents = components.length
    let gatewayCount = 0
    let stageCount = 0
    let brickCount = 0
    let storeCount = 0

    let totalConnections = 0

    components.forEach((c: any) => {
      if (!c) return
      const type = String(c.type || '').toLowerCase()
      if (type === 'gateway') gatewayCount++
      else if (type === 'stage') stageCount++
      else if (type === 'brick') brickCount++
      else if (type === 'store') storeCount++

      const conns = c.connections || []
      if (Array.isArray(conns)) {
        conns.forEach((conn: any) => {
          const target = typeof conn === 'string' ? conn : conn?.target
          if (target) {
            totalConnections++
          }
        })
      }
    })

    // Compute diagnostics counts
    const errorsCount = diagnostics.filter(d => d.severity === "error").length
    const warningsCount = diagnostics.filter(d => d.severity === "warning").length
    const infoCount = diagnostics.filter(d => d.severity === "info").length

    // Health Score Calculation: starts at 100%, drops by 15% per error and 5% per warning
    const healthPct = Math.max(0, 100 - (errorsCount * 15) - (warningsCount * 5))

    return {
      components,
      systemName,
      totalComponents,
      gatewayCount,
      stageCount,
      brickCount,
      storeCount,
      totalConnections,
      errorsCount,
      warningsCount,
      infoCount,
      healthPct
    }
  }, [parsedSpec, diagnostics])

  const {
    components,
    systemName,
    totalComponents,
    gatewayCount,
    stageCount,
    brickCount,
    storeCount,
    totalConnections,
    errorsCount,
    warningsCount,
    infoCount,
    healthPct
  } = metrics

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col h-full font-sans select-none text-zinc-300 gap-4">
      {/* Header card */}
      <div className="border border-zinc-800 bg-zinc-950/80 p-4 rounded-xl flex flex-col gap-2 shrink-0">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center justify-between uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20" />
            System Architecture Metrics
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            System Health: <span className={healthPct === 100 ? "text-emerald-400 font-bold" : healthPct >= 80 ? "text-amber-400 font-bold" : "text-rose-500 font-bold"}>{healthPct}%</span>
          </span>
        </h3>
        <div className="text-[11px] text-zinc-500 leading-relaxed font-mono flex flex-wrap gap-2 justify-between items-center mt-1 border-t border-zinc-900 pt-2">
          <span>System: <span className="text-zinc-300 font-bold">{systemName}</span></span>
          <div className="flex items-center gap-2 text-[10px]">
            {errorsCount > 0 && (
              <span className="text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 rounded font-bold">
                Errors: {errorsCount}
              </span>
            )}
            {warningsCount > 0 && (
              <span className="text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1.5 py-0.5 rounded font-bold">
                Warnings: {warningsCount}
              </span>
            )}
            <span className="text-sky-400 bg-sky-950/40 border border-sky-900/50 px-1.5 py-0.5 rounded font-bold">
              Info: {infoCount}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Total Components:</span>
          <span className="text-xl font-bold text-zinc-100">{totalComponents}</span>
        </div>
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Total Connections</span>
          <span className="text-xl font-bold text-indigo-400">{totalConnections}</span>
        </div>
      </div>

      {/* Breakdown by Type */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Breakdown by Type</h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Gateways
            </span>
            <span className="font-bold text-zinc-300">{gatewayCount} Gateways</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Stages
            </span>
            <span className="font-bold text-zinc-300">{stageCount} Stages</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Bricks
            </span>
            <span className="font-bold text-zinc-300">{brickCount} Bricks</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Stores
            </span>
            <span className="font-bold text-zinc-300">{storeCount} Stores</span>
          </div>
        </div>
      </div>

      {/* Component Interactive List */}
      <div className="flex flex-col flex-1 min-h-0 gap-1.5">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Component Directory</h4>
        <div className="flex-1 overflow-y-auto border border-zinc-900 bg-zinc-950/10 rounded-lg p-2 font-mono text-xs divide-y divide-zinc-900/50">
          {components.length === 0 ? (
            <p className="text-zinc-600 text-center py-4 italic">No components defined.</p>
          ) : (
            components.map((comp: any, idx: number) => {
              if (!comp || !comp.id) return null
              const isSelected = selectedUnit === comp.id
              const type = String(comp.type || '').toLowerCase()
              
              // Use neutral color for unknown component types to prevent Store color confusion
              const bulletColor = 
                type === 'gateway' ? 'bg-amber-500' : 
                type === 'stage' ? 'bg-purple-500' : 
                type === 'brick' ? 'bg-emerald-500' : 
                type === 'store' ? 'bg-indigo-500' : 
                'bg-zinc-500'

              // Find associated diagnostics for this component with exact boundary checks (fix index collision)
              const compDiagnostics = diagnostics.filter(d => {
                const path = d.path;
                if (!path) return false;
                return path === `system.components[${idx}]` || path.startsWith(`system.components[${idx}].`);
              })
              const compErrors = compDiagnostics.filter(d => d.severity === "error")
              const compWarnings = compDiagnostics.filter(d => d.severity === "warning")
              const compInfos = compDiagnostics.filter(d => d.severity === "info")

              let badge = null
              if (compErrors.length > 0) {
                badge = (
                  <span className="text-[9px] text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Error
                  </span>
                )
              } else if (compWarnings.length > 0) {
                badge = (
                  <span className="text-[9px] text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Warning
                  </span>
                )
              } else if (compInfos.length > 0) {
                badge = (
                  <span className="text-[9px] text-sky-400 bg-sky-950/40 border border-sky-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Info
                  </span>
                )
              }

              return (
                <button
                  key={comp.id + '-' + idx}
                  onClick={() => setSelectedUnit && setSelectedUnit(comp.id)}
                  className={`w-full flex items-center justify-between py-2 px-2 hover:bg-zinc-900/40 rounded transition-colors text-left ${isSelected ? 'bg-indigo-500/10 text-indigo-300 border-l-2 border-indigo-500' : 'text-zinc-400'}`}
                >
                  <span className="flex items-center gap-2 font-bold truncate min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${bulletColor} shrink-0`} />
                    <span className="truncate">{comp.id}</span>
                    {badge}
                  </span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-900/60 px-1.5 py-0.5 rounded uppercase shrink-0 font-sans">
                    {comp.type || 'Unit'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

type TabId = "code" | "tree" | "focus" | "metrics"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "code",  label: "Code",  icon: <CodeIcon size={12} /> },
  { id: "tree",  label: "Tree",  icon: <NetworkIcon size={12} /> },
  { id: "focus", label: "Focus", icon: <FocusIcon size={12} /> },
  { id: "metrics", label: "Metrics", icon: <BarChart2Icon size={12} /> },
]

const FIXABLE_DIAGNOSTIC_CODES = new Set([
  "missing-system-name",
  "empty-system-name",
  "missing-component-id",
  "missing-component-type",
  "invalid-metadata-object",
  "invalid-connections-array",
  "invalid-connection-object",
  "unrecognized-metadata-key",
  "unrecognized-component-key",
  "unrecognized-system-key",
  "unrecognized-connection-key",
  "connection-case-mismatch",
  "invalid-metadata-status",
  "component-overlap",
  "missing-metadata-description",
  "missing-metadata-owner",
  "invalid-metadata-version",
  "unrecognized-type",
  "self-connection",
  "empty-connection-target",
  "duplicate-connection",
  "invalid-id-format",
  "duplicate-id",
  "orphan-connection",
  "disconnected-component",
  "unreachable-component",
  "gateway-to-store",
  "store-to-store",
  "sink-stage-brick",
  "empty-gateway",
  "circular-dependency",
  "invalid-metadata-color",
  "invalid-connection-label"
])

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
  const lastParsedTextRef = useRef<string>("")

  useEffect(() => {
    if (specText === lastParsedTextRef.current) return
    lastParsedTextRef.current = specText
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

  const fixableDiagnostics = useMemo(() => {
    return diagnostics.filter((d) => {
      return d.code && d.path && FIXABLE_DIAGNOSTIC_CODES.has(d.code)
    })
  }, [diagnostics])

  const handleFixAll = () => {
    const fixes = fixableDiagnostics.map((d) => {
      let fixType = d.code!
      let extraData: any = undefined

      if (d.code === "empty-system-name") {
        fixType = "missing-system-name"
      } else if (d.code === "invalid-metadata-version") {
        fixType = "set-default-version"
      } else if (d.code === "unrecognized-type") {
        extraData = { type: "Stage" }
      } else if (d.code === "disconnected-component") {
        fixType = "delete-component"
      } else if (d.code === "unreachable-component") {
        fixType = "connect-from-gateway"
      } else if (d.code === "gateway-to-store" || d.code === "store-to-store") {
        fixType = "insert-stage"
      } else if (d.code === "sink-stage-brick") {
        fixType = "connect-to-store"
      } else if (d.code === "empty-gateway") {
        fixType = "connect-to-stage"
      }

      return {
        path: d.path!,
        fixType,
        extraData
      }
    })

    if (fixes.length > 0) {
      const updated = reconcileSpec(specText, {
        type: "quick-fix-all",
        payload: { fixes }
      })
      if (updated !== specText) {
        setSpecText(updated)
      }
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
        <FocusTab specText={specText} setSpecText={setSpecText} parsedSpec={parsedSpec} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} />
      </div>

      <div
        id="tabpanel-metrics"
        role="tabpanel"
        aria-labelledby="tab-metrics"
        hidden={activeTab !== "metrics"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <MetricsTab parsedSpec={parsedSpec} selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} diagnostics={diagnostics} />
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

            {!yamlSyntaxError && fixableDiagnostics.length > 0 && (
              <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/25 rounded-lg p-2.5 mb-3 font-sans select-none">
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
                        <button
                          onClick={() => handleQuickFix(d.path!, "delete-component")}
                          className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wide bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                        >
                          Delete Component
                        </button>
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
