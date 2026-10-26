"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { homePath } from "@/lib/dal";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { LOCALE_COOKIE, type Locale, locales } from "@/i18n/request";

const DEMO_ACCOUNTS = {
  executive: "elena.ruiz@cobalt.example",
  champion: "facilities.champion@cobalt.example",
  finance: "sofia.garza@cobalt.example",
} as const;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
} as const;

export async function loginAs(formData: FormData) {
  const role = formData.get("role");
  // Only the three demo accounts can be signed into, whatever the form posts.
  if (role !== "executive" && role !== "champion" && role !== "finance") return;
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_ACCOUNTS[role]));
  if (!user) throw new Error(`Demo account for ${role} is missing. Run db:seed.`);
  (await cookies()).set(SESSION_COOKIE, await signSession(user.id), cookieOptions);
  redirect(homePath(user));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!locales.includes(locale as Locale)) return;
  // Setting a cookie in a server action re-renders the current page with the new locale.
  (await cookies()).set(LOCALE_COOKIE, locale as Locale, { ...cookieOptions, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
}
