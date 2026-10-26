import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, verifySession } from "./session";

export type CurrentUser = typeof users.$inferSelect;

/** The signed-in user, loaded once per request. Redirects to /login when there is none. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const userId = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) redirect("/login");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) redirect("/login"); // e.g. cookie from before a data reset
  return user;
});

/** Executive and finance see every team; champions and delegates only their own. */
export const canSeeTeam = (user: CurrentUser, teamId: number) =>
  user.role === "executive" || user.role === "finance" || user.teamId === teamId;

/** Where each role lands after login. */
export const homePath = (user: CurrentUser) =>
  user.role === "champion" || user.role === "delegate" ? `/teams/${user.teamId}` : "/";
