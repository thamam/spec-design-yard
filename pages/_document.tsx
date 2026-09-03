import { Head, Html, Main, NextScript } from "next/document"
import { WORKSPACE_BOOTSTRAP_BG, WORKSPACE_BOOTSTRAP_FG } from "../lib/status-copy"

// Dark shell so a full reload never paints a white flash before CSS/JS land.
export default function Document() {
  return (
    <Html lang="en" style={{ backgroundColor: WORKSPACE_BOOTSTRAP_BG, color: WORKSPACE_BOOTSTRAP_FG }}>
      <Head />
      <body style={{ backgroundColor: WORKSPACE_BOOTSTRAP_BG, margin: 0 }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
