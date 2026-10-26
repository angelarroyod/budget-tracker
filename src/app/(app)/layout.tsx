import { LogOutIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { logout } from "@/app/actions";
import { MobileNav, type NavItem, SidebarNav } from "@/components/app-nav";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countWaitingOn } from "@/lib/approval-queries";
import { getCurrentUser } from "@/lib/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const [waiting, t, tApp, tTop, tRoles, tApprovals] = await Promise.all([
    countWaitingOn(user.id),
    getTranslations("nav"),
    getTranslations("app"),
    getTranslations("topbar"),
    getTranslations("roles"),
    getTranslations("approvals.tabs"),
  ]);

  const items: NavItem[] = [
    user.teamId
      ? { href: `/teams/${user.teamId}`, label: t("myTeam"), icon: "team" }
      : { href: "/", label: t("dashboard"), icon: "dashboard" },
    { href: "/expenses", label: t("expenses"), icon: "expenses" },
    { href: "/approvals", label: t("approvals"), icon: "approvals", badge: { count: waiting, label: tApprovals("mine") } },
  ];

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 border-r p-4 lg:block">
        <div className="mb-6 px-3">
          <p className="font-semibold">{tApp("name")}</p>
          <p className="text-xs text-muted-foreground">{tApp("site")}</p>
        </div>
        <SidebarNav items={items} label={t("label")} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <MobileNav items={items} label={t("label")} menuLabel={t("openMenu")} title={tApp("name")} />
          <span className="font-semibold lg:hidden">{tApp("name")}</span>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* Only FY2026 in the MVP; the selector shows where multi-year will plug in */}
            <Select value="FY2026" disabled>
              <SelectTrigger size="sm" aria-label={tTop("fiscalYear")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FY2026">FY2026</SelectItem>
              </SelectContent>
            </Select>
            <LocaleSwitch />
            <ThemeToggle />
            <div className="flex items-center gap-2 border-l pl-2">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium">{user.name}</p>
              </div>
              <Badge variant="secondary">{tRoles(user.role)}</Badge>
              <form action={logout}>
                <Button type="submit" variant="ghost" size="icon" aria-label={tTop("switchRole")} title={tTop("switchRole")}>
                  <LogOutIcon />
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
