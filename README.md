# Spec-Design-Yard (Spec-Yard)

A **local architecture IDE**: YAML spec + Excalidraw canvas + linter + packet simulator. Your data stays on disk. This is not a multi-user or cloud product, and it is not safe to expose on the public internet.

By mapping architectures from a human-readable **YAML specification**, Spec-Yard combines static analysis (**architectural linting**, including a STRIDE **Security** tab) with a visual **Excalidraw canvas** and a **packet traffic simulator**.

---

## 🚀 Quick Start

```bash
git clone https://github.com/thamam/spec-design-yard.git
cd spec-design-yard
npm install
npm run dev          # binds 127.0.0.1:3000
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** (or [http://localhost:3000](http://localhost:3000)). To use another port: `npm run dev -- -p 3011`.

Optional, later: `npm run install-cli` puts `spec-yard` in `~/.local/bin`. That directory is often **not** on `PATH` — the script prints the `export` and warns if it is missing:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Contributor checks (`npm test`, `npm run build`) are not part of launching the workspace.

**Host bind:** every default launch path (`npm run dev`, `npm run start`, `spec-yard`, CI) listens on loopback `127.0.0.1` only. The project and store APIs have no authentication — anyone who can reach the port can read and overwrite files under the active project. Do not pass `-H 0.0.0.0` and do not put this process on an untrusted network.

Spec-Yard is **project-first**: on the very first launch it prompts once for a project folder, and your spec lives there as `main.spec.yaml` (committable, diffable). Every later launch reopens your last project; switch or create projects anytime from the header badge, or open a specific repo with `spec-yard <dir>`. See [Getting Started](./docs/getting-started.md) for details, including the browser-storage opt-out.

License: proprietary source-available — [LICENSE](./LICENSE). Changelog: [CHANGELOG.md](./CHANGELOG.md). Security reports: [SECURITY.md](./SECURITY.md).

---

## 📖 Documentation Hub

To keep instructions clean and focused, our documentation is granulated into logical guides. Explore the specific folders below to master Spec-Yard:

* 🛠️ **[Getting Started & Available Scripts](./docs/getting-started.md)**  
  Detailed instructions on installation, local development servers, production compilation, and running unit/integration tests with Vitest.

* 📝 **[System Schema & YAML Reference](./docs/schema-and-yaml.md)**  
  The formal architecture specification schema. Learn about top-level metadata blocks, component syntax (IDs, types, positions), connections, and custom attributes.

* 🔍 **[Linter & Architectural Quality Rules](./docs/linter-rules.md)**  
  Deep dive into the static analysis rules enforced by the built-in linter. Learn about error/warning severity flags, anti-pattern detection (e.g. `gateway-to-store`, `store-to-store`), and graph topography checks.

* 💻 **[Workspace Layout & Features](./docs/features-and-workspace.md)**  
  An overview of the dual-pane workspace. Details on the Code editor tab, searchable Tree tab, Focus properties panel, **Security** (STRIDE) tab, and the built-in packet traffic simulator.

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
3. **Test Integrity:** The Vitest suite must pass before merging:
   ```bash
   npm run test
   ```
