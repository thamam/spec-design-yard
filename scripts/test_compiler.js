const yaml = require('yaml');

const INITIAL_SPEC = `system:
  name: External Brain v0.2
  components:
    - id: inbox
      type: Store
      name: inbox/
      connections:
        - target: digest_stage
    
    - id: digest_stage
      type: Stage
      name: digest
      connections:
        - target: review_stage
    
    - id: review_stage
      type: Stage
      name: review
      connections:
        - target: commit_stage
    
    - id: commit_stage
      type: Stage
      name: commit
      connections:
        - target: kb_store
        
    - id: kb_store
      type: Store
      name: kb/

    # Attaching Bricks
    - id: b1_schema
      type: Brick
      name: "B1: Schema"
      connections:
        - target: digest_stage
        - target: review_stage

    - id: b2_ledger
      type: Brick
      name: "B2: Ledger"
      connections:
        - target: digest_stage
        - target: commit_stage

    - id: b4_context
      type: Brick
      name: "B4: Context"
      connections:
        - target: digest_stage

    - id: b5_prompt
      type: Brick
      name: "B5: Prompt"
      connections:
        - target: digest_stage
        - target: review_stage

    - id: b6_verify
      type: Brick
      name: "B6: Verify"
      connections:
        - target: review_stage
        - target: commit_stage

    - id: b7_consolidate
      type: Brick
      name: "B7: Consolidate"
      connections:
        - target: commit_stage
        - target: inbox`;

function compileSpecToExcalidrawElements(parsedSpec) {
  if (!parsedSpec?.system?.components) return []
  const elements = []
  const components = parsedSpec.system.components

  // Layout positions registry
  const positions = {}

  // 1. Assign positions to nodes based on logical layout rules
  let coreIdx = 0
  let brickIdx = 0

  components.forEach((comp) => {
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
  components.forEach((comp) => {
    const pos = positions[comp.id] || { x: 100, y: 100 }
    const type = String(comp.type).toLowerCase()
    
    let strokeColor = '#6366f1' // Indigo
    let backgroundColor = 'rgba(99, 102, 241, 0.1)'
    if (type === 'stage') {
      strokeColor = '#c084fc' // Purple
      backgroundColor = 'rgba(168, 85, 247, 0.1)'
    } else if (type === 'brick') {
      strokeColor = '#34d399' // Emerald
      backgroundColor = 'rgba(52, 211, 153, 0.1)'
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
    })
  })

  // 3. Generate Arrows for connections
  components.forEach((comp) => {
    const posSource = positions[comp.id]
    if (!posSource || !comp.connections) return

    comp.connections.forEach((conn) => {
      const posTarget = positions[conn.target]
      if (!posTarget) return

      const arrowId = `arrow-${comp.id}-${conn.target}`
      
      const sx = posSource.x + 95
      const sy = posSource.y + 40
      const tx = posTarget.x + 95
      const ty = posTarget.y + 40

      const dx = tx - sx
      const dy = ty - sy

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
      })
    })
  })

  return elements
}

const parsed = yaml.parse(INITIAL_SPEC);
const elements = compileSpecToExcalidrawElements(parsed);
console.log(`Parsed spec successfully. Found ${parsed.system.components.length} components.`);
console.log(`Compiled elements: ${elements.length}`);
const rects = elements.filter(e => e.type === 'rectangle').map(e => e.id);
console.log("Rectangles:", rects);
const arrows = elements.filter(e => e.type === 'arrow').map(e => e.id);
console.log("Arrows count:", arrows.length);
