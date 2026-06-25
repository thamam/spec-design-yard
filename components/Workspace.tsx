import React, { useState, useEffect } from 'react'
import yaml from 'yaml'
import { Folder, FileText, Layers, Code, Minimize2, Sparkles, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'

// Dynamic import for Excalidraw since it is client-only
import dynamic from 'next/dynamic'
const Excalidraw = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw')
    return mod.Excalidraw
  },
  { ssr: false, loading: () => <div className="text-zinc-500 font-medium">Loading Excalidraw Canvas...</div> }
)

const INITIAL_SPEC = `system:
  name: External Brain
  components:
    - id: api_gateway
      type: Gateway
      name: Public API Gateway
      connections:
        - target: inbox

    - id: inbox
      type: Store
      name: Inbox (immutable raw drops)
      connections:
        - target: digest_stage
    
    - id: digest_stage
      type: Stage
      name: Digest Stage (agent processing)
      connections:
        - target: review_stage
    
    - id: review_stage
      type: Stage
      name: Review Stage (human/policy approval)
      connections:
        - target: commit_stage
    
    - id: commit_stage
      type: Stage
      name: Commit Stage (merging to main)
      connections:
        - target: kb_store
        
    - id: kb_store
      type: Store
      name: Knowledge Base (kb/)

    # Attaching Bricks
    - id: schema_file
      type: Brick
      name: B1: Schema (SCHEMA.md)
      connections:
        - target: digest_stage
        - target: review_stage

    - id: ledger_files
      type: Brick
      name: B2: Ledger (index + log)
      connections:
        - target: digest_stage
        - target: commit_stage`

// Helper function to generate Excalidraw element coordinates dynamically from YAML AST
function compileSpecToExcalidrawElements(parsedSpec: any): any[] {
  if (!parsedSpec?.system?.components) return []
  const elements: any[] = []
  const components = parsedSpec.system.components

  // Layout positions registry
  const positions: Record<string, { x: number; y: number }> = {}

  // 1. Assign positions to nodes based on logical layout rules
  let coreIdx = 0
  let brickIdx = 0

  components.forEach((comp: any) => {
    const type = String(comp.type).toLowerCase()
    
    if (type === 'brick') {
      // Lay out bricks in a row below the core loop
      positions[comp.id] = {
        x: 100 + brickIdx * 260,
        y: 380,
      }
      brickIdx++
    } else {
      // Lay out core stages and stores in a horizontal sequence
      positions[comp.id] = {
        x: 60 + coreIdx * 250,
        y: 160,
      }
      coreIdx++
    }
  })

  // 2. Generate Rectangle & Text elements for each component
  components.forEach((comp: any) => {
    const pos = positions[comp.id] || { x: 100, y: 100 }
    const type = String(comp.type).toLowerCase()
    
    // Determine colors matching our HUD and Excalidraw specs
    let strokeColor = '#6366f1' // Indigo
    let backgroundColor = 'rgba(99, 102, 241, 0.1)'
    if (type === 'stage') {
      strokeColor = '#c084fc' // Purple
      backgroundColor = 'rgba(168, 85, 247, 0.1)'
    } else if (type === 'brick') {
      strokeColor = '#34d399' // Emerald
      backgroundColor = 'rgba(52, 211, 153, 0.1)'
    } else if (type === 'gateway') {
      strokeColor = '#f59e0b' // Amber
      backgroundColor = 'rgba(245, 158, 11, 0.1)'
    }

    const rectId = comp.id
    const textId = `text-${comp.id}`

    // Create the container Rectangle
    elements.push({
      type: 'rectangle',
      id: rectId,
      x: pos.x,
      y: pos.y,
      width: 190,
      height: 80,
      strokeColor,
      backgroundColor,
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 1.5,
      roundness: { type: 3 }, // Rounded corners
      boundElements: [{ id: textId, type: 'text' }],
    })

    // Create the bound Label text element
    const labelText = `${comp.name || comp.id}\n[${comp.type || 'Unit'}]`
    elements.push({
      type: 'text',
      id: textId,
      containerId: rectId,
      x: pos.x + 5,
      y: pos.y + 15,
      width: 180,
      height: 50,
      text: labelText,
      fontSize: 14,
      fontFamily: 1, // Virgil
      strokeColor: '#f4f4f5', // High contrast white
      textAlign: 'center',
      verticalAlign: 'middle',
      originalText: labelText,
      autoResize: true,
    })
  })

  // 3. Generate Arrows for connections
  components.forEach((comp: any) => {
    const posSource = positions[comp.id]
    if (!posSource || !comp.connections) return

    comp.connections.forEach((conn: any) => {
      const posTarget = positions[conn.target]
      if (!posTarget) return

      const arrowId = `arrow-${comp.id}-${conn.target}`
      
      // Calculate delta offsets between center of shapes
      const sx = posSource.x + 95
      const sy = posSource.y + 40
      const tx = posTarget.x + 95
      const ty = posTarget.y + 40

      const dx = tx - sx
      const dy = ty - sy

      // Brick arrows are emerald, core arrows are zinc
      const isBrickConn = comp.type?.toLowerCase() === 'brick' || conn.target?.toLowerCase() === 'brick'
      const strokeColor = isBrickConn ? '#34d399' : '#52525b'

      elements.push({
        type: 'arrow',
        id: arrowId,
        x: sx,
        y: sy,
        width: Math.abs(dx),
        height: Math.abs(dy),
        points: [
          [0, 0],
          [dx, dy],
        ],
        strokeColor,
        strokeWidth: 1.8,
        roughness: 1.5,
        endArrowhead: 'arrow',
        startBinding: { elementId: comp.id, fixedPoint: [0.5, 0.5] },
        endBinding: { elementId: conn.target, fixedPoint: [0.5, 0.5] },
      })
    })
  })

  return elements
}

export default function Workspace() {
  const [specText, setSpecText] = useState(INITIAL_SPEC)
  const [activeTab, setActiveTab] = useState<'editor' | 'tree' | 'focus'>('editor')
  const [parsedSpec, setSpecParsed] = useState<any>(null)
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    system: true,
    components: true,
    schema_file: false,
    ledger_files: false,
  })

  // Set isMounted to true on client-side mount
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Parse YAML dynamically as the user types
  useEffect(() => {
    try {
      const parsed = yaml.parse(specText)
      if (parsed && typeof parsed === 'object') {
        setSpecParsed(parsed)
      }
    } catch (e) {
      // Keep previous valid parse on typo
    }
  }, [specText])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSpecText(e.target.value)
  }

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }))
  }

  // Get only the spec block for the currently selected unit
  const getSelectedUnitSpec = () => {
    if (!selectedUnit || !parsedSpec) return 'Select a component on the diagram to inspect its isolated spec.'
    try {
      const component = parsedSpec?.system?.components?.find((c: any) => c.id === selectedUnit)
      if (component) {
        return yaml.stringify({ component })
      }
      return `No component found with ID: ${selectedUnit}`
    } catch (e) {
      return 'Error extracting focused spec.'
    }
  }

  // Compile active spec to dynamic Excalidraw element payload
  const currentElements = compileSpecToExcalidrawElements(parsedSpec)

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      
      {/* Top Workspace Nav Header */}
      <header className="h-14 border-b border-zinc-850 bg-zinc-900/90 backdrop-blur flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-600/20">OD</div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              Spec-Design Yard <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full font-mono border border-indigo-500/10">v0.10.0</span>
            </h1>
            <p className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase">Interactive AI-Based System Design</p>
          </div>
        </div>

        {/* Sync and Pull Request Actions */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            TDD Guard Active
          </span>
          <button className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-600/15">
            Create Pull Request
          </button>
        </div>
      </header>

      {/* Main Sidebar & Workspace Split */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Left Pane: Multi-View Spec Editor */}
        <section data-testid="editor-panel" className="w-[42%] border-r border-zinc-850 bg-zinc-900 flex flex-col overflow-hidden z-20">
          
          {/* Interactive Selector Tabs for different Views */}
          <div className="h-11 border-b border-zinc-850 bg-zinc-950/40 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
              <button 
                onClick={() => setActiveTab('editor')} 
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'editor' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Code className="w-3.5 h-3.5" />
                Raw YAML
              </button>
              <button 
                onClick={() => setActiveTab('tree')} 
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'tree' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Layers className="w-3.5 h-3.5" />
                Collapsible Tree
              </button>
              <button 
                onClick={() => setActiveTab('focus')} 
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'focus' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Selected Focus
              </button>
            </div>
            <span className="text-[9px] font-mono text-zinc-500 font-semibold bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-800">
              Spec Views
            </span>
          </div>

          {/* Dynamic Tab Content Render */}
          <div className="flex-1 overflow-hidden relative bg-zinc-950/80">
            
            {/* VIEW 1: RAW CODE VIEW */}
            {activeTab === 'editor' && (
              <div className="w-full h-full flex font-mono text-[12.5px] leading-relaxed">
                <textarea 
                  data-testid="spec-textarea"
                  id="spec-textarea"
                  value={specText}
                  onChange={handleTextareaChange}
                  className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 p-5 text-zinc-300 font-mono resize-none h-full overflow-y-auto leading-6" 
                  spellCheck="false"
                />
              </div>
            )}

            {/* VIEW 2: COLLAPSIBLE HIERARCHICAL TREE VIEW */}
            {activeTab === 'tree' && (
              <div className="w-full h-full overflow-y-auto p-5 text-sm select-none">
                <div className="mb-4">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">System Directory Structure</span>
                </div>
                
                {parsedSpec?.system ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-zinc-200 cursor-pointer" onClick={() => toggleNode('system')}>
                      {expandedNodes.system ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                      <Folder className="w-4 h-4 text-indigo-400" />
                      <span className="font-semibold">{parsedSpec.system.name || 'System Root'}</span>
                    </div>

                    {expandedNodes.system && (
                      <div className="pl-6 space-y-2 border-l border-zinc-800 ml-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 cursor-pointer" onClick={() => toggleNode('components')}>
                          {expandedNodes.components ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                          <Layers className="w-4 h-4 text-emerald-400" />
                          <span className="font-medium text-zinc-400">components</span>
                        </div>

                        {expandedNodes.components && (
                          <div className="pl-6 space-y-2 border-l border-zinc-800 ml-2">
                            {parsedSpec.system.components?.map((comp: any) => (
                              <div key={comp.id} className="space-y-1.5">
                                <div 
                                  onClick={() => {
                                    toggleNode(comp.id)
                                    setSelectedUnit(comp.id)
                                  }}
                                  className={`flex items-center justify-between py-1 px-2.5 rounded border transition-all cursor-pointer ${selectedUnit === comp.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-200' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 text-zinc-300'}`}
                                >
                                  <span className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                    <span className="font-mono text-xs">{comp.id}</span>
                                  </span>
                                  <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1 rounded uppercase">{comp.type}</span>
                                </div>

                                {expandedNodes[comp.id] && (
                                  <div className="pl-5 py-1 text-[11.5px] text-zinc-400 font-mono space-y-1 bg-zinc-900/20 rounded-md p-2">
                                    <div><span className="text-zinc-600">name:</span> {comp.name}</div>
                                    {comp.connections && (
                                      <div>
                                        <span className="text-zinc-600">connections:</span>
                                        {comp.connections.map((conn: any, idx: number) => (
                                          <div key={idx} className="pl-3 text-emerald-400/80">→ {conn.target}</div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-xs">Awaiting valid YAML input to render tree structure...</div>
                )}
              </div>
            )}

            {/* VIEW 3: SELECTED FOCUS VIEW */}
            {activeTab === 'focus' && (
              <div className="w-full h-full flex flex-col p-5 font-mono text-xs overflow-hidden">
                <div className="mb-4">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Option 3: Selected Diagram Unit Focus</span>
                </div>
                {selectedUnit ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="h-8 px-3 border border-indigo-500/30 bg-indigo-500/5 rounded-t-lg flex items-center justify-between shrink-0">
                      <span className="font-mono text-indigo-300 text-[11px]">Selected: <span className="font-bold">{selectedUnit}</span></span>
                      <button onClick={() => setSelectedUnit(null)} className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold font-sans">Clear Selection</button>
                    </div>
                    <pre className="flex-1 border-x border-b border-zinc-800 bg-zinc-950 p-4 rounded-b-lg overflow-auto leading-6 text-emerald-400/90 whitespace-pre-wrap select-text">{getSelectedUnitSpec()}</pre>
                  </div>
                ) : (
                  <div className="flex-1 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                    <Minimize2 className="w-8 h-8 text-zinc-600 mb-2 animate-pulse" />
                    <p className="text-xs font-semibold">Diagram Selection Sync Active</p>
                    <p className="text-[11px] text-zinc-600 mt-1 max-w-xs">
                      Click any component or container box in the Excalidraw diagram, and this view will automatically isolate and show only its specific spec block.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Bottom Prompt Gutter */}
          <div className="h-12 border-t border-zinc-850 px-4 bg-zinc-950 flex items-center justify-between">
            <div className="flex items-center gap-2 w-full">
              <span className="text-indigo-400 font-bold text-xs shrink-0 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Copilot:</span>
              <input type="text" placeholder="Add B7: Consolidation brick connecting to inbox..." className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1 text-xs w-full focus:outline-none focus:border-indigo-500 text-zinc-300 placeholder-zinc-600 transition-colors" />
            </div>
          </div>
        </section>

        {/* Right Pane: Direct Excalidraw Embed Canvas */}
        <section data-testid="canvas-panel" className="flex-1 bg-zinc-950 flex flex-col overflow-hidden relative">
          
          {/* Excalidraw Component Container with SPEC-HASH VERSION RE-RENDER */}
          <div className="flex-1 relative overflow-hidden" id="excalidraw-container">
            {isMounted ? (
              <Excalidraw 
                key={specText.length + '-' + currentElements.length} // Force re-render on spec content modification
                initialData={{
                  elements: currentElements,
                  appState: {
                    viewBackgroundColor: '#09090b',
                    theme: 'dark',
                    currentItemStrokeColor: '#a855f7',
                    currentItemFontFamily: 1, // Virgil Hand Font
                    gridSize: 20,
                    activeTool: { type: 'selection' }
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-950 border border-dashed border-zinc-800 m-4 rounded-xl">
                <Layers className="w-12 h-12 text-zinc-700 mb-3" />
                <h4 className="text-sm font-bold text-zinc-400">Excalidraw Workspace Sandbox</h4>
                <p className="text-xs text-zinc-600 mt-1 max-w-sm">
                  Excalidraw component renders dynamically on client load to fully support local-first canvas sketching and gesture tracing.
                </p>
              </div>
            )}
          </div>

          {/* Floating Interactive Guide for testing */}
          <div className="absolute bottom-6 right-6 bg-zinc-900/95 border border-zinc-800 rounded-lg p-4 shadow-2xl text-[11px] text-zinc-400 max-w-sm z-30 backdrop-blur-md">
            <p className="font-semibold text-zinc-200 mb-1.5 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              💡 Option B Sandbox Guide
            </p>
            <div className="space-y-1 font-mono text-[10px] text-zinc-500 leading-relaxed">
              <p>1. Open <span className="text-indigo-400">Excalidraw Canvas</span> on the right.</p>
              <p>2. Select any stage (e.g. <span className="text-indigo-300">digest_stage</span>) or brick.</p>
              <p>3. Toggle the <span className="text-indigo-400">Selected Focus</span> tab on the left to see Selection Sync (Option 3) isolate the spec block automatically!</p>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
