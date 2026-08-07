import { describe, test, expect } from 'vitest'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('STRIDE Secret Leakage Linter Rule & Quick Fix', () => {
  test('flags component metadata containing a sensitive key with a real value as stride-secret-leak warning', () => {
    const spec = {
      system: {
        name: 'Secret Leak System',
        components: [
          {
            id: 'auth_service',
            type: 'Stage',
            metadata: {
              api_key: 'sk_live_abcdef123456',
              password: 'super-secret-password-99'
            }
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const secretLeaks = diagnostics.filter(d => d.code === 'stride-secret-leak')
    expect(secretLeaks.length).toBe(2)

    const keyLeak = secretLeaks.find(d => d.path === 'system.components[0].metadata.api_key')
    expect(keyLeak).toBeDefined()
    expect(keyLeak?.severity).toBe('warning')
    expect(keyLeak?.message).toContain('Potential hardcoded secret or token detected in metadata key "api_key"')

    const passLeak = secretLeaks.find(d => d.path === 'system.components[0].metadata.password')
    expect(passLeak).toBeDefined()
    expect(passLeak?.severity).toBe('warning')
    expect(passLeak?.message).toContain('Potential hardcoded secret or token detected in metadata key "password"')
  })

  test('does NOT flag placeholder values, empty strings, or env var reference formats', () => {
    const spec = {
      system: {
        name: 'Secure System',
        components: [
          {
            id: 'auth_service',
            type: 'Stage',
            metadata: {
              api_key: '${API_KEY}',
              password: 'todo',
              token: 'TBD',
              session_secret: 'placeholder',
              db_pass: '',
              owner: 'security-team',
              api_key_enabled: true,
              api_key_config: { env: 'API_KEY' },
              passwd_list: [1, 2, 3]
            }
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const secretLeaks = diagnostics.filter(d => d.code === 'stride-secret-leak')
    expect(secretLeaks.length).toBe(0)
  })

  test('reconciles stride-secret-leak by replacing the hardcoded secret with an env var placeholder', () => {
    const initialYaml = `system:
  name: Secret Leak System
  components:
    - id: auth_service
      type: Stage
      metadata:
        password: my-hardcoded-secret-password
`
    const updated = reconcileSpec(initialYaml, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].metadata.password', fixType: 'stride-secret-leak' }
    })

    const parsed = yaml.parse(updated)
    expect(parsed.system.components[0].metadata.password).toBe('${SENSITIVE_VALUE_PLACEHOLDER}')
  })
})
