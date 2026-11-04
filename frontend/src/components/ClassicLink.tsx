import { History } from "lucide-react";
import { HEADER_PILL } from "@/components/header-controls";
import { cn } from "@/lib/utils";

/**
 * "Classic view": the legacy desk (or portal) screen for what this page shows.
 * A plain same-tab link, so the old routes stay reachable from the new pages.
 */
export function ClassicLink({ href, label = "Classic view" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      title={`Open the classic ${label === "Classic view" ? "desk screen" : label}`}
      className={cn(
        HEADER_PILL,
        "inline-flex items-center justify-center whitespace-nowrap border no-underline transition-all hover:no-underline",
      )}
    >
      <History className="h-3.5 w-3.5" />
      Classic view
    </a>
  );
}
