# Design: Dynamic Linter Messages to Prevent Key-List Drift

This document details the key technical decisions, rationales, and rejected alternatives for establishing dynamic, drift-proof diagnostic strings.

## Decision 1: Deterministic Sorting of Option Sets
We SHALL transform our human-readable message sets using:
```typescript
Array.from(collection).sort().join(", ")
```
- **Rationale:** JavaScript `Set` iteration order is determined by insertion order. To guarantee consistent, reliable strings across arbitrary platforms, unit test runs, and compilers, we must explicitly sort the candidate strings alphabetically prior to joining.
- **Rejected Alternative:** `Array.from(collection).join(", ")`. Rejected because any future reordering of set initializations would break brittle snapshot tests or end-user search patterns due to unexpected string shifts.

## Decision 2: Formatting Case-Insensitive / Standardized Casing Lists
For component types, the active validating set uses lowercased strings (`["store", "stage", "brick", "gateway"]`), but the messages should suggest standard PascalCase formatting:
```typescript
Array.from(validTypes)
  .map(t => t.charAt(0).toUpperCase() + t.slice(1))
  .sort()
  .join(", ")
```
- **Rationale:** Keeps the user-facing suggested values readable and matching standard spec patterns (e.g. `Stage`), while keeping the internal runtime validation fast and clean.
- **Rejected Alternative:** Hardcoding the capitalized list. Rejected because it violates the absolute synchronization invariant: if a new type is ever introduced to `validTypes`, the capitalized suggested list would immediately drift.

## Decision 3: Comprehensive Alignment of Dynamic Rules
We SHALL apply this pattern to all 8 static lists in `lib/linter.ts`:
1. `allowedSystemKeys`
2. `allowedSysMetaKeys`
3. `validStatuses` (system metadata)
4. `allowedComponentKeys`
5. `validTypes` (capitalized)
6. `validStatuses` (component metadata)
7. `validColors` (component metadata)
8. `allowedConnectionKeys`

- **Rationale:** Uniformity across the system ensures high developer predictability and high-signal, self-documenting diagnostic results.
