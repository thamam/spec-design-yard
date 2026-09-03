import { describe, test, expect } from "vitest"
import {
  computeStrideComplianceScore,
  countAnalyzableComponents,
  isIdentityMitigationLabel,
  isChannelMitigationLabel,
  shouldFlagSecretField,
  looksLikeSecretValue,
  looksLikeSensitiveKey,
  isSecretPlaceholderValue,
  formatPreservedSecretComment,
  TAMPERING_FIX_LABEL,
  SPOOFING_FIX_LABEL,
} from "../lib/stride-heuristics"

describe("countAnalyzableComponents", () => {
  test("returns 0 for missing, empty, or non-array components", () => {
    expect(countAnalyzableComponents(null)).toBe(0)
    expect(countAnalyzableComponents({})).toBe(0)
    expect(countAnalyzableComponents({ system: { name: "Empty", components: [] } })).toBe(0)
    expect(countAnalyzableComponents({ system: { name: "Empty", components: "nope" } })).toBe(0)
    expect(countAnalyzableComponents({ system: { name: "Empty" } })).toBe(0)
  })

  test("ignores null entries and components without an id", () => {
    expect(
      countAnalyzableComponents({
        system: {
          components: [null, { type: "Stage" }, { id: "  " }, { id: "worker", type: "Stage" }],
        },
      })
    ).toBe(1)
  })
})

describe("computeStrideComplianceScore", () => {
  test("empty / no components is unscored — never 100 Excellent", () => {
    const result = computeStrideComplianceScore([], 0)
    expect(result.status).toBe("unscored")
    expect(result.score).toBeNull()
    expect(result.score).not.toBe(100)
  })

  test("hypothesis: score starts at 100 and subtracts per-category findings", () => {
    const clean = computeStrideComplianceScore([], 1)
    expect(clean).toEqual({ status: "scored", score: 100, analyzedComponentCount: 1 })

    const oneWarning = computeStrideComplianceScore([{ code: "stride-tampering" }], 2)
    expect(oneWarning).toEqual({ status: "scored", score: 85, analyzedComponentCount: 2 })

    const repudiation = computeStrideComplianceScore([{ code: "stride-repudiation" }], 1)
    expect(repudiation.score).toBe(95)

    const all = computeStrideComplianceScore(
      [
        { code: "stride-spoofing" },
        { code: "stride-tampering" },
        { code: "stride-repudiation" },
        { code: "stride-information-disclosure" },
        { code: "stride-elevation-of-privilege" },
        { code: "stride-denial-of-service" },
        { code: "stride-secret-leak" },
      ],
      3
    )
    expect(all.score).toBe(5)

    const flooded = computeStrideComplianceScore(
      [
        { code: "stride-spoofing" },
        { code: "stride-tampering" },
        { code: "stride-information-disclosure" },
        { code: "stride-elevation-of-privilege" },
        { code: "stride-denial-of-service" },
        { code: "stride-secret-leak" },
        { code: "stride-repudiation" },
      ],
      4
    )
    expect(flooded.score).toBe(5)
  })

  test("duplicate findings in the same category only subtract once", () => {
    const result = computeStrideComplianceScore(
      [{ code: "stride-tampering" }, { code: "stride-tampering" }],
      1
    )
    expect(result.score).toBe(85)
  })

  test("non-STRIDE diagnostics do not change the score", () => {
    const result = computeStrideComplianceScore([{ code: "missing-system-metadata" }], 1)
    expect(result.score).toBe(100)
  })

  test("treats a missing diagnostics list as empty and floors a theoretical overflow at 0", () => {
    expect(computeStrideComplianceScore(undefined as any, 1).score).toBe(100)
    expect(computeStrideComplianceScore([{ code: undefined }], 1).score).toBe(100)
  })
})

describe("STRIDE label matchers", () => {
  test("a lone short keyword does not count as identity or channel mitigation", () => {
    for (const label of ["auth", "secure", "token", "verify", "validate", "TLS", "https"]) {
      if (label.toLowerCase() === "tls" || label.toLowerCase() === "https") {
        expect(isChannelMitigationLabel(label)).toBe(true)
        expect(isIdentityMitigationLabel(label)).toBe(false)
      } else {
        expect(isIdentityMitigationLabel(label)).toBe(false)
        expect(isChannelMitigationLabel(label)).toBe(false)
      }
    }
  })

  test("specific identity mitigations clear spoofing, not tampering, unless they also name a channel", () => {
    expect(isIdentityMitigationLabel("oauth bearer")).toBe(true)
    expect(isChannelMitigationLabel("oauth bearer")).toBe(false)
    expect(isIdentityMitigationLabel("authenticated TLS auth-token request")).toBe(true)
    expect(isChannelMitigationLabel("authenticated TLS auth-token request")).toBe(true)
  })

  test("insecure wording never counts as a mitigation", () => {
    expect(isIdentityMitigationLabel("authenticated over insecure channel")).toBe(false)
    expect(isChannelMitigationLabel("plaintext TLS")).toBe(false)
    expect(isIdentityMitigationLabel("")).toBe(false)
    expect(isChannelMitigationLabel("   ")).toBe(false)
  })
})

describe("secret field heuristics", () => {
  test("flags common key names and value-shaped secrets", () => {
    expect(looksLikeSensitiveKey("aws_secret_access_key")).toBe(true)
    expect(looksLikeSensitiveKey("client_secret")).toBe(true)
    expect(looksLikeSecretValue("AKIAIOSFODNN7EXAMPLE")).toBe(true)
    expect(looksLikeSecretValue("sk_live_abcdef123456")).toBe(true)
    expect(looksLikeSecretValue("-----BEGIN RSA PRIVATE KEY-----\nMIIE")).toBe(true)
    expect(shouldFlagSecretField("notes", "AKIAIOSFODNN7EXAMPLE")).toBe(true)
    expect(shouldFlagSecretField("description", "rotate the key next week")).toBe(false)
    expect(shouldFlagSecretField("api_key", "${API_KEY}")).toBe(false)
    expect(shouldFlagSecretField("api_key", "todo")).toBe(false)
    expect(shouldFlagSecretField("api_key_enabled", true)).toBe(false)
    expect(shouldFlagSecretField("api_key_config", { env: "API_KEY" })).toBe(false)
    expect(shouldFlagSecretField("password", "")).toBe(false)
    expect(shouldFlagSecretField("owner", "security-team")).toBe(false)
    expect(shouldFlagSecretField("password", null)).toBe(false)
    expect(looksLikeSensitiveKey("")).toBe(false)
    expect(looksLikeSecretValue("${API_KEY}")).toBe(false)
    expect(isSecretPlaceholderValue("tbd")).toBe(true)
    expect(isSecretPlaceholderValue("real-secret")).toBe(false)
    expect(formatPreservedSecretComment("alpha\nbeta")).toBe(" previous value preserved: alpha beta")
    expect(isIdentityMitigationLabel(SPOOFING_FIX_LABEL)).toBe(true)
    expect(isChannelMitigationLabel(TAMPERING_FIX_LABEL)).toBe(true)
    expect(isIdentityMitigationLabel(TAMPERING_FIX_LABEL)).toBe(true)
  })
})
