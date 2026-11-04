import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, parseRoute, routeHash, VIEWS } from "@/lib/router";

describe("router", () => {
  it("parses a view and a record", () => {
    expect(parseRoute("#/batches/PB-0001")).toEqual({ crop: null, view: "batches", arg: "PB-0001" });
    expect(parseRoute("#/troughs")).toEqual({ crop: null, view: "troughs", arg: null });
  });
  it("takes a crop from the first segment when it is not a view", () => {
    expect(parseRoute("#/standard-roses/batches")).toEqual({ crop: "standard-roses", view: "batches", arg: null });
    expect(parseRoute("#/spray-roses/batches/PB-1")).toEqual({ crop: "spray-roses", view: "batches", arg: "PB-1" });
  });
  it("a crop alone lands on its dashboard", () => {
    expect(parseRoute("#/summer-flowers")).toEqual({ crop: "summer-flowers", view: DEFAULT_VIEW, arg: null });
  });
  it("decodes the record name", () => {
    expect(parseRoute("#/batches/PB%2F01").arg).toBe("PB/01");
  });
  it("falls back to the dashboard for anything unreadable", () => {
    expect(parseRoute("")).toEqual({ crop: null, view: DEFAULT_VIEW, arg: null });
    expect(parseRoute("#/nonsense/xyz")).toEqual({ crop: "nonsense", view: DEFAULT_VIEW, arg: null });
  });
  it("round-trips every view, with and without a crop", () => {
    for (const v of VIEWS) {
      expect(parseRoute(routeHash(v)).view).toBe(v);
      expect(parseRoute(routeHash(v, null, "spray-roses"))).toEqual({ crop: "spray-roses", view: v, arg: null });
    }
  });
});
