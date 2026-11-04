import type * as React from "react";
import { PageShell } from "@/components/PageShell";
import { PlacePicker } from "@/components/PlacePicker";
import { RefreshButton } from "@/components/RefreshButton";
import { ClassicLink } from "@/components/ClassicLink";
import { PageSkeleton } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { useFarm } from "@/lib/farm";
import { navFor } from "@/lib/nav";
import type { View } from "@/lib/router";

/**
 * What every page renders inside: the SCP page header (eyebrow, big title, one
 * toolbar row) with the farm picker, the page's own controls, refresh and the
 * Classic view link, then the body.
 *
 * `error` replaces the body with the server's own words and a retry; `loading`
 * with nothing to show yet draws the page skeleton.
 */
export function Frame({
  view,
  title,
  description,
  controls,
  farmFilter = true,
  loading,
  hasData,
  error,
  onRefresh,
  classic,
  children,
}: {
  view: View;
  title?: React.ReactNode;
  description?: React.ReactNode;
  controls?: React.ReactNode;
  farmFilter?: boolean;
  loading?: boolean;
  hasData?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  /** override the nav's classic link (a detail page links to its own record) */
  classic?: { href: string; label?: string };
  children?: React.ReactNode;
}) {
  const nav = navFor(view);
  const { farm, setFarm, farms } = useFarm();
  const link = classic ?? { href: nav.classic };
  return (
    <PageShell
      title={title ?? nav.label}
      eyebrow={NAV_EYEBROW}
      description={description}
      actions={
        <>
          {farmFilter ? <PlacePicker farms={farms} value={farm} onChange={setFarm} /> : null}
          {controls}
          {onRefresh ? <RefreshButton onClick={onRefresh} loading={loading} label={nav.label.toLowerCase()} /> : null}
          <ClassicLink href={link.href} label={link.label} />
        </>
      }
    >
      {error ? (
        <div className="flex max-w-xl flex-col items-start gap-3 rounded-[var(--sd-radius-lg)] bg-[var(--sd-card)] px-5 py-5 shadow-[var(--sd-shadow-1)]">
          <h2 className="text-[16px] font-semibold text-[var(--sd-ink)]">Could not load this page</h2>
          <p className="text-[13px] text-[var(--sd-muted)]">{error}</p>
          {onRefresh ? <Button onClick={onRefresh}>Try again</Button> : null}
        </div>
      ) : loading && !hasData ? (
        <PageSkeleton />
      ) : (
        children
      )}
    </PageShell>
  );
}

const NAV_EYEBROW = "Upande Propagation";
