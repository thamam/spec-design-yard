# Spec-Design-Yard (Spec-Yard)

Welcome to **Spec-Design-Yard**! This is a state-of-the-art interactive visual workspace designed for defining, analyzing, and simulating complex system architectures. 

By mapping architectures from a human-readable **YAML specification**, Spec-Yard combines strict static analysis (**architectural linting**) with beautiful visual representation (**Excalidraw canvas**) and dynamic modeling (**active packet traffic simulator**).

---

## 🚀 Quick Start

Get your design workspace up and running locally in four short steps:

```bash
# 1. Install dependencies
npm install

# 2. (One-time) put the `spec-yard` launcher on your PATH
npm run install-cli

# 3. Run the development server
npm run dev

# 4. Verify the system tests
npm run test
```

Once running, navigate to **[http://localhost:3000](http://localhost:3000)** in your browser to load the workspace.

Spec-Yard is **project-first**: on the very first launch it prompts once for a project folder, and your spec lives there as `main.spec.yaml` (committable, diffable). Every later launch reopens your last project; switch or create projects anytime from the header badge, or open a specific repo with `spec-yard <dir>`. See [Getting Started](./docs/getting-started.md) for details, including the browser-storage opt-out.

---

## 📖 Documentation Hub

To keep instructions clean and focused, our documentation is granulated into logical guides. Explore the specific folders below to master Spec-Yard:

* 🛠️ **[Getting Started & Available Scripts](./docs/getting-started.md)**  
  Detailed instructions on installation, local development servers, production compilation, and running unit/integration tests with Vitest.

* 📝 **[System Schema & YAML Reference](./docs/schema-and-yaml.md)**  
  The formal architecture specification schema. Learn about top-level metadata blocks, component syntax (IDs, types, positions), connections, and custom attributes.

* 🔍 **[Linter & Architectural Quality Rules](./docs/linter-rules.md)**  
  Deep dive into the 30+ static analysis rules enforced by our built-in linter. Learn about error/warning severity flags, anti-pattern detection (e.g. `gateway-to-store`, `store-to-store`), and graph topography checks.

* 💻 **[Workspace Layout & Features](./docs/features-and-workspace.md)**  
  An overview of the dual-pane workspace. Details on the Code editor tab, searchable Tree tab, comprehensive Focus properties panel, and the built-in packet traffic simulator.

---

## 🛠️ Tech Stack & Architecture

Spec-Yard is engineered with premium modern web technologies:
* **Framework:** Next.js (Pages router) & React 18
* **Styling:** TailwindCSS & PostCSS
* **Interactive Canvas:** Excalidraw Canvas
* **Testing:** Vitest with JSDOM and React Testing Library
* **YAML Parser:** Standard JS YAML Engine

---

## 🏆 Development Standards

As Sentinel maintaining the yard, we adhere to absolute quality gates:
1. **Strict TDD:** Define test specs and edge cases before implementing features.
2. **Compile Verification:** The build must clean-compile on Next.js:
   ```bash
   npm run build
   ```
3. **Test Integrity:** All tests (currently 465) must pass successfully before merging:
   ```bash
   npm run test
   ```
