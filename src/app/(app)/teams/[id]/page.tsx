import { eq } from "drizzle-orm";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { canSeeTeam, getCurrentUser } from "@/lib/dal";

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const user = await getCurrentUser();
  const teamId = Number((await params).id);
  // 404, not 403: don't reveal which team ids exist to someone who can't see them.
  if (!Number.isInteger(teamId) || !canSeeTeam(user, teamId)) notFound();

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) notFound();

  const [t, tTeams] = await Promise.all([getTranslations(), getTranslations("teams")]);
  return (
    <div className="max-w-4xl">
      <p className="text-sm text-muted-foreground">{t("team.title")}</p>
      <h1 className="text-2xl font-semibold">{tTeams(team.key as keyof Messages["teams"])}</h1>
      <p className="mt-6 text-muted-foreground">{t("comingSoon", { phase: 4 })}</p>
    </div>
  );
}
