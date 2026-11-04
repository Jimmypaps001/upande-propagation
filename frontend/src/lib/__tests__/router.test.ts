import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, parseRoute, routeHash, VIEWS } from "@/lib/router";

describe("router", () => {
  it("parses a view and a record", () => {
    expect(parseRoute("#/batches/PB-0001")).toEqual({ view: "batches", arg: "PB-0001" });
    expect(parseRoute("#/troughs")).toEqual({ view: "troughs", arg: null });
  });
  it("decodes the record name", () => {
    expect(parseRoute("#/batches/PB%2F01").arg).toBe("PB/01");
  });
  it("falls back to the dashboard for anything unreadable", () => {
    expect(parseRoute("")).toEqual({ view: DEFAULT_VIEW, arg: null });
    expect(parseRoute("#/nonsense/xyz")).toEqual({ view: DEFAULT_VIEW, arg: null });
  });
  it("round-trips every view", () => {
    for (const v of VIEWS) expect(parseRoute(routeHash(v)).view).toBe(v);
  });
});
