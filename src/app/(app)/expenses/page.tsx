import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/dal";

export default async function ExpensesPage() {
  await getCurrentUser();
  const t = await getTranslations();
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">{t("nav.expenses")}</h1>
      <p className="mt-6 text-muted-foreground">{t("comingSoon", { phase: 5 })}</p>
    </div>
  );
}
