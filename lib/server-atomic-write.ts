// SERVER-ONLY filesystem helper shared by the API routes and the project
// registry (imports node fs/path — never import from client code).

import fs from "fs"
import path from "path"

/**
 * Write via a staged temp file + rename, so a crash mid-write never leaves a
 * half-written spec, index, or config behind. The staging dir is a parameter
 * because the caller decides where litter is acceptable: the store route
 * stages inside `.specyard` so a crash never drops a temp file in the repo
 * root, and the registry stages inside its own config dir. Staging must share
 * a filesystem with the target — rename across devices is not atomic.
 */
export function writeFileAtomic(file: string, contents: string, stagingDir: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.mkdirSync(stagingDir, { recursive: true })
  const tmp = path.join(stagingDir, `.tmp-${path.basename(file)}-${process.pid}`)
  fs.writeFileSync(tmp, contents, "utf8")
  fs.renameSync(tmp, file)
}
