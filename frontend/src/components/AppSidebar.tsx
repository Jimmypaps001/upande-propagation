import { useEffect, useRef, useState } from "react";
import { Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarUser } from "@/components/SidebarUser";
import { PropagationMark } from "@/components/PropagationMark";
import { NAV } from "@/lib/nav";
import { routeHash, type View } from "@/lib/router";
import { cn } from "@/lib/utils";

/** Brand, the grouped nav, then the pinned footer (collapse, back to the desk, who). */
export function AppSidebar({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const { state, toggle } = useSidebar();
  const collapsed = state === "collapsed";

  // The footer is pinned: only the nav scrolls. `moreBelow` draws the footer's
  // top edge while items are still hidden under it.
  const navRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const vp = navRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!vp) return;
    const update = () => setMoreBelow(vp.scrollHeight - vp.scrollTop - vp.clientHeight > 1);
    update();
    vp.addEventListener("scroll", update, { passive: true });
    const RO = typeof ResizeObserver === "function" ? ResizeObserver : null;
    const ro = RO ? new RO(update) : null;
    if (ro) {
      ro.observe(vp);
      if (vp.firstElementChild) ro.observe(vp.firstElementChild);
    }
    return () => {
      vp.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [collapsed]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          <a
            href="/desk/propagation"
            title="Open the Propagation workspace"
            className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full group-data-[collapsible=icon]:size-[3rem]"
          >
            <PropagationMark size={48} />
          </a>
          <div className="h-6 w-px shrink-0 bg-border group-data-[collapsible=icon]:hidden" />
          <div
            className={cn(
              "grid min-w-0 flex-1 overflow-hidden text-left leading-tight",
              "grid-cols-[1fr] opacity-100",
              "group-data-[collapsible=icon]:grid-cols-[0fr] group-data-[collapsible=icon]:opacity-0",
            )}
          >
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">Propagation</span>
            <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--sd-quiet)]">
              Upande · Nursery
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent ref={navRef} className="overflow-hidden p-0 group-data-[collapsible=icon]:p-0">
        <ScrollArea
          className={cn(
            "h-full w-full",
            "group-data-[collapsible=icon]:[&>[data-radix-scroll-area-viewport]>div]:!block",
          )}
        >
          <div className={cn("flex flex-col gap-1 p-2", "group-data-[collapsible=icon]:p-[0.8rem]")}>
            {NAV.map((g) => (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      return (
                        <SidebarMenuItem key={it.view}>
                          <SidebarMenuButton asChild isActive={view === it.view} title={it.label}>
                            <a
                              href={routeHash(it.view)}
                              onClick={(e) => {
                                e.preventDefault();
                                onNavigate(it.view);
                              }}
                            >
                              <Icon className="h-4 w-4" />
                              <span>{it.label}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </div>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter
        className={cn(
          "transition-shadow duration-200",
          moreBelow && "border-t border-sidebar-border shadow-[0_-6px_14px_-10px_rgba(10,10,10,0.16)]",
        )}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span>{collapsed ? "Expand" : "Collapse"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild title="Back to the Propagation workspace on the desk">
              <a href="/desk/propagation">
                <Home className="h-4 w-4" />
                <span>Back to Desk</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarUser />
      </SidebarFooter>
    </Sidebar>
  );
}
