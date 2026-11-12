import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { seed } from "@/db/seed";

/**
 * Nightly demo reset: wipes visitors' changes and reloads the deterministic seed. Called by the
 * GitHub Actions job in .github/workflows/nightly-reset.yml (which then runs the ledger pipeline)
 * and by the e2e suite, both with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Constant-time compare; refuse outright when no secret is configured.
  const ok =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    // Never log the secret; whether one is configured is what tells a misconfigured deploy from a stray request.
    console.warn("demo reset refused", { secretConfigured: !!secret, hadAuthHeader: given !== "" });
    return new Response("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  await seed(db);
  const [{ count }] = await db.execute<{ count: string }>(sql`select count(*) from expenses`);
  const result = { ok: true, expenses: Number(count), ms: Date.now() - started };
  console.log("demo reset done", result);
  return Response.json(result);
}
