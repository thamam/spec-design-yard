#!/usr/bin/env node
// Generate (once) the remote-access token under the specyard config dir.
// Prints the secret to stdout only when newly created. Never writes it into
// the repo or a project folder.
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TOKEN_FILENAME = "remote-token"
const dir = process.env.SPEC_YARD_CONFIG_DIR || path.join(os.homedir(), ".specyard")
const file = path.join(dir, TOKEN_FILENAME)

function readExisting() {
  try {
    const token = fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0].trim()
    return token || null
  } catch {
    return null
  }
}

const existing = readExisting()
if (existing) {
  console.log(`[spec-yard] Remote token already exists at ${file}`)
  console.log("[spec-yard] Rotate: delete that file and restart with --remote / npm run dev:remote")
  process.exit(0)
}

fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
const token = randomBytes(32).toString("hex")
fs.writeFileSync(file, token + "\n", { encoding: "utf8", mode: 0o600 })
console.log("[spec-yard] Generated remote token (shown once):")
console.log(token)
console.log(`[spec-yard] Rotate: delete ${file} and restart with --remote`)
