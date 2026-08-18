import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

// The parse boundary strips string-form connections ("- digest") from the
// sanitized spec. The user must get feedback instead of silent data loss: one
// "string-connection-stripped" info diagnostic per dropped entry, which clears
// once the entry is converted to the object form.
const STRING_CONN_SPEC = `system:
  name: String Conn Fixture
  components:
    - id: digest_stage
      type: Stage
      connections:
        - kb_store
    - id: kb_store
      type: Store
`

const OBJECT_CONN_SPEC = `system:
  name: String Conn Fixture
  components:
    - id: digest_stage
      type: Stage
      connections:
        - target: kb_store
    - id: kb_store
      type: Store
`

describe('Dropped string-form connection diagnostics', () => {
  test('typing a string-form connection shows an info diagnostic that disappears when converted to object form', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: STRING_CONN_SPEC } })

    await waitFor(() => {
      expect(screen.getByText(/Connection "- kb_store" was ignored; use the object form/i)).toBeInTheDocument()
    })
    // Path points at the stripped connection entry
    expect(screen.getByText('system.components[0].connections[0]')).toBeInTheDocument()

    // Converting to the object form clears the diagnostic
    fireEvent.change(textarea, { target: { value: OBJECT_CONN_SPEC } })

    await waitFor(() => {
      expect(screen.queryByText(/was ignored; use the object form/i)).not.toBeInTheDocument()
    })
  })
})
