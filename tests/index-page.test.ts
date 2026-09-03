import { test, expect } from 'vitest'
import Page from '../pages/index'
import Workspace from '../components/Workspace'

test('the routed page is the workspace (error boundary included)', () => {
  expect(Page).toBe(Workspace)
})
