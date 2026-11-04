import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DataTable } from "@/components/DataTable";
import { PlacePicker } from "@/components/PlacePicker";
import { StatusPill, toneOf } from "@/components/StatusPill";
import { Bars } from "@/components/charts";
import { ClassicLink } from "@/components/ClassicLink";

type R = { id: string; name: string; n: number };
const rows: R[] = [
  { id: "1", name: "Alpha", n: 3 },
  { id: "2", name: "Bravo", n: 10 },
  { id: "3", name: "Charlie", n: 1 },
];
const cols = [
  { key: "name", label: "Name" },
  { key: "n", label: "N", align: "right" as const },
];

describe("DataTable", () => {
  it("searches across columns", () => {
    render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.change(screen.getByLabelText("Search the table"), { target: { value: "brav" } });
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
  it("sorts numerically, then reverses, then clears", () => {
    render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    const order = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row").map((r) => r.textContent);
    fireEvent.click(screen.getByRole("columnheader", { name: "N" }));
    expect(order()[0]).toContain("Charlie");
    fireEvent.click(screen.getByRole("columnheader", { name: /^N\s*[↑↓]$/ }));
    expect(order()[0]).toContain("Bravo");
  });
  it("says why it is empty", () => {
    render(<DataTable columns={cols} rows={[]} rowKey={(r: R) => r.id} empty="No batches yet." />);
    expect(screen.getByText("No batches yet.")).toBeInTheDocument();
  });
});

describe("PlacePicker", () => {
  it("lists All farms and each farm, and reports a pick", () => {
    const onChange = vi.fn();
    render(<PlacePicker farms={["Marginpar", "Other"]} value="" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Farm" });
    expect(trigger).toHaveTextContent("All farms");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Marginpar/ }));
    expect(onChange).toHaveBeenCalledWith("Marginpar");
  });
});

describe("StatusPill", () => {
  it("colours by the word", () => {
    expect(toneOf("Fulfilled")).toBe("good");
    expect(toneOf("Overdue")).toBe("bad");
    expect(toneOf("Whatever")).toBe("quiet");
  });
  it("shows a dash for nothing", () => {
    render(<StatusPill text={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("charts and links", () => {
  it("a chart with no figures says so instead of drawing axes", () => {
    render(<Bars data={[{ s: "a", v: 0 }]} x="s" y="v" label="Seedlings" />);
    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
  });
  it("Classic view is a plain same-tab link", () => {
    render(<ClassicLink href="/desk/propagation-batch" />);
    const a = screen.getByRole("link", { name: /Classic view/ });
    expect(a).toHaveAttribute("href", "/desk/propagation-batch");
    expect(a).not.toHaveAttribute("target");
  });
});
