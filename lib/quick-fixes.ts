import type { FixType } from "./reconciler"

export const FIXABLE_DIAGNOSTIC_CODES = new Set([
  "missing-system-name",
  "empty-system-name",
  "missing-component-id",
  "missing-component-type",
  "invalid-metadata-object",
  "invalid-connections-array",
  "invalid-connection-object",
  "unrecognized-metadata-key",
  "unrecognized-component-key",
  "unrecognized-system-key",
  "unrecognized-connection-key",
  "connection-case-mismatch",
  "invalid-metadata-status",
  "component-overlap",
  "missing-metadata-description",
  "missing-metadata-owner",
  "invalid-metadata-version",
  "unrecognized-type",
  "self-connection",
  "empty-connection-target",
  "duplicate-connection",
  "invalid-id-format",
  "duplicate-id",
  "orphan-connection",
  "disconnected-component",
  "unreachable-component",
  "gateway-to-store",
  "store-to-store",
  "sink-stage-brick",
  "empty-gateway",
  "circular-dependency",
  "invalid-metadata-color",
  "invalid-connection-label",
  "unused-store",
  "missing-system-metadata",
  "invalid-system-metadata-object",
  "invalid-system-metadata-status",
  "invalid-system-metadata-version",
  "placeholder-system-metadata-description",
  "missing-system-metadata-description",
  "placeholder-system-metadata-owner",
  "missing-system-metadata-owner",
  "unrecognized-system-metadata-key",
  "missing-connection-label",
  "duplicate-connection-label",
  // In the Set (not only prefix-matched) so strict-membership call sites like
  // the Focus tab's per-diagnostic fix button treat it as fixable, matching
  // the Security tab feature that introduced it.
  "stride-secret-leak"
])

export function isFixable(d: { code?: string }): boolean {
  if (!d.code) return false
  return FIXABLE_DIAGNOSTIC_CODES.has(d.code) || d.code.startsWith("stride-")
}

const CODE_TO_FIX_TYPE: Record<string, FixType> = {
  "empty-system-name": "missing-system-name",
  "invalid-metadata-version": "set-default-version",
  "disconnected-component": "delete-component",
  "unreachable-component": "connect-from-gateway",
  "gateway-to-store": "insert-stage",
  "store-to-store": "insert-stage",
  "sink-stage-brick": "connect-to-store",
  "empty-gateway": "connect-to-stage",
  "unused-store": "connect-to-store",
}

export function fixTypeForCode(code: string): FixType | null {
  return CODE_TO_FIX_TYPE[code] ?? null
}
