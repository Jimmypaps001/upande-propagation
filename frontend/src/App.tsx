import { lazy, Suspense, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/Toast";
import { PageSkeleton } from "@/components/Loading";
import { FarmProvider } from "@/lib/farm";
import { useRoute, type View } from "@/lib/router";

/**
 * Every page is its own chunk, fetched quietly after first paint so that
 * switching pages waits for data, not for code (the same warm-up the other
 * Margin Par apps use). One at a time, so the page being waited on is not queued
 * behind the rest.
 */
const CHUNKS: Array<() => Promise<unknown>> = [];

function page<T extends React.ComponentType<Record<string, never>>>(load: () => Promise<{ default: T }>) {
  CHUNKS.push(load);
  return lazy(load);
}

let warmed = false;
function warm() {
  if (warmed) return;
  warmed = true;
  const idle =
    (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ||
    ((fn: () => void) => window.setTimeout(fn, 400));
  idle(() => {
    void CHUNKS.reduce((q, load) => q.then(() => load().then(() => undefined, () => undefined)), Promise.resolve());
  });
}

const Dashboard = page(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Batches = page(() => import("@/pages/Batches").then((m) => ({ default: m.Batches })));
const BatchDetail = lazy(() => import("@/pages/BatchDetail").then((m) => ({ default: m.BatchDetail })));
const Logs = page(() => import("@/pages/Logs").then((m) => ({ default: m.Logs })));
const Requests = page(() => import("@/pages/Requests").then((m) => ({ default: m.Requests })));
const Dispatch = page(() => import("@/pages/Dispatch").then((m) => ({ default: m.Dispatch })));
const Troughs = page(() => import("@/pages/Troughs").then((m) => ({ default: m.Troughs })));
const Consignments = page(() => import("@/pages/Consignments").then((m) => ({ default: m.Consignments })));
const Trials = page(() => import("@/pages/Trials").then((m) => ({ default: m.Trials })));
const MotherBlocks = page(() => import("@/pages/MotherBlocks").then((m) => ({ default: m.MotherBlocks })));
const Traceability = page(() => import("@/pages/Traceability").then((m) => ({ default: m.Traceability })));

const PAGES: Record<View, React.ComponentType> = {
  dashboard: Dashboard,
  batches: Batches,
  logs: Logs,
  requests: Requests,
  dispatch: Dispatch,
  troughs: Troughs,
  consignments: Consignments,
  trials: Trials,
  "mother-blocks": MotherBlocks,
  traceability: Traceability,
};

export function App() {
  const [route, navigate] = useRoute();
  useEffect(warm, []);

  const Built = PAGES[route.view];
  const body =
    route.view === "batches" && route.arg ? (
      <BatchDetail key={route.arg} name={route.arg} />
    ) : (
      <Built key={route.view} />
    );

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <FarmProvider>
          <SidebarProvider>
            <AppSidebar view={route.view} onNavigate={(v) => navigate(v)} />
            {/* min-w-0 so a wide table scrolls in its own box instead of pushing the page sideways. */}
            <SidebarInset className="min-w-0">
              <Suspense fallback={<PageSkeleton />}>{body}</Suspense>
            </SidebarInset>
          </SidebarProvider>
        </FarmProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
