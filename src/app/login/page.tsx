import { BriefcaseIcon, CalculatorIcon, UsersIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { loginAs } from "@/app/actions";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ROLES = [
  { role: "executive", icon: BriefcaseIcon, label: "asExecutive", hint: "asExecutiveHint" },
  { role: "champion", icon: UsersIcon, label: "asChampion", hint: "asChampionHint" },
  { role: "finance", icon: CalculatorIcon, label: "asFinance", hint: "asFinanceHint" },
] as const;

export default async function LoginPage() {
  const [t, tApp] = await Promise.all([getTranslations("login"), getTranslations("app")]);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-end gap-2">
          <p className="mr-auto text-xs text-muted-foreground">{tApp("demoBanner")}</p>
          <LocaleSwitch />
          <ThemeToggle />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{tApp("name")}</CardTitle>
            <CardDescription>{tApp("site")}</CardDescription>
          </CardHeader>
          <CardContent>
            <h1 className="font-medium">{t("title")}</h1>
            <p className="mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
            <form action={loginAs} className="flex flex-col gap-2">
              {ROLES.map(({ role, icon: Icon, label, hint }) => (
                <button
                  key={role}
                  type="submit"
                  name="role"
                  value={role}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t(label)}</span>
                    <span className="block text-sm text-muted-foreground">{t(hint)}</span>
                  </span>
                </button>
              ))}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
