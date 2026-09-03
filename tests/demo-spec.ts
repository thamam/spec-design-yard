import { db } from '../lib/db'

/** The External Brain demo many workspace UI tests were written against.
 *  Production no longer auto-loads this; tests that need the 11-component
 *  graph must seed it explicitly. */
export const DEMO_SPEC = `system:
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
        - target: kb_store`

export function seedDemoSpec() {
  db.saveSpec('main', 'External Brain v0.2', DEMO_SPEC)
}
