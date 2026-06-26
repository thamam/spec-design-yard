# Spec-Design Yard — Project Manifesto & Vision

Maintained by Sentinel (Hermes agent, EC2).

## Core Development Vision (Approved June 2026)

Our absolute highest and only priority is **perfect bidirectional synchronization** and the evolution of both interfaces to an **elite, world-class standard**.

### 1. The Blueprint-First Thesis
Downstream AI systems (PRD generation, task break-downs, code compilers, auto-test generation) are heavily bottlenecked by blueprint drift. If the underlying blueprint—represented by the structured Spec, the Visual Diagram, or both—is tightly synchronized and kept strictly honest, then:
* Translation to code becomes trivial.
* Task planning remains deterministic.
* AI-driven changes remain scoped and structurally sound.

### 2. High-Leverage Engineering Roadmap
To bring both the Spec and Diagram interfaces to an elite standard, all future development focuses on these key vectors:

* **Elite Spec Editor:**
  * Auto-completions for types, connections, and metadata.
  * Inline validation/linting (e.g. flagging a connection target that does not exist in the component list).
  * Smooth transition between Raw YAML, collapsible tree structures, and selected-node focus panels.

* **Elite Diagram Canvas:**
  * Rigid geometry auto-layout combined with organic sketchy rendering.
  * Rich gesture support (drag-to-connect, double-click-to-rename, delete element triggers).

* **Strict AST Reconciliation Layer (The Contract Mediator):**
  * A robust, fail-safe AST translation engine that translates coordinates, node creations, renames, and link adjustments between the visual Canvas state and the serialized YAML text state without parsing collisions or loss of comments.

