"use client";

import { SearchIcon } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type FilterValues = { team?: string; month?: string; status?: string; approval?: string; q?: string };
type Option = { value: string; label: string };

/** GET form: filters live in the URL (shareable, back-button friendly). Selects apply on change. */
export function FilterBar({ values, teams, months }: { values: FilterValues; teams: Option[] | null; months: Option[] }) {
  const t = useTranslations("expenses");
  const tStatus = useTranslations("expenseStatus");
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();

  const select = (name: keyof FilterValues, label: string, all: string, options: Option[]) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <NativeSelect name={name} aria-label={label} defaultValue={values[name] ?? ""} onChange={submit} className="min-w-36">
        <NativeSelectOption value="">{all}</NativeSelectOption>
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <Form action="/expenses" replace aria-label={t("filters.label")} className="flex flex-wrap items-end gap-3">
      {teams && select("team", t("filters.team"), t("filters.allTeams"), teams)}
      {select("month", t("filters.month"), t("filters.allMonths"), months)}
      {select("status", t("filters.status"), t("filters.allStatuses"), (["committed", "accrued", "actual"] as const).map((s) => ({ value: s, label: tStatus(s) })))}
      {select("approval", t("filters.approval"), t("filters.allApprovals"), (["none", "pending", "approved", "rejected"] as const).map((a) => ({ value: a, label: t(`approval.${a}`) })))}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("filters.search")}
        <div className="flex gap-1">
          <Input name="q" type="search" defaultValue={values.q ?? ""} placeholder={t("filters.searchPlaceholder")} className="h-8 w-56" />
          <Button type="submit" variant="outline" size="icon" aria-label={t("filters.search")}>
            <SearchIcon />
          </Button>
        </div>
      </label>
      {Object.values(values).some(Boolean) && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/expenses" />}>
          {t("filters.clear")}
        </Button>
      )}
    </Form>
  );
}
