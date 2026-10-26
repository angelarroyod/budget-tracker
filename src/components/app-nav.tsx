"use client";

import { CheckSquareIcon, LayoutDashboardIcon, MenuIcon, ReceiptIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const ICONS = { dashboard: LayoutDashboardIcon, team: UsersIcon, expenses: ReceiptIcon, approvals: CheckSquareIcon };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: { count: number; label: string } };

function NavLinks({ items, label, onNavigate }: { items: NavItem[]; label: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
            {item.badge && item.badge.count > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                {item.badge.count}
                <span className="sr-only"> {item.badge.label}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNav({ items, label }: { items: NavItem[]; label: string }) {
  return <NavLinks items={items} label={label} />;
}

export function MobileNav({ items, label, menuLabel, title }: { items: NavItem[]; label: string; menuLabel: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label={menuLabel} />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-4">
        <SheetTitle className="mb-4">{title}</SheetTitle>
        <NavLinks items={items} label={label} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
