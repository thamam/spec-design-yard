// Persistence seam: types + the localStorage-backed store. Wraps localStorage
// with an in-memory fallback so the app keeps working (within a single
// session) even when localStorage is unavailable or throws (private browsing,
// quota exceeded, etc). The app-wide store instance lives in
// lib/remote-sync-store.ts, which wraps this class with file mirroring.

export interface SpecDocument {
  id: string
  title: string
  yamlContent: string
  updatedAt: string
}

export interface SimulationRun {
  [key: string]: any
}

export interface CustomPreset {
  name: string
  packets: number
  loss: number
}

export interface SpecStore {
  getSpec(id: string): SpecDocument | null
  saveSpec(id: string, title: string, yamlContent: string): SpecDocument
  getSimulationHistory(): SimulationRun[]
  saveSimulationHistory(history: SimulationRun[]): void
  clearSimulationHistory(): void
  getCustomPresets(): CustomPreset[]
  saveCustomPresets(presets: CustomPreset[]): void
}

const SIMULATION_HISTORY_KEY = "simulation_history"
const CUSTOM_PRESETS_KEY = "custom_simulation_presets"

export class LocalStorageSpecStore implements SpecStore {
  private specs: Record<string, SpecDocument> = {}
  private simulationHistory: SimulationRun[] = []
  private customPresets: CustomPreset[] = []

  public getSpec(id: string): SpecDocument | null {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`spec_${id}`)
        if (saved) {
          const parsed = JSON.parse(saved)
          // Valid JSON with the wrong shape (corrupted entry) is treated as
          // not-found rather than handed back as a SpecDocument.
          if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.id === "string" &&
            typeof parsed.title === "string" &&
            typeof parsed.yamlContent === "string" &&
            typeof parsed.updatedAt === "string"
          ) {
            return parsed
          }
        }
      } catch (e) {
        console.error("Failed to read spec from localStorage", e)
      }
    }
    return this.specs[id] || null
  }

  public saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    const doc: SpecDocument = {
      id,
      title,
      yamlContent,
      updatedAt: new Date().toISOString(),
    }
    this.specs[id] = doc
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`spec_${id}`, JSON.stringify(doc))
      } catch (e) {
        console.error("Failed to save spec to localStorage", e)
      }
    }
    return doc
  }

  public getSimulationHistory(): SimulationRun[] {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(SIMULATION_HISTORY_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            this.simulationHistory = parsed
            return parsed
          }
        }
      } catch (e) {
        console.error("Failed to parse simulation history from localStorage", e)
      }
    }
    return this.simulationHistory
  }

  public saveSimulationHistory(history: SimulationRun[]): void {
    this.simulationHistory = history
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SIMULATION_HISTORY_KEY, JSON.stringify(history))
      } catch (e) {
        console.error("Failed to save simulation history to localStorage", e)
      }
    }
  }

  public clearSimulationHistory(): void {
    this.saveSimulationHistory([])
  }

  public getCustomPresets(): CustomPreset[] {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(CUSTOM_PRESETS_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            this.customPresets = parsed
            return parsed
          }
        }
      } catch (e) {
        console.error("Failed to parse custom presets from localStorage", e)
      }
    }
    return this.customPresets
  }

  public saveCustomPresets(presets: CustomPreset[]): void {
    this.customPresets = presets
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets))
      } catch (e) {
        console.error("Failed to save custom presets to localStorage", e)
      }
    }
  }
}
