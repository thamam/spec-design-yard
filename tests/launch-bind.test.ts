import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(__dirname, "..")

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

describe("launch paths bind loopback", () => {
  test("npm scripts pass -H 127.0.0.1 to next dev and next start", () => {
    const pkg = JSON.parse(read("package.json"))
    expect(pkg.scripts.dev).toMatch(/-H 127\.0\.0\.1/)
    expect(pkg.scripts.start).toMatch(/-H 127\.0\.0\.1/)
  })

  test("screenshot CI starts next on 127.0.0.1", () => {
    const workflow = read(".github/workflows/screenshot-validation.yml")
    expect(workflow).toMatch(/next start -H 127\.0\.0\.1/)
  })

  test("e2e harness starts next on 127.0.0.1", () => {
    const harness = read("scripts/run-e2e.sh")
    expect(harness).toMatch(/next dev -H 127\.0\.0\.1/)
  })
})
