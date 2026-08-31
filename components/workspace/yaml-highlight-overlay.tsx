"use client"

import { forwardRef } from "react"
import { tokenizeSpec, type TokenClass } from "../../lib/yaml-highlight"

const TOKEN_CLASS_STYLES: Record<Exclude<TokenClass, "plain">, string> = {
  "component-id": "text-emerald-400",
  "connection-target": "text-sky-400",
  "metadata-key": "text-amber-400",
  "field-key": "text-indigo-400",
  value: "text-purple-400",
}

interface YamlHighlightOverlayProps {
  value: string
}

/**
 * Colour backdrop behind the (now transparent-text) spec textarea. Kept in
 * scroll sync imperatively via the forwarded ref — see CodeTab's onScroll
 * handler — rather than through React state, so scrolling never triggers a
 * re-render of the tokenised content.
 */
export const YamlHighlightOverlay = forwardRef<HTMLDivElement, YamlHighlightOverlayProps>(
  function YamlHighlightOverlay({ value }, ref) {
    const lines = tokenizeSpec(value)

    return (
      <div
        ref={ref}
        data-testid="yaml-highlight-overlay"
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none overflow-hidden p-5 font-mono text-[13px] leading-6 whitespace-pre-wrap break-words w-full h-full"
      >
        {lines.map((tokens, i) => {
          const blank = tokens.every((t) => t.text.length === 0)
          return (
            <div key={i}>
              {tokens.map((t, j) =>
                t.className === "plain" ? (
                  <span key={j}>{t.text}</span>
                ) : (
                  <span key={j} className={TOKEN_CLASS_STYLES[t.className]}>
                    {t.text}
                  </span>
                )
              )}
              {blank && <span>{" "}</span>}
            </div>
          )
        })}
      </div>
    )
  }
)
