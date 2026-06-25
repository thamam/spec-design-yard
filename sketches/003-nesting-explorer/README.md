## Variant C: Nesting Explorer

### Design Stance
An encapsulation-first layout designed to manage massive, high-complexity systems. It operates like a file-browser or folder-hierarchy tree explorer, letting you drill into nested layers one level at a time.

### Key Choices
- **Layout:** Three-panel tree workspace. The left side is a system directory tree; the center is the localized YAML editor; the right is a zoomed-in nested visual block editor.
- **Color Palette:** Clean sky blue and slate theme (`bg-slate-50`, `bg-blue-600`) symbolizing logical structures and folders.
- **Typography:** Structure-oriented, focus-weighted size headings.
- **Feel:** Well-organized, structural, and predictable.

### Trade-offs
- **Strong at:** Explaining high-scale modular system boundaries without visual clutter.
- **Weak at:** Flat systems with very few components, where a sidebar and deep breadcrumbs might feel redundant.

### Best For
Architects designing microservice-heavy meshes, Kubernetes fleets, or modular domain-driven system contexts.
