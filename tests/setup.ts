import '@testing-library/jest-dom'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The server-side project registry persists to SPEC_YARD_CONFIG_DIR (default
// ~/.specyard). Point every test at a throwaway dir so no test — including
// ones that merely resolve the active project — can touch the user's real
// config.
process.env.SPEC_YARD_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-test-config-'))
delete process.env.SPEC_YARD_REMOTE
delete process.env.SPEC_YARD_REMOTE_HOST
