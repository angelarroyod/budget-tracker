import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Forecast } from "@/lib/forecast";
import { money } from "@/lib/format";
import type { TeamSnapshot } from "@/lib/queries";

export async function TeamTable({ teams, site }: { teams: TeamSnapshot[]; site: Forecast }) {
  const [t, tTeams, tSite, format] = await Promise.all([
    getTranslations("dashboard.table"),
    getTranslations("teams"),
    getTranslations("dashboard"),
    getFormatter(),
  ]);
  const num = "text-right tabular-nums";
  const sorted = teams.toSorted((a, b) => b.forecast.budget - a.forecast.budget);

  const row = (f: Forecast) => (
    <>
      <TableCell className={num}>{money(format, f.budget)}</TableCell>
      <TableCell className={num}>{money(format, f.actual)}</TableCell>
      <TableCell className={num}>{money(format, f.committed)}</TableCell>
      <TableCell className={num}>{money(format, f.projected)}</TableCell>
      <TableCell className={num}>{money(format, f.variance)}</TableCell>
      <TableCell><StatusBadge status={f.status} /></TableCell>
    </>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("team")}</TableHead>
          <TableHead className="text-right">{t("budget")}</TableHead>
          <TableHead className="text-right">{t("actual")}</TableHead>
          <TableHead className="text-right">{t("committed")}</TableHead>
          <TableHead className="text-right">{t("projected")}</TableHead>
          <TableHead className="text-right">{t("variance")}</TableHead>
          <TableHead>{t("status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((team) => (
          <TableRow key={team.id}>
            <TableCell className="font-medium">
              <Link href={`/teams/${team.id}`} className="underline-offset-4 hover:underline">
                {tTeams(team.key as keyof Messages["teams"])}
              </Link>
            </TableCell>
            {row(team.forecast)}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">{tSite("title")}</TableCell>
          {row(site)}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
