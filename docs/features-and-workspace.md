# Workspace & Key Features

The Spec-Yard provides a split-pane, high-fidelity visual IDE designed specifically for system architecture engineering. This document highlights the layout, interactive panels, and powerful features of the workspace.

---

## 1. Split-Pane Layout

The workspace is split into two major resizable columns:
1. **Left Panel: The Editor** — Houses editing interfaces, system analysis tabs, and simulator metrics.
2. **Right Panel: The Canvas** — Interactive blueprint renderer powered by Excalidraw.

You can drag the divider between the two panels to adjust your workspace split to your preferred ratio.

---

## 2. Left Panel: The Tabbed Editor

The Editor provides four specialized interfaces for managing and examining your design:

### A. Code Tab
* **YAML editor:** Full-height plain-text editor for the raw spec.
* **Inline linter feedback:** If you introduce an error or warning, a list of diagnostics appears immediately below the text editor with click-to-highlight links pointing to the error site.
* **Autocomplete:** Provides smart suggestions as you type to speed up component and metadata entries.

### B. Tree Tab
* **Hierarchy explorer:** Visualizes your entire system structure as a searchable nested folder tree: System Name ➔ Metadata ➔ Components ➔ Connections.
* **Integrated Search:** Quickly filter through large architectures by matching keywords in component names, IDs, types, or connection labels.

### C. Focus Tab (Selected Inspector)
When you click a component on the visual canvas or select it in the editor, the Focus Tab activates to reveal deep control options:
* **Inline Diagnostics:** Displays any linter warnings or errors specifically belonging to this single component.
* **Property Editor:** Edit the component’s display name, type, and coordinate positions without touching the YAML raw text.
* **Component Metadata Editor:** Manage component-level attributes (owner, description, status, and customized visualization colors).
* **Connections Manager:** Easily append, edit, or delete incoming and outgoing connections using friendly dropdown controls.
* **Duplication Tool:** Create a perfect clone of the selected component with one click. The duplicator automatically assigns a new unique ID and selects the clone.
* **Quick-Fixes:** Apply automated recommendations (e.g. resolve case mismatches, supply default descriptions, clean up redundant targets, or apply auto-layout fixes).

### D. Metrics Tab (The System Simulator)
Spec-Yard contains a built-in architectural simulator to model data packets streaming through your pipeline:
* **Packet Configuration:** Adjust simulation variables like base packet speed (ms delay per hop) and packet loss percentage.
* **Presets Selector:** Apply dynamic simulation profiles (e.g. "Optimal Processing," "High Data Loss," "System Congestion," or your own custom simulation presets).
* **Live Ingestion Monitor:** Stream real-time traffic and watch packets traverse the canvas.
* **Log Panel:** Inspect active connection logs and data transfer rates across each service queue.
* **Performance Diagnostic Report:** On simulation completion, the analyzer displays a full report outlining throughput, latency, bottlenecks, and package failure summaries.

---

## 3. Right Panel: The Visual Canvas

The visual canvas translates your text specification into an elegant graphical diagram:
* **Excalidraw Integration:** Nodes are styled as clean boxes indicating their types (Gateways have distinctive input borders, Stores resemble cylinders, etc.) and are linked by clean directional lines mapping data pipelines.
* **Bi-directional Selection:** Clicking a component on the visual canvas automatically selects it, focuses the editor, and loads its properties into the Focus Tab.
* **Drag-and-Drop Positioning:** Move components around on the canvas to organize your layout; their updated coordinate variables (`x` and `y`) write back to your YAML spec automatically.
* **Grid-View Rename:** Rename component nodes directly on the canvas grid with inline input fields.
* **Layers Visibility:** Toggle layers (e.g. hide Brick sidecars, hide metadata annotations, or filter connection labels) to view high-level maps or deep low-level schematics.

---

## 4. Operational Safety

* **Project-First Persistence:** Your spec lives as files in a project folder (`main.spec.yaml` + `.specyard/` sidecar), with conflict protection against external edits. The active project is remembered in `~/.specyard/config.json`, so every launch reopens where you left off; the first launch ever prompts once with a suggested folder. See "Working in a Project" in `getting-started.md`.
* **Project Badge & Picker:** The header always shows the active project folder's name (hover for the full path). Clicking it opens the picker: the full path, a field to switch to another project directory (with create-if-missing), and a recent-projects list. Switching reloads the workspace against the new folder's files; a tab still open on the previous project has its saves refused. The picker only answers loopback requests.
* **Clean Slate for Fresh Projects:** A project with no `main.spec.yaml` yet opens a labeled blank spec (`# New project …`), never the built-in demo, and nothing is written to the folder until your first edit.
* **Browser-Storage Opt-Out:** For sketching without filesystem writes, the picker offers "Use browser storage instead" — specs then auto-save to the browser's `localStorage` (with an in-memory fallback), which is also where the built-in demo spec lives. The opt-out is remembered until you pick a project again.
* **Undo/Redo Engine:** Standard editor commands are supported across all panel actions. Pressing `Ctrl + Z` (or `Cmd + Z` on macOS) reverses your edits step-by-step. `Ctrl + Y` (or `Cmd + Shift + Z`) re-applies changes.
