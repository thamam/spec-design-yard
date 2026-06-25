## Variant D: Excalidraw HUD

### Design Stance
A visual developer workspace focused on hand-drawn, interactive diagrams. This combines the high-contrast professional dark-mode of the HUD with an open-source, Excalidraw-inspired "sketch" look. 

### Key Choices
- **Layout:** High-density split screen with spec editor and layout controls on the left; free-form diagram canvas on the right.
- **Aesthetic:** Uses custom SVG displacement and noise turbulence filters (`feTurbulence` + `feDisplacementMap`) to deform straight lines, giving them an authentic sketchy, hand-drawn roughness directly in CSS.
- **Typography:** Coupled with `Architects Daughter` Google font (mimicking Excalidraw's Virgil hand font).
- **Interactive State:** Features a live header control to swap aesthetics instantly between perfect "Vector" and sketchy "Excalidraw Sketch" modes.
- **Data Model:** Modeled using the real-world **External Brain — v0.2** specification (Inbox → Digest → Review → Commit + B1/B2/B4-B7 Bricks).

### Trade-offs
- **Strong at:** Feeling organic, friendly, highly approachable, and inviting human editing without looking intimidating.
- **Weak at:** Complex rendering performance if there are over thousands of elements, though negligible for standard system architecture specs.

### Best For
Designers and developers who believe architecture documentation should feel like a collaborative whiteboard session.
