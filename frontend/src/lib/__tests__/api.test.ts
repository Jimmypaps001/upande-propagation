import { afterEach, describe, expect, it, vi } from "vitest";
import { batches, overview, troughBoard } from "@/lib/api";
import { isError } from "@/lib/frappe";

function reply(message: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, statusText: "", text: async () => JSON.stringify({ message }) });
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("posts to the existing whitelisted methods with the farm as company", async () => {
    const f = reply({ kpis: {} });
    vi.stubGlobal("fetch", f);
    await overview("Marginpar");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/method/upande_propagation.api.get_overview");
    expect(JSON.parse(init.body)).toEqual({ company: "Marginpar", crop: null });
  });
  it("sends null for all farms", async () => {
    const f = reply({ batches: [] });
    vi.stubGlobal("fetch", f);
    await batches("", true);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ company: null, include_completed: 1, crop: null });
  });
  it("sends the crop key to narrow a page to one crop", async () => {
    const f = reply({ batches: [] });
    vi.stubGlobal("fetch", f);
    await batches("", false, "spray-roses");
    expect(JSON.parse(f.mock.calls[0][1].body).crop).toBe("spray-roses");
  });
  it("folds a refusal into an error", async () => {
    vi.stubGlobal("fetch", reply({ error: "no" }));
    expect(isError(await troughBoard())).toBe(true);
  });
  it("folds a network failure into an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(isError(await troughBoard())).toBe(true);
  });
});
