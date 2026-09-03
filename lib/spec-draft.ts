// In-memory + localStorage draft of the last rendered spec. The error
// boundary persists this when a render throws, because the 1s autosave
// timer is cancelled when the workspace unmounts. Hydration prefers a
// stored draft over the project file so Reload does not silently drop it.

const STORAGE_KEY = "spec_main_crash_draft"

let memory: string | null = null

export function rememberSpecDraft(yaml: string): void {
  memory = yaml
}

export function persistSpecDraft(): string | null {
  if (memory == null) return null
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, memory)
    } catch {}
  }
  return memory
}

/** Only the persisted crash copy — never the in-memory pre-hydration template. */
export function readCrashDraft(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return memory
  }
}

export function clearCrashDraft(): void {
  memory = null
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
