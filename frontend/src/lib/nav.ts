import {
  Boxes,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Container,
  FlaskConical,
  LayoutDashboard,
  PackageCheck,
  ScanSearch,
  Sprout,
  Trees,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { View } from "@/lib/router";

export interface NavItem {
  view: View;
  label: string;
  icon: LucideIcon;
  /** the legacy desk (or portal) screen for the same thing, for the "Classic view" link */
  classic: string;
  classicLabel: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const desk = (slug: string) => `/desk/${slug}`;

export const NAV: NavGroup[] = [
  {
    label: "Summary",
    items: [
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, classic: "/propagation-dashboard", classicLabel: "portal dashboard" },
    ],
  },
  {
    label: "Nursery",
    items: [
      { view: "batches", label: "Propagation Batches", icon: Sprout, classic: desk("propagation-batch"), classicLabel: "batch list" },
      { view: "logs", label: "Daily Logs", icon: CalendarDays, classic: desk("daily-propagation-log"), classicLabel: "log list" },
      { view: "troughs", label: "Troughs", icon: Container, classic: desk("trough-setting"), classicLabel: "trough settings" },
      { view: "consignments", label: "Plant Consignments", icon: PackageCheck, classic: desk("plant-consignment"), classicLabel: "consignment list" },
    ],
  },
  {
    label: "Demand & Output",
    items: [
      { view: "requests", label: "Seedling Requests", icon: ClipboardCheck, classic: desk("seedling-request"), classicLabel: "request list" },
      { view: "dispatch", label: "Seedling Dispatch", icon: Truck, classic: desk("seedling-dispatch"), classicLabel: "dispatch list" },
    ],
  },
  {
    label: "Source & Trials",
    items: [
      { view: "mother-blocks", label: "Mother Blocks", icon: Trees, classic: desk("mother-block"), classicLabel: "mother block list" },
      { view: "trials", label: "Flower Trials", icon: FlaskConical, classic: desk("flower-trial"), classicLabel: "trial list" },
    ],
  },
  {
    label: "Reports",
    items: [
      { view: "traceability", label: "Traceability", icon: ScanSearch, classic: desk("query-report/Propagation%20Traceability"), classicLabel: "report" },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

export function navFor(view: View): NavItem {
  return ALL_ITEMS.find((i) => i.view === view) ?? ALL_ITEMS[0];
}

// Kept so a future page can claim an icon without another import.
export const ICONS = { Boxes, ClipboardList };
