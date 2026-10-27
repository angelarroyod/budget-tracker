import { getLocale, getTranslations } from "next-intl/server";
import { setLocale } from "@/app/actions";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { locale: "en-US", short: "EN", name: "English" },
  { locale: "es-MX", short: "ES", name: "Español" },
] as const;

/** Plain form + server action: works before hydration and without JS. */
export async function LocaleSwitch() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("topbar")]);
  return (
    <form action={setLocale}>
      <div role="group" aria-label={t("language")} className="flex rounded-lg bg-muted p-0.5">
      {OPTIONS.map((o) => (
        <Button
          key={o.locale}
          type="submit"
          name="locale"
          value={o.locale}
          size="xs"
          variant="ghost"
          className={o.locale === locale ? "bg-card font-semibold shadow-xs hover:bg-card" : "text-foreground/70"}
          aria-pressed={o.locale === locale}
          lang={o.locale}
        >
          {/* Accessible name "EN (English)" contains the visible "EN" (WCAG 2.5.3, label in name) */}
          {o.short}
          <span className="sr-only"> ({o.name})</span>
        </Button>
      ))}
      </div>
    </form>
  );
}
