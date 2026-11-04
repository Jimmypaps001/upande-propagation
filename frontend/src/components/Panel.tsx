import type * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A titled card: the frame every chart and table on the pages sits in. */
export function Panel({
  title,
  description,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {right}
      </CardHeader>
      <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** What a panel says when it has nothing to show, and why. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-1 py-8 text-center text-[13px] text-[var(--sd-quiet)]">{children}</div>;
}
