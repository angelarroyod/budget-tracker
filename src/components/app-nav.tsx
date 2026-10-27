"use client";

import { CheckSquareIcon, ChevronRightIcon, LayoutDashboardIcon, MenuIcon, ReceiptIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Status } from "@/lib/forecast";

const ICONS = { dashboard: LayoutDashboardIcon, team: UsersIcon, expenses: ReceiptIcon, approvals: CheckSquareIcon };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: { count: number; label: string } };
/** Sidebar shortcut to a team, with its projected year-end as % of budget. */
export type NavTeam = { href: string; label: string; status: Status; statusLabel: string; pct: string };

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function NavLinks({ items, label, teams, onNavigate }: { items: NavItem[]; label: string; teams?: { label: string; items: NavTeam[] }; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-card text-foreground shadow-xs ring-1 ring-border hover:bg-card",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
                {item.badge && item.badge.count > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                    {item.badge.count}
                    <span className="sr-only"> {item.badge.label}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {teams && teams.items.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{teams.label}</p>
          <ul className="flex flex-col gap-0.5">
            {teams.items.map((team) => (
              <li key={team.href}>
                <Link
                  href={team.href}
                  onClick={onNavigate}
                  aria-current={isActive(pathname, team.href) ? "page" : undefined}
                  className="flex h-[30px] items-center gap-2 rounded-lg px-2.5 text-[13px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                >
                  <StatusIcon status={team.status} />
                  <span className="min-w-0 flex-1 truncate">{team.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {team.pct}
                    <span className="sr-only">, {team.statusLabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export function SidebarNav(props: { items: NavItem[]; label: string; teams?: { label: string; items: NavTeam[] } }) {
  return <NavLinks {...props} />;
}

export function MobileNav({
  items,
  label,
  teams,
  menuLabel,
  title,
}: {
  items: NavItem[];
  label: string;
  teams?: { label: string; items: NavTeam[] };
  menuLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label={menuLabel} />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-4">
        <SheetTitle className="mb-4">{title}</SheetTitle>
        <NavLinks items={items} label={label} teams={teams} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** "Monterrey Plant › Dashboard": the site, then the nav section the current page belongs to. */
export function Breadcrumb({ root, items }: { root: string; items: NavItem[] }) {
  const pathname = usePathname();
  const current = items.find((i) => isActive(pathname, i.href));
  return (
    <p className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground lg:flex">
      <span className="whitespace-nowrap">{root}</span>
      {current && (
        <>
          <ChevronRightIcon className="size-3.5 opacity-70" aria-hidden />
          <span className="font-medium whitespace-nowrap text-foreground">{current.label}</span>
        </>
      )}
    </p>
  );
}
