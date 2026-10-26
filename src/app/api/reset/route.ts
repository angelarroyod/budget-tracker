import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { seed } from "@/db/seed";

/**
 * Nightly demo reset (vercel.json cron, 03:00 UTC): wipes visitors' changes and reloads the
 * deterministic seed. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Constant-time compare; refuse outright when no secret is configured.
  const ok =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const started = Date.now();
  await seed(db);
  const [{ count }] = await db.execute<{ count: string }>(sql`select count(*) from expenses`);
  return Response.json({ ok: true, expenses: Number(count), ms: Date.now() - started });
}
