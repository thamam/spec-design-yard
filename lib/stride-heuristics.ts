/** Placeholder written by the stride-secret-leak quick-fix. */
export const SENSITIVE_VALUE_PLACEHOLDER = "${SENSITIVE_VALUE_PLACEHOLDER}"

/** Gateway identity mitigation applied by stride-spoofing. Must also satisfy the channel matcher so Fix All does not reopen Tampering. */
export const SPOOFING_FIX_LABEL = "authenticated TLS auth-token request"

/** Connection channel mitigation applied by stride-tampering. Must also satisfy the identity matcher so Fix All does not reopen Spoofing. */
export const TAMPERING_FIX_LABEL = "encrypted TLS auth-token flow"

const INSECURE_LABEL =
  /(?:^|[^a-zA-Z0-9])(unsecure|insecure|unauth|nonsecure|unencrypted|plaintext|cleartext)(?:$|[^a-zA-Z0-9])/i

// Specific identity mitigations — a lone "auth" / "secure" / "token" is not enough.
const IDENTITY_MITIGATION =
  /oauth|oidc|openid|jwt|mtls|m-tls|auth-token|bearer|authenticated|saml|identity-provider/i

// Specific transit mitigations — any non-empty label used to clear Tampering.
const CHANNEL_MITIGATION =
  /(?:^|[^a-zA-Z0-9])(tls|https|grpc|mtls|m-tls|ssh|encrypted)(?:$|[^a-zA-Z0-9])/i

const SENSITIVE_KEY =
  /(?:^|[^a-zA-Z0-9])(secret|password|token|api[_-]?key|apikey|private[_-]?key|passwd|aws[_-]?secret|secret[_-]?access[_-]?key|access[_-]?key[_-]?id|client[_-]?secret|refresh[_-]?token|session[_-]?secret)(?:$|[^a-zA-Z0-9])/i

const SECRET_PLACEHOLDER =
  /^(todo|tbd|placeholder|\[add description\]|\[add owner\]|none|disabled|null|false)$/i

const SECRET_VALUE_SHAPE =
  /\bAKIA[0-9A-Z]{16}\b|\bsk[_-]live[_-][A-Za-z0-9]{8,}\b|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/

const STRIDE_CATEGORY_DEDUCTIONS: { code: string; points: number }[] = [
  { code: "stride-spoofing", points: 15 },
  { code: "stride-tampering", points: 15 },
  { code: "stride-repudiation", points: 5 },
  { code: "stride-information-disclosure", points: 15 },
  { code: "stride-elevation-of-privilege", points: 15 },
  { code: "stride-denial-of-service", points: 15 },
  { code: "stride-secret-leak", points: 15 },
]

export function isIdentityMitigationLabel(label: string): boolean {
  const text = String(label ?? "")
  if (!text.trim() || INSECURE_LABEL.test(text)) return false
  return IDENTITY_MITIGATION.test(text)
}

export function isChannelMitigationLabel(label: string): boolean {
  const text = String(label ?? "")
  if (!text.trim() || INSECURE_LABEL.test(text)) return false
  return CHANNEL_MITIGATION.test(text)
}

export function countAnalyzableComponents(parsedSpec: any): number {
  const components = parsedSpec?.system?.components
  if (!Array.isArray(components)) return 0
  let count = 0
  for (const comp of components) {
    if (comp && typeof comp === "object" && typeof comp.id === "string" && comp.id.trim() !== "") {
      count++
    }
  }
  return count
}

export type StrideScoreResult =
  | { status: "unscored"; score: null; analyzedComponentCount: number }
  | { status: "scored"; score: number; analyzedComponentCount: number }

/**
 * STRIDE compliance score. Starts at 100 and subtracts per-category findings
 * only when there is something to analyze. An empty diagram is unscored —
 * never a perfect 100, because that used to mean "nothing modeled."
 */
export function computeStrideComplianceScore(
  diagnostics: { code?: string }[],
  componentCount: number
): StrideScoreResult {
  if (componentCount <= 0) {
    return { status: "unscored", score: null, analyzedComponentCount: 0 }
  }
  const present = new Set<string>()
  for (const diagnostic of diagnostics || []) {
    if (diagnostic?.code) present.add(diagnostic.code)
  }
  let score = 100
  for (const { code, points } of STRIDE_CATEGORY_DEDUCTIONS) {
    if (present.has(code)) score -= points
  }
  return {
    status: "scored",
    score: Math.max(0, score),
    analyzedComponentCount: componentCount,
  }
}

export function isSecretPlaceholderValue(value: string): boolean {
  const trimmed = String(value ?? "").trim()
  return trimmed === "" || trimmed.startsWith("${") || SECRET_PLACEHOLDER.test(trimmed)
}

export function looksLikeSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(String(key ?? ""))
}

export function looksLikeSecretValue(value: string): boolean {
  const text = String(value ?? "")
  if (isSecretPlaceholderValue(text)) return false
  return SECRET_VALUE_SHAPE.test(text)
}

export function shouldFlagSecretField(key: string, value: unknown): boolean {
  if (value === undefined || value === null || typeof value === "boolean" || typeof value === "object") {
    return false
  }
  const valueStr = String(value)
  if (isSecretPlaceholderValue(valueStr)) return false
  return looksLikeSensitiveKey(key) || looksLikeSecretValue(valueStr)
}

export function formatPreservedSecretComment(original: string): string {
  const safe = String(original ?? "").replace(/\s+/g, " ").trim().slice(0, 240)
  return ` previous value preserved: ${safe}`
}
