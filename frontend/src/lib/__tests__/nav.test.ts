import { describe, expect, it } from "vitest";
import { ALL_ITEMS, NAV } from "@/lib/nav";
import { VIEWS } from "@/lib/router";

describe("nav", () => {
  it("has exactly one entry per view", () => {
    expect(ALL_ITEMS.map((i) => i.view).sort()).toEqual([...VIEWS].sort());
  });
  it("gives every page a same-origin Classic view link", () => {
    for (const i of ALL_ITEMS) {
      expect(i.classic.startsWith("/")).toBe(true);
      expect(i.classic.startsWith("//")).toBe(false);
    }
  });
  it("groups have labels and items", () => {
    for (const g of NAV) {
      expect(g.label).toBeTruthy();
      expect(g.items.length).toBeGreaterThan(0);
    }
  });
});
