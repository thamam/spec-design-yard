import { test, expect } from 'vitest'
import Page from '../pages/index'
import Workspace from '../components/Workspace'
import { WorkspaceApp } from '../components/workspace/workspace-app'

test('the routed page and the legacy Workspace stub re-export WorkspaceApp', () => {
  expect(Page).toBe(WorkspaceApp)
  expect(Workspace).toBe(WorkspaceApp)
})
