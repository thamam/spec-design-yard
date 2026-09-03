import { describe, test, expect } from 'vitest'
import {
  formatIssueCount,
  formatSaveButtonLabel,
  formatSyncLabel,
  isWorkspaceInteractive,
  WORKSPACE_BOOTSTRAP_BG,
  WORKSPACE_BOOTSTRAP_FG,
} from '../lib/status-copy'

describe('formatIssueCount', () => {
  test('treats empty and negative counts as no issues', () => {
    expect(formatIssueCount(0)).toBe('No issues')
    expect(formatIssueCount(-1)).toBe('No issues')
  })

  test('singular and plural', () => {
    expect(formatIssueCount(1)).toBe('1 issue')
    expect(formatIssueCount(2)).toBe('2 issues')
    expect(formatIssueCount(12)).toBe('12 issues')
  })
})

describe('isWorkspaceInteractive', () => {
  test('stays inert until hydrated, and while a first-run decision is pending', () => {
    expect(isWorkspaceInteractive(false, 'unconfigured')).toBe(false)
    expect(isWorkspaceInteractive(false, 'local-only')).toBe(false)
    expect(isWorkspaceInteractive(true, 'unconfigured')).toBe(false)
    expect(isWorkspaceInteractive(true, 'local-only')).toBe(true)
    expect(isWorkspaceInteractive(true, 'synced')).toBe(true)
    expect(isWorkspaceInteractive(true, 'halted')).toBe(true)
  })
})

describe('formatSyncLabel', () => {
  test('loading, halted, and first-run beat dirty/saving', () => {
    expect(formatSyncLabel({ isHydrated: false, isDirty: true, isSaving: true, status: 'synced' })).toBe(
      'Loading workspace…'
    )
    expect(formatSyncLabel({
      isHydrated: true, isDirty: true, isSaving: true, status: 'halted', haltedReason: 'Reload now',
    })).toBe('Reload now')
    expect(formatSyncLabel({
      isHydrated: true, isDirty: false, isSaving: false, status: 'halted',
    })).toBe('Saving halted — reload the workspace')
    expect(formatSyncLabel({
      isHydrated: true, isDirty: true, isSaving: true, status: 'unconfigured',
    })).toBe('No project chosen — pick a folder to save to files')
  })

  test('dirty and saving tell the truth once a destination is chosen', () => {
    expect(formatSyncLabel({ isHydrated: true, isDirty: false, isSaving: true, status: 'synced' })).toBe('Saving…')
    expect(formatSyncLabel({ isHydrated: true, isDirty: true, isSaving: false, status: 'synced' })).toBe(
      'Unsaved changes'
    )
    expect(formatSyncLabel({ isHydrated: true, isDirty: true, isSaving: false, status: 'local-only' })).toBe(
      'Unsaved changes'
    )
    expect(formatSyncLabel({ isHydrated: true, isDirty: false, isSaving: false, status: 'synced' })).toBe(
      'Synced to project'
    )
    expect(formatSyncLabel({ isHydrated: true, isDirty: false, isSaving: false, status: 'local-only' })).toBe(
      'Browser storage only'
    )
  })
})

describe('formatSaveButtonLabel', () => {
  test('idle, saving, and saved', () => {
    expect(formatSaveButtonLabel('idle')).toBe('Save')
    expect(formatSaveButtonLabel('saving')).toBe('Saving…')
    expect(formatSaveButtonLabel('saved')).toBe('Saved')
  })
})

describe('bootstrap chrome', () => {
  test('reload shell is a dark workspace, not a white page', () => {
    expect(WORKSPACE_BOOTSTRAP_BG).toBe('#09090b')
    expect(WORKSPACE_BOOTSTRAP_FG).toBe('#f4f4f5')
  })
})
