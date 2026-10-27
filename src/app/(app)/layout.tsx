import { LogOutIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { logout } from "@/app/actions";
import { Breadcrumb, MobileNav, type NavItem, type NavTeam, SidebarNav } from "@/components/app-nav";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countWaitingOn } from "@/lib/approval-queries";
import { getCurrentUser } from "@/lib/dal";
import { percent } from "@/lib/format";
import { getSiteSnapshot } from "@/lib/queries";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const [waiting, t, tApp, tTop, tRoles, tApprovals, tTeams, tStatus, format] = await Promise.all([
    countWaitingOn(user.id),
    getTranslations("nav"),
    getTranslations("app"),
    getTranslations("topbar"),
    getTranslations("roles"),
    getTranslations("approvals.tabs"),
    getTranslations("teams"),
    getTranslations("status"),
    getFormatter(),
  ]);

  const items: NavItem[] = [
    user.teamId
      ? { href: `/teams/${user.teamId}`, label: t("myTeam"), icon: "team" }
      : { href: "/", label: t("dashboard"), icon: "dashboard" },
    { href: "/expenses", label: t("expenses"), icon: "expenses" },
    { href: "/approvals", label: t("approvals"), icon: "approvals", badge: { count: waiting, label: tApprovals("mine") } },
  ];

  // Site-wide roles get every team's landing point, worst first. Same cached snapshot the dashboard reads.
  let teams: { label: string; items: NavTeam[] } | undefined;
  if (!user.teamId) {
    const snap = await getSiteSnapshot();
    teams = {
      label: t("teamsProjected"),
      items: snap.teams
        .toSorted((a, b) => a.forecast.variance - b.forecast.variance)
        .map((x) => ({
          href: `/teams/${x.id}`,
          label: tTeams(x.key as keyof Messages["teams"]),
          status: x.forecast.status,
          statusLabel: tStatus(x.forecast.status),
          pct: percent(format, x.forecast.projected / x.forecast.budget),
        })),
    };
  }

  const logoutButton = (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="icon-sm" aria-label={tTop("switchRole")} title={tTop("switchRole")}>
        <LogOutIcon />
      </Button>
    </form>
  );

  return (
    <div className="flex flex-1">
      <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring">
        {t("skip")}
      </a>
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r px-3.5 pt-[18px] pb-3.5 lg:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold tracking-tight text-primary-foreground" aria-hidden>
            BT
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-[18px] font-semibold tracking-tight">{tApp("name")}</p>
            <p className="truncate text-xs text-muted-foreground">{tApp("site")}</p>
          </div>
        </div>

        <SidebarNav items={items} label={t("label")} teams={teams} />

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 rounded-[10px] bg-card p-2.5 ring-1 ring-border">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold ring-1 ring-border ring-inset" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-[17px] font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{tRoles(user.role)}</p>
            </div>
            {logoutButton}
          </div>
          <p className="px-1.5 text-xs text-muted-foreground">{tApp("demoBanner")}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The sidebar carries the demo notice on desktop; phones get it here. */}
        <p className="bg-muted px-4 py-1.5 text-center text-xs text-foreground lg:hidden">{tApp("demoBanner")}</p>
        <header className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2 lg:px-7">
          <MobileNav items={items} label={t("label")} teams={teams} menuLabel={t("openMenu")} title={tApp("name")} />
          <span className="font-semibold lg:hidden">{tApp("name")}</span>
          <Breadcrumb root={tApp("plant")} items={items} />

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* Only FY2026 in the MVP; the selector shows where multi-year will plug in. Hidden on phones, where a
                disabled control isn't worth a header row (the page subtitle already names the fiscal year). */}
            <Select value="FY2026" disabled>
              <SelectTrigger size="sm" aria-label={tTop("fiscalYear")} className="hidden bg-card tabular-nums sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FY2026">FY2026</SelectItem>
              </SelectContent>
            </Select>
            <LocaleSwitch />
            <ThemeToggle />
            {/* On desktop the user card lives at the foot of the sidebar. */}
            <div className="flex items-center gap-2 border-l pl-2 lg:hidden">
              <Badge variant="secondary">{tRoles(user.role)}</Badge>
              {logoutButton}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 px-4 pt-4 pb-10 outline-none md:px-7 md:pt-7">{children}</main>
      </div>
    </div>
  );
}
