import { describe, it, expect } from "vitest"
import { parsePath } from "../lib/reconciler"

describe("parsePath", () => {
  describe("dotted and bracket paths", () => {
    it("splits a plain dotted path into string segments", () => {
      expect(parsePath("system.components")).toEqual(["system", "components"])
    })

    it("parses bracket indices as numbers", () => {
      expect(parsePath("system.components[0]")).toEqual(["system", "components", 0])
    })

    it("parses the canonical linter path shape with mixed dots and brackets", () => {
      expect(parsePath("system.components[0].connections[1].target")).toEqual([
        "system",
        "components",
        0,
        "connections",
        1,
        "target",
      ])
    })

    it("parses a path that is only a bracket index", () => {
      expect(parsePath("[3]")).toEqual([3])
    })

    it("parses multi-digit and zero-padded bracket indices as base-10 numbers", () => {
      expect(parsePath("components[12]")).toEqual(["components", 12])
      expect(parsePath("components[007]")).toEqual(["components", 7])
    })

    it("keeps a numeric dotted segment as a string (only bracket indices become numbers)", () => {
      expect(parsePath("a.0")).toEqual(["a", "0"])
    })

    it("resumes with a string segment after a bracket index", () => {
      expect(parsePath("a[0]b")).toEqual(["a", 0, "b"])
    })
  })

  describe("prototype-pollution guard", () => {
    it("drops __proto__ segments entirely", () => {
      expect(parsePath("__proto__")).toEqual([])
      expect(parsePath("a.__proto__.b")).toEqual(["a", "b"])
    })

    it("drops constructor and prototype segments entirely", () => {
      expect(parsePath("constructor")).toEqual([])
      expect(parsePath("prototype")).toEqual([])
      expect(parsePath("system.constructor.prototype.components")).toEqual(["system", "components"])
    })

    it("drops the guarded key but still parses a following bracket index", () => {
      expect(parsePath("__proto__[0]")).toEqual([0])
    })

    it("only guards exact matches, not keys that merely contain the words", () => {
      expect(parsePath("a.constructorName.__proto__x.myprototype")).toEqual([
        "a",
        "constructorName",
        "__proto__x",
        "myprototype",
      ])
    })
  })

  describe("malformed and degenerate paths", () => {
    it("returns an empty array for an empty string", () => {
      expect(parsePath("")).toEqual([])
    })

    it("skips empty segments produced by leading, trailing, or doubled dots", () => {
      expect(parsePath(".system")).toEqual(["system"])
      expect(parsePath("system.")).toEqual(["system"])
      expect(parsePath("a..b")).toEqual(["a", "b"])
    })

    it("ignores empty brackets", () => {
      expect(parsePath("a[]")).toEqual(["a"])
    })

    it("treats a non-numeric bracket body as a plain string segment", () => {
      // The bracket-index alternative requires digits, so "abc" is matched by
      // the bare-segment alternative instead.
      expect(parsePath("a[abc]")).toEqual(["a", "abc"])
    })

    it("treats a negative bracket body as a plain string segment", () => {
      expect(parsePath("a[-1]")).toEqual(["a", "-1"])
    })

    it("returns an empty array for a path of only separators", () => {
      expect(parsePath(".[]..")).toEqual([])
    })
  })
})
