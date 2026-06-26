// Compile-safe Local Database client & API connector
// Allows zero-dependency mock preview locally, and bridges to Postgres database on Vercel

export interface SpecDocument {
  id: string
  title: string
  yamlContent: string
  updatedAt: string
}

class PreviewStorage {
  private specs: Record<string, SpecDocument> = {}

  constructor() {
    this.specs["default"] = {
      id: "default",
      title: "External Brain v0.2",
      yamlContent: "",
      updatedAt: new Date().toISOString(),
    }
  }

  public getSpec(id: string): SpecDocument | null {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`spec_${id}`)
      if (saved) return JSON.parse(saved)
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
      localStorage.setItem(`spec_${id}`, JSON.stringify(doc))
    }
    return doc
  }
}

export const db = new PreviewStorage()
