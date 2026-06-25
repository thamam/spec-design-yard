"use client"

import { useState } from "react"
import {
  CodeIcon,
  FocusIcon,
  NetworkIcon,
  CopyIcon,
  WrapTextIcon,
  SearchIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileJsonIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react"

/* ── Sample spec document ── */
const SPEC_CODE = `{
  "$schema": "https://spec.dev/v1/schema.json",
  "name": "UserAuthService",
  "version": "2.4.1",
  "description": "Authentication and session management service",

  "endpoints": [
    {
      "id": "auth.login",
      "method": "POST",
      "path": "/auth/login",
      "summary": "Authenticate a user and return a session token",
      "request": {
        "body": {
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string", "minLength": 8 }
        }
      },
      "response": {
        "200": {
          "token": { "type": "string" },
          "expiresAt": { "type": "string", "format": "date-time" },
          "user": { "$ref": "#/components/User" }
        },
        "401": { "$ref": "#/errors/Unauthorized" }
      }
    },
    {
      "id": "auth.refresh",
      "method": "POST",
      "path": "/auth/refresh",
      "summary": "Refresh an existing session token",
      "security": ["bearerAuth"],
      "response": {
        "200": {
          "token": { "type": "string" },
          "expiresAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    {
      "id": "auth.logout",
      "method": "DELETE",
      "path": "/auth/session",
      "summary": "Invalidate the current session",
      "security": ["bearerAuth"],
      "response": { "204": {} }
    }
  ],

  "components": {
    "User": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "email": { "type": "string", "format": "email" },
        "displayName": { "type": "string" },
        "role": { "type": "string", "enum": ["admin", "member", "viewer"] },
        "createdAt": { "type": "string", "format": "date-time" }
      }
    }
  },

  "errors": {
    "Unauthorized": {
      "code": 401,
      "message": "Invalid credentials or expired token"
    }
  }
}`

/* ── Syntax token types ── */
type TokenType = "punctuation" | "key" | "string" | "number" | "keyword" | "comment" | "plain"

interface Token {
  type: TokenType
  text: string
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []
  let rest = line

  // Leading whitespace
  const wsMatch = rest.match(/^(\s+)/)
  if (wsMatch) {
    tokens.push({ type: "plain", text: wsMatch[1] })
    rest = rest.slice(wsMatch[1].length)
  }

  while (rest.length > 0) {
    // JSON key: "key":
    const keyMatch = rest.match(/^("(?:[^"\\]|\\.)*")(\s*:)/)
    if (keyMatch) {
      tokens.push({ type: "key", text: keyMatch[1] })
      tokens.push({ type: "punctuation", text: keyMatch[2] })
      rest = rest.slice(keyMatch[0].length)
      continue
    }
    // String value
    const strMatch = rest.match(/^"(?:[^"\\]|\\.)*"/)
    if (strMatch) {
      tokens.push({ type: "string", text: strMatch[0] })
      rest = rest.slice(strMatch[0].length)
      continue
    }
    // Number
    const numMatch = rest.match(/^-?\d+(\.\d+)?/)
    if (numMatch) {
      tokens.push({ type: "number", text: numMatch[0] })
      rest = rest.slice(numMatch[0].length)
      continue
    }
    // Keywords
    const kwMatch = rest.match(/^(true|false|null)\b/)
    if (kwMatch) {
      tokens.push({ type: "keyword", text: kwMatch[0] })
      rest = rest.slice(kwMatch[0].length)
      continue
    }
    // Punctuation
    const pMatch = rest.match(/^[{}[\],]/)
    if (pMatch) {
      tokens.push({ type: "punctuation", text: pMatch[0] })
      rest = rest.slice(1)
      continue
    }
    // Anything else
    tokens.push({ type: "plain", text: rest[0] })
    rest = rest.slice(1)
  }
  return tokens
}

const TOKEN_COLORS: Record<TokenType, string> = {
  key:        "#79c0ff",
  string:     "#a5d6ff",
  number:     "#f2cc60",
  keyword:    "#ff7b72",
  punctuation:"#8b949e",
  comment:    "#4f6279",
  plain:      "#c9d1d9",
}

/* ── Code tab ── */
interface CodeTabProps {
  value: string
  onChange: (val: string) => void
}

function CodeTab({ value, onChange }: CodeTabProps) {
  return (
    <div className="flex-1 flex overflow-hidden font-mono text-[13px] leading-relaxed relative bg-zinc-950/80">
      <textarea
        data-testid="spec-textarea"
        id="spec-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 p-5 text-zinc-300 font-mono resize-none leading-6"
        spellCheck="false"
      />
    </div>
  )
}

/* ── Tree tab ── */
interface TreeNode {
  key: string
  type: "object" | "array" | "string" | "number" | "boolean"
  value?: string
  children?: TreeNode[]
}

const SPEC_TREE: TreeNode = {
  key: "spec",
  type: "object",
  children: [
    { key: "$schema", type: "string", value: '"https://spec.dev/v1/schema.json"' },
    { key: "name", type: "string", value: '"UserAuthService"' },
    { key: "version", type: "string", value: '"2.4.1"' },
    { key: "description", type: "string", value: '"Authentication and session management"' },
    {
      key: "endpoints",
      type: "array",
      children: [
        {
          key: "[0] auth.login",
          type: "object",
          children: [
            { key: "method", type: "string", value: '"POST"' },
            { key: "path", type: "string", value: '"/auth/login"' },
            { key: "request", type: "object", children: [{ key: "body", type: "object", children: [{ key: "email", type: "string", value: "{ type: string }" }, { key: "password", type: "string", value: "{ type: string }" }] }] },
            { key: "response", type: "object", children: [{ key: "200", type: "object", value: "{ token, expiresAt, user }" }, { key: "401", type: "object", value: "$ref Unauthorized" }] },
          ],
        },
        {
          key: "[1] auth.refresh",
          type: "object",
          children: [
            { key: "method", type: "string", value: '"POST"' },
            { key: "path", type: "string", value: '"/auth/refresh"' },
            { key: "security", type: "array", value: '["bearerAuth"]' },
          ],
        },
        {
          key: "[2] auth.logout",
          type: "object",
          children: [
            { key: "method", type: "string", value: '"DELETE"' },
            { key: "path", type: "string", value: '"/auth/session"' },
          ],
        },
      ],
    },
    {
      key: "components",
      type: "object",
      children: [
        {
          key: "User",
          type: "object",
          children: [
            { key: "id", type: "string", value: "uuid" },
            { key: "email", type: "string", value: "email" },
            { key: "displayName", type: "string", value: "string" },
            { key: "role", type: "string", value: "admin | member | viewer" },
            { key: "createdAt", type: "string", value: "date-time" },
          ],
        },
      ],
    },
    {
      key: "errors",
      type: "object",
      children: [{ key: "Unauthorized", type: "object", children: [{ key: "code", type: "number", value: "401" }, { key: "message", type: "string", value: '"Invalid credentials"' }] }],
    },
  ],
}

function TreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isContainer = hasChildren

  const typeColor: Record<string, string> = {
    object:  "var(--accent)",
    array:   "var(--warning)",
    string:  "#a5d6ff",
    number:  "#f2cc60",
    boolean: "#ff7b72",
  }

  return (
    <li style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <button
        className="flex items-center gap-1.5 w-full text-left py-[3px] px-2 rounded text-[12px] transition-colors"
        style={{ color: "var(--foreground)" }}
        onClick={() => isContainer && setOpen((o) => !o)}
        aria-expanded={isContainer ? open : undefined}
      >
        {/* Chevron */}
        <span
          className="shrink-0 w-3 h-3 flex items-center justify-center"
          style={{ color: "var(--foreground-muted)" }}
        >
          {isContainer ? (
            open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />
          ) : (
            <span className="w-1 h-1 rounded-full block" style={{ background: "var(--border-subtle)" }} />
          )}
        </span>

        {/* Key */}
        <span className="font-medium" style={{ color: TOKEN_COLORS.key }}>
          {node.key}
        </span>

        {/* Type badge */}
        {isContainer && (
          <span
            className="text-[10px] px-1 rounded shrink-0"
            style={{ background: "var(--surface-overlay)", color: typeColor[node.type] }}
          >
            {node.type}
          </span>
        )}

        {/* Value */}
        {node.value && !isContainer && (
          <span
            className="truncate font-mono text-[11px]"
            style={{ color: TOKEN_COLORS.string }}
          >
            {node.value}
          </span>
        )}
      </button>

      {isContainer && open && (
        <ul className="border-l" style={{ borderColor: "var(--border)", marginLeft: 8 }}>
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function TreeTab() {
  return (
    <div className="flex-1 overflow-auto py-2 px-1">
      <ul>
        <TreeNode node={SPEC_TREE} depth={0} />
      </ul>
    </div>
  )
}

/* ── Focus tab ── */
function FocusTab() {
  const fields = [
    { label: "Service name", value: "UserAuthService", accent: true },
    { label: "Version", value: "2.4.1" },
    { label: "Schema", value: "https://spec.dev/v1/schema.json", mono: true },
    { label: "Endpoints", value: "3 defined" },
    { label: "Components", value: "1 model (User)" },
    { label: "Security", value: "Bearer token (JWT)" },
    { label: "Error types", value: "Unauthorized (401)" },
  ]

  const endpoints = [
    { method: "POST",   path: "/auth/login",   id: "auth.login",   desc: "Authenticate user" },
    { method: "POST",   path: "/auth/refresh",  id: "auth.refresh",  desc: "Refresh session" },
    { method: "DELETE", path: "/auth/session",  id: "auth.logout",   desc: "Invalidate session" },
  ]

  const METHOD_COLOR: Record<string, string> = {
    GET: "#3ecf8e",
    POST: "var(--accent)",
    PUT: "var(--warning)",
    PATCH: "var(--warning)",
    DELETE: "var(--danger)",
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-5">
      {/* Meta card */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--foreground-muted)" }}>
          Specification Overview
        </h3>
        <dl className="space-y-2">
          {fields.map(({ label, value, accent, mono }) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] shrink-0" style={{ color: "var(--foreground-muted)" }}>{label}</dt>
              <dd
                className={`text-[12px] truncate font-medium ${mono ? "font-mono" : ""}`}
                style={{ color: accent ? "var(--accent)" : "var(--foreground)" }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Endpoints */}
      <div className="space-y-2">
        <h3 className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--foreground-muted)" }}>
          Endpoints
        </h3>
        {endpoints.map((ep) => (
          <div
            key={ep.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)")}
          >
            <span
              className="shrink-0 text-[10px] font-bold w-14 text-center py-0.5 rounded"
              style={{
                background: `${METHOD_COLOR[ep.method]}18`,
                color: METHOD_COLOR[ep.method],
                border: `1px solid ${METHOD_COLOR[ep.method]}30`,
              }}
            >
              {ep.method}
            </span>
            <span className="font-mono text-[12px] truncate" style={{ color: "var(--foreground)" }}>
              {ep.path}
            </span>
            <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--foreground-muted)" }}>
              {ep.desc}
            </span>
          </div>
        ))}
      </div>

      {/* User model */}
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--foreground-muted)" }}>
          User Model
        </h3>
        <div className="space-y-1.5">
          {[
            { name: "id", type: "uuid" },
            { name: "email", type: "email" },
            { name: "displayName", type: "string" },
            { name: "role", type: "enum" },
            { name: "createdAt", type: "date-time" },
          ].map((f) => (
            <div key={f.name} className="flex items-center gap-2">
              <span className="font-mono text-[12px] w-28 truncate" style={{ color: TOKEN_COLORS.key }}>
                {f.name}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}
              >
                {f.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Tab definitions ── */
type TabId = "code" | "tree" | "focus"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "code",  label: "Code",  icon: <CodeIcon size={12} /> },
  { id: "tree",  label: "Tree",  icon: <NetworkIcon size={12} /> },
  { id: "focus", label: "Focus", icon: <FocusIcon size={12} /> },
]

/* ── Main EditorPanel ── */
export function EditorPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("code")
  const [wordWrap, setWordWrap] = useState(false)
  const [copied, setCopied] = useState(false)
  const [specText, setSpecText] = useState(`system:
  name: External Brain
  components:
    - id: api_gateway
      type: Gateway
      name: Public API Gateway
      connections:
        - target: inbox`)

  const handleCopy = () => {
    navigator.clipboard.writeText(specText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section
      data-testid="editor-panel"
      className="flex flex-col h-full"
      style={{ background: "var(--surface)" }}
      aria-label="Spec editor"
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          height: 36,
        }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Editor views">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-1.5 px-3 h-9 text-[12px] font-medium transition-colors duration-100 select-none"
                style={{
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  background: isActive ? "var(--surface-elevated)" : "transparent",
                  borderRadius: "4px 4px 0 0",
                }}
              >
                <span style={{ color: isActive ? "var(--accent)" : "var(--foreground-muted)" }}>
                  {tab.icon}
                </span>
                {tab.label}
                {/* Active underline */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Toolbar actions (code-only) */}
        {activeTab === "code" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWordWrap((w) => !w)}
              title="Toggle word wrap"
              aria-label="Toggle word wrap"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{
                color: wordWrap ? "var(--accent)" : "var(--foreground-muted)",
                background: wordWrap ? "var(--accent-dim)" : "transparent",
              }}
            >
              <WrapTextIcon size={12} />
            </button>
            <button
              title="Search"
              aria-label="Search in file"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{ color: "var(--foreground-muted)" }}
            >
              <SearchIcon size={12} />
            </button>
            <button
              onClick={handleCopy}
              title="Copy"
              aria-label="Copy code"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{ color: copied ? "var(--success)" : "var(--foreground-muted)" }}
            >
              <CopyIcon size={12} />
            </button>
          </div>
        )}
      </div>

      {/* File path breadcrumb */}
      <div
        className="flex items-center gap-1.5 px-3 h-7 shrink-0 text-[11px] select-none"
        style={{
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
          color: "var(--foreground-muted)",
        }}
      >
        <FileJsonIcon size={11} style={{ color: "var(--warning)" }} />
        <span>workspace</span>
        <span style={{ color: "var(--foreground-dim)" }}>/</span>
        <span>specs</span>
        <span style={{ color: "var(--foreground-dim)" }}>/</span>
        <span style={{ color: "var(--foreground)" }}>main.spec.json</span>
        <span
          className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}
        >
          JSON
        </span>
      </div>

      {/* Tab panels */}
      <div
        id={`tabpanel-code`}
        role="tabpanel"
        aria-labelledby="tab-code"
        hidden={activeTab !== "code"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <CodeTab value={specText} onChange={setSpecText} />
      </div>

      <div
        id={`tabpanel-tree`}
        role="tabpanel"
        aria-labelledby="tab-tree"
        hidden={activeTab !== "tree"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <TreeTab />
      </div>

      <div
        id={`tabpanel-focus`}
        role="tabpanel"
        aria-labelledby="tab-focus"
        hidden={activeTab !== "focus"}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <FocusTab />
      </div>
    </section>
  )
}
