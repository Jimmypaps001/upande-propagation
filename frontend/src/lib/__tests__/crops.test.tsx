import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CropProvider, GENERIC_LOADER, loaderFor, markFor, switchCrop } from "@/lib/crops";
import { CropPicker } from "@/components/CropPicker";
import { PropagationMark } from "@/components/PropagationMark";

const CROPS = [
  { name: "Standard Roses", crop_key: "standard-roses", accent_color: "#b8335a", varieties: ["Rose - Candid"] },
  { name: "Summer Flowers", crop_key: "summer-flowers", accent_color: "#3b6fb6", varieties: [] },
];

function stubCrops() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "", text: async () => JSON.stringify({ message: { crops: CROPS } }) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("crop marks", () => {
  it("names each crop's loader and mark, and the generic ones for all crops", () => {
    expect(loaderFor("spray-roses")).toMatch(/propagation_logo_spray-roses_loader\.svg$/);
    expect(markFor("summer-flowers")).toMatch(/propagation_logo_summer-flowers\.svg$/);
    expect(loaderFor(null)).toBe(GENERIC_LOADER);
    expect(markFor("")).toMatch(/propagation_logo\.svg$/);
  });
  it("the sidebar mark uses the crop's scene and falls back to the generic one when it is missing", () => {
    render(<PropagationMark crop="standard-roses" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toMatch(/propagation_logo_standard-roses\.svg$/);
    fireEvent.error(img);
    expect(screen.getByRole("img").getAttribute("src")).toMatch(/propagation_logo\.svg$/);
  });
});

describe("crop picker", () => {
  it("lists All crops and each crop, and switches the route", async () => {
    stubCrops();
    window.location.hash = "#/batches";
    render(
      <CropProvider cropKey="">
        <CropPicker />
      </CropProvider>,
    );
    const trigger = await screen.findByRole("combobox", { name: "Crop" });
    expect(trigger).toHaveTextContent("All crops");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: "Summer Flowers" }));
    await waitFor(() => expect(window.location.hash).toBe("#/summer-flowers/batches"));
  });
  it("switchCrop with nothing goes back to All crops and drops a record page", () => {
    window.location.hash = "#/spray-roses/batches/PB-1";
    switchCrop("");
    expect(window.location.hash).toBe("#/batches");
  });
});
