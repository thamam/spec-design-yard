import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { installWorkspaceFetch } from './workspace-fetch-double'
import { normalizeLineEndings } from '../lib/spec-model'

// Line endings are normalised to LF exactly once, where foreign spec text
// enters app state: the hydration effect in workspace-layout.tsx. Everything
// downstream — the editor's keyboard handlers, reconcileSpec, undo/redo —
// then works in one coordinate space, which is what removes the whole class
// of bug the round-1 CRLF blocker came from.
//
// A CRLF fixture that still contains `\r` after hydration is the red.

const CRLF_SPEC = 'system:\r\n  name: CRLF System\r\n  components:\r\n    - id: node_a\r\n      type: Stage\r\n'
const LF_SPEC = CRLF_SPEC.replace(/\r\n/g, '\n')

function readEditor() {
  return screen.getByTestId('spec-textarea') as HTMLTextAreaElement
}

async function hydrated(match: string) {
  await waitFor(() => {
    expect(readEditor().value).toContain(match)
  })
  return readEditor()
}

/** Put the caret at the end of the last content line and press Tab. */
async function tabAtEndOfTypeLine(textarea: HTMLTextAreaElement) {
  const caret = textarea.value.indexOf('      type: Stage') + '      type: Stage'.length
  textarea.focus()
  textarea.setSelectionRange(caret, caret)
  fireEvent.select(textarea)
  fireEvent.keyDown(textarea, { key: 'Tab' })
}

/**
 * The YAML in the browser-mode cache once autosave has REPLACED the seeded
 * entry. Waiting on a marker the seed does not contain matters: reading too
 * early returns the test's own CRLF fixture and the assertion passes on stale
 * data instead of on what the app wrote.
 */
async function cachedYaml(marker: string) {
  let text = ''
  await waitFor(() => {
    const raw = localStorage.getItem('spec_main')
    expect(raw).toBeTruthy()
    text = String(JSON.parse(raw as string).yamlContent ?? '')
    expect(text).toContain(marker)
  }, { timeout: 5000 })
  return text
}

/** The YAML the app actually persisted — app state, not the DOM's LF view. */
async function firstSavedYaml(puts: { url: string; body: any }[]) {
  await waitFor(() => expect(puts.length).toBeGreaterThan(0), { timeout: 5000 })
  return String(puts[puts.length - 1].body?.yamlContent ?? '')
}

describe('normalizeLineEndings', () => {
  test('collapses CRLF and lone CR to LF, and leaves LF text untouched', () => {
    expect(normalizeLineEndings('a\r\nb')).toBe('a\nb')
    expect(normalizeLineEndings('a\rb')).toBe('a\nb')
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
    expect(normalizeLineEndings('a\nb')).toBe('a\nb')
    expect(normalizeLineEndings('')).toBe('')
  })
})

describe('a CRLF spec is normalised where it enters app state', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // NOTE ON WHAT IS ASSERTED. A textarea's own `value` is always LF — the DOM
  // normalises it — so `textarea.value` can never reveal a `\r` in app state
  // and an assertion on it would pass with or without the fix. The teeth are
  // the autosave PUT body, which carries the app's real spec text to disk.

  test('file mode: a CRLF file from the server reaches the editor as LF', async () => {
    const { puts } = installWorkspaceFetch({
      spec: {
        body: {
          id: 'main',
          title: 'CRLF System',
          yamlContent: CRLF_SPEC,
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      },
      meta: { status: 404, body: { found: false } },
      put: { body: { ok: true } },
    })

    render(<Workspace />)
    const textarea = await hydrated('CRLF System')
    expect(textarea.value).toBe(LF_SPEC)

    await tabAtEndOfTypeLine(textarea)
    const saved = await firstSavedYaml(puts)
    expect(saved).not.toContain('\r')
    expect(saved).toContain('      type: Stage  \n')
  })

  test('standalone mode: a CRLF localStorage cache reaches the editor as LF', async () => {
    localStorage.setItem(
      'spec_main',
      JSON.stringify({
        id: 'main',
        title: 'CRLF System',
        yamlContent: CRLF_SPEC,
        updatedAt: '2026-08-18T00:00:00.000Z',
      })
    )
    installWorkspaceFetch({
      spec: { status: 404, body: { error: 'not found' } },
      meta: { status: 404, body: { found: false } },
      put: { body: { ok: true } },
    })

    render(<Workspace />)
    const textarea = await hydrated('CRLF System')
    expect(textarea.value).toBe(LF_SPEC)

    await tabAtEndOfTypeLine(textarea)
    // Browser mode never PUTs; the persisted copy is the localStorage entry.
    const saved = await cachedYaml('      type: Stage  ')
    expect(saved).not.toContain('\r')
    expect(saved).toContain('      type: Stage  \n')
  })
})

describe('the editor keyboard handlers need no coordinate translation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('Tab after a CRLF load indents at the end of the last line', async () => {
    const { puts } = installWorkspaceFetch({
      spec: {
        body: {
          id: 'main',
          title: 'CRLF System',
          yamlContent: CRLF_SPEC,
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      },
      meta: { status: 404, body: { found: false } },
      put: { body: { ok: true } },
    })

    render(<Workspace />)
    const textarea = await hydrated('CRLF System')

    await tabAtEndOfTypeLine(textarea)

    // The original blocker: an LF offset spliced into CRLF text landed the
    // indent inside the line. With one coordinate space it lands at the end —
    // asserted on what was persisted, not on the DOM's normalised view.
    const saved = await firstSavedYaml(puts)
    expect(saved).toContain('      type: Stage  \n')
    expect(saved).not.toContain('type: Stage  \r')
    expect(saved).not.toContain('\r')
  })

  test('Enter after a CRLF load breaks the line with a bare LF', async () => {
    const { puts } = installWorkspaceFetch({
      spec: {
        body: {
          id: 'main',
          title: 'CRLF System',
          yamlContent: CRLF_SPEC,
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      },
      meta: { status: 404, body: { found: false } },
      put: { body: { ok: true } },
    })

    render(<Workspace />)
    const textarea = await hydrated('CRLF System')

    const caret = textarea.value.indexOf('      type: Stage') + '      type: Stage'.length
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    const saved = await firstSavedYaml(puts)
    expect(saved).toContain('      type: Stage\n      ')
    expect(saved).not.toContain('\r')
  })
})
