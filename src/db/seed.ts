import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "./schema";

/**
 * Deterministic demo data for Cobalt Industrial – Monterrey Plant, FY2026, current month October.
 * Story the dashboard should reveal at a glance:
 *   Facilities  → HVAC contract overrun, projected over budget   (amber, At risk)
 *   Maintenance → $820k emergency compressor in July, already over (red, Over budget)
 *   Quality/IT  → under plan on calibration / licenses             (savings callouts)
 *   Quality     → $1,000,000 microscope committed for FY2027       (next-year commitment)
 * Fixed PRNG seed so numbers and screenshots never change between resets.
 */

type DB = PostgresJsDatabase<typeof s>;

const CURRENT_MONTH = 10;

// mulberry32 — tiny deterministic PRNG
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2026);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const usd = (dollars: number) => Math.round(dollars * 100);
const round100 = (c: number) => Math.round(c / 10_000) * 10_000; // to nearest $100

// MXN per USD by fiscal month. Nov–Dec reuse October (no future rates yet).
const FX = [17.85, 17.62, 17.4, 17.95, 18.3, 18.55, 18.2, 18.7, 19.1, 18.9, 18.9, 18.9];

/** Amount in original currency + locked rate → both cent amounts. */
function money(usdCents: number, currency: "USD" | "MXN", month: number) {
  const rate = currency === "USD" ? 1 : FX[month - 1];
  const amountOrigCents = currency === "USD" ? usdCents : Math.round(usdCents * rate);
  return {
    currency,
    fxRate: rate.toFixed(6),
    amountOrigCents,
    amountUsdCents: Math.round(amountOrigCents / rate),
  };
}

type Item = { code: string; en: string; es: string; weight: number };
type Team = { key: string; budget: number; champion: string; vendors: string[]; items: Item[] };

const TEAMS: Team[] = [
  {
    key: "facilities", budget: 7_200_000, champion: "Marco Treviño",
    vendors: ["TecnoFrío Industrial", "LimpiaMax Servicios", "Energía del Norte", "Constructora Cerro Alto"],
    items: [
      { code: "6100", en: "HVAC maintenance contract", es: "Contrato de mantenimiento HVAC", weight: 0.35 },
      { code: "6110", en: "Janitorial services", es: "Servicios de limpieza", weight: 0.2 },
      { code: "6120", en: "Electricity", es: "Electricidad", weight: 0.3 },
      { code: "6130", en: "Building repairs", es: "Reparaciones de edificio", weight: 0.15 },
    ],
  },
  {
    key: "operations", budget: 4_000_000, champion: "Daniela Salinas",
    vendors: ["Insumos Fabriles del Norte", "EmpaquePro", "Talento Temporal MX"],
    items: [
      { code: "6200", en: "Production consumables", es: "Consumibles de producción", weight: 0.45 },
      { code: "6210", en: "Packaging materials", es: "Material de empaque", weight: 0.3 },
      { code: "6220", en: "Temporary labor", es: "Personal temporal", weight: 0.25 },
    ],
  },
  {
    key: "ehs", budget: 1_400_000, champion: "Jorge Villarreal",
    vendors: ["SeguraTex", "Capacita Seguridad", "EcoResiduos Norte"],
    items: [
      { code: "6300", en: "PPE", es: "Equipo de protección personal", weight: 0.4 },
      { code: "6310", en: "Safety training", es: "Capacitación en seguridad", weight: 0.25 },
      { code: "6320", en: "Environmental permits", es: "Permisos ambientales", weight: 0.15 },
      { code: "6330", en: "Waste disposal", es: "Disposición de residuos", weight: 0.2 },
    ],
  },
  {
    key: "quality", budget: 2_300_000, champion: "Patricia Leal",
    vendors: ["Metrología Precisa", "LabSur Insumos", "CertiNorte Auditores"],
    items: [
      { code: "6400", en: "Calibration services", es: "Servicios de calibración", weight: 0.3 },
      { code: "6410", en: "Lab consumables", es: "Consumibles de laboratorio", weight: 0.35 },
      { code: "6420", en: "Certification audits", es: "Auditorías de certificación", weight: 0.2 },
      { code: "6430", en: "Metrology equipment", es: "Equipo de metrología", weight: 0.15 },
    ],
  },
  {
    key: "maintenance", budget: 3_100_000, champion: "Ricardo Elizondo",
    vendors: ["Refacciones Garza", "Mantenimiento Integral Apodaca", "Lubricantes Sierra", "Herramientas del Valle"],
    items: [
      { code: "6500", en: "Spare parts", es: "Refacciones", weight: 0.4 },
      { code: "6510", en: "Preventive maintenance", es: "Mantenimiento preventivo", weight: 0.35 },
      { code: "6520", en: "Lubricants", es: "Lubricantes", weight: 0.1 },
      { code: "6530", en: "Tools", es: "Herramientas", weight: 0.15 },
    ],
  },
  {
    key: "engineering", budget: 2_600_000, champion: "Fernanda Cavazos",
    vendors: ["DiseñoSoft", "Prototipos Rápidos MTY", "Ingeniería Aliada"],
    items: [
      { code: "6600", en: "Design software", es: "Software de diseño", weight: 0.25 },
      { code: "6610", en: "Prototyping", es: "Prototipos", weight: 0.35 },
      { code: "6620", en: "Contract engineering", es: "Ingeniería por contrato", weight: 0.4 },
    ],
  },
  {
    key: "it", budget: 2_200_000, champion: "Héctor Montemayor",
    vendors: ["Licencias Globales", "CompuNorte", "RedPlus Telecom", "NubeMX"],
    items: [
      { code: "6700", en: "Software licenses", es: "Licencias de software", weight: 0.4 },
      { code: "6710", en: "Hardware", es: "Hardware", weight: 0.3 },
      { code: "6720", en: "Network services", es: "Servicios de red", weight: 0.2 },
      { code: "6730", en: "Cloud services", es: "Servicios en la nube", weight: 0.1 },
    ],
  },
  {
    key: "hr", budget: 1_200_000, champion: "Lucía Benavides",
    vendors: ["Desarrollo Humano Consultores", "BuscaTalento", "Eventos Fundidora"],
    items: [
      { code: "6800", en: "Training programs", es: "Programas de capacitación", weight: 0.35 },
      { code: "6810", en: "Recruiting", es: "Reclutamiento", weight: 0.25 },
      { code: "6820", en: "Employee events", es: "Eventos para empleados", weight: 0.15 },
      { code: "6830", en: "Benefits administration", es: "Administración de beneficios", weight: 0.25 },
    ],
  },
];

/** Spend vs. plan multiplier — this is where each team's story lives. */
function factor(team: string, code: string, month: number) {
  if (code === "6100" && month >= 5) return 1.35; // HVAC overrun from May
  if (code === "6300") return month >= 4 && month <= 6 ? 1.4 : month >= 7 ? 0.8 : 1; // PPE spike, then recovery
  if (code === "6400") return 0.75; // calibration savings
  if (code === "6700") return 0.7; // license savings
  if (team === "facilities" || team === "maintenance") return between(0.95, 1.02);
  return between(0.88, 1.03);
}

function statusFor(month: number): s.ExpenseStatus {
  if (month <= 8) return "actual";
  if (month === 9) return rand() < 0.7 ? "actual" : "accrued";
  if (month === CURRENT_MONTH) return rand() < 0.4 ? "accrued" : "committed";
  return "committed";
}

const at = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day, 15));

export async function seed(db: DB) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate approval_steps, approval_requests, expenses, plans, line_items,
      users, teams, fx_rates, settings restart identity cascade`);

    await tx.insert(s.settings).values({ id: 1, financeThresholdCents: usd(25_000) });
    await tx.insert(s.fxRates).values(FX.map((r, i) => ({ month: i + 1, usdMxn: r.toFixed(6) })));

    const teamRows = await tx.insert(s.teams).values(TEAMS.map((t) => ({ key: t.key }))).returning();
    const teamId = Object.fromEntries(teamRows.map((t) => [t.key, t.id]));

    const userRows = await tx
      .insert(s.users)
      .values([
        { name: "Elena Ruiz", email: "elena.ruiz@cobalt.example", role: "executive" as const },
        { name: "Sofía Garza", email: "sofia.garza@cobalt.example", role: "finance" as const },
        ...TEAMS.map((t) => ({
          name: t.champion,
          email: `${t.key}.champion@cobalt.example`,
          role: "champion" as const,
          teamId: teamId[t.key],
        })),
        { name: "Luis Hernández", email: "luis.hernandez@cobalt.example", role: "delegate" as const, teamId: teamId.facilities },
        { name: "Ana Cantú", email: "ana.cantu@cobalt.example", role: "delegate" as const, teamId: teamId.engineering },
      ])
      .returning();
    const user = (name: string) => userRows.find((u) => u.name === name)!.id;
    const champion = (key: string) => user(TEAMS.find((t) => t.key === key)!.champion);
    const executive = user("Elena Ruiz");
    const finance = user("Sofía Garza");

    const plans: (typeof s.plans.$inferInsert)[] = [];
    const expenses: (typeof s.expenses.$inferInsert)[] = [];

    for (const t of TEAMS) {
      const itemRows = await tx
        .insert(s.lineItems)
        .values(t.items.map((i) => ({ teamId: teamId[t.key], accountCode: i.code, nameEn: i.en, nameEs: i.es })))
        .returning();

      for (const [idx, item] of t.items.entries()) {
        const lineItemId = itemRows[idx].id;
        const annual = usd(t.budget * item.weight);
        const monthly = round100(annual / 12);
        const delegate = t.key === "facilities" ? user("Luis Hernández") : t.key === "engineering" ? user("Ana Cantú") : null;

        for (let m = 1; m <= 12; m++) {
          // December absorbs rounding so the annual plan is exact
          const planCents = m === 12 ? annual - monthly * 11 : monthly;
          plans.push({ lineItemId, month: m, amountCents: planCents });

          // Booked spend: Jan–Oct for everything; Nov–Dec only for the HVAC contract (already committed).
          const futureCommitted = item.code === "6100" && m > CURRENT_MONTH;
          if (m > CURRENT_MONTH && !futureCommitted) continue;

          const target = Math.round(planCents * factor(t.key, item.code, m));
          const pieces = futureCommitted ? 1 : 1 + Math.floor(rand() * 3);
          let left = target;
          for (let p = 0; p < pieces; p++) {
            const share = p === pieces - 1 ? left : Math.round(left * between(0.3, 0.6));
            left -= share;
            expenses.push({
              teamId: teamId[t.key],
              lineItemId,
              description: pieces > 1 ? `${item.en} – part ${p + 1}` : item.en,
              vendor: pick(t.vendors),
              fiscalMonth: m,
              status: futureCommitted ? "committed" : statusFor(m),
              ...money(share, rand() < 0.3 ? "MXN" : "USD", m),
              createdBy: delegate && rand() < 0.4 ? delegate : champion(t.key),
              createdAt: at(Math.min(m, CURRENT_MONTH), 1 + Math.floor(rand() * 25)),
            });
          }
        }
      }

      // Quality: next fiscal year commitment — excluded from FY2026 forecast
      if (t.key === "quality") {
        expenses.push({
          teamId: teamId.quality,
          lineItemId: itemRows[3].id,
          description: "Scanning electron microscope (FY2027 delivery)",
          vendor: "Metrología Precisa",
          fiscalMonth: 12,
          status: "committed",
          ...money(usd(1_000_000), "USD", 12),
          nextFy: true,
          createdBy: champion("quality"),
          createdAt: at(9, 18),
        });
      }
    }

    await tx.insert(s.plans).values(plans);
    await tx.insert(s.expenses).values(expenses);

    // Approval requests: unbudgeted expenses (no line item) with their step history.
    type Step = { role: s.StepRole; approverId: number; decision: s.StepDecision; decidedAt?: Date; comment?: string };
    const requests: {
      team: string; requester: number; description: string; vendor: string; month: number;
      status: s.ExpenseStatus; usdCents: number; currency: "USD" | "MXN"; reason: string;
      createdAt: Date; steps: Step[];
    }[] = [
      {
        team: "maintenance", requester: champion("maintenance"), month: 7, status: "actual",
        description: "Emergency air compressor replacement", vendor: "Mantenimiento Integral Apodaca",
        usdCents: usd(820_000), currency: "USD", createdAt: at(7, 9),
        reason: "Main compressor failed; line 3 stopped. Replacement required to resume production.",
        steps: [
          { role: "champion", approverId: champion("maintenance"), decision: "skipped" },
          { role: "executive", approverId: executive, decision: "approved", decidedAt: at(7, 9) },
          { role: "finance", approverId: finance, decision: "approved", decidedAt: at(7, 10) },
        ],
      },
      {
        team: "it", requester: champion("it"), month: 9, status: "committed",
        description: "Team offsite venue", vendor: "Eventos Fundidora",
        usdCents: usd(15_000), currency: "USD", createdAt: at(9, 3),
        reason: "Annual IT planning offsite.",
        steps: [
          { role: "champion", approverId: champion("it"), decision: "skipped" },
          { role: "executive", approverId: executive, decision: "rejected", decidedAt: at(9, 5),
            comment: "Not this year — use on-site meeting rooms." },
        ],
      },
      {
        team: "facilities", requester: user("Luis Hernández"), month: 10, status: "committed",
        description: "Emergency roof leak repair, warehouse B", vendor: "Constructora Cerro Alto",
        usdCents: usd(18_400), currency: "MXN", createdAt: at(10, 21),
        reason: "Leak over finished-goods racks after storm; temporary tarp in place.",
        steps: [
          { role: "champion", approverId: champion("facilities"), decision: "pending" },
          { role: "executive", approverId: executive, decision: "pending" },
        ],
      },
      {
        team: "facilities", requester: champion("facilities"), month: 10, status: "committed",
        description: "Temporary chiller rental", vendor: "TecnoFrío Industrial",
        usdCents: usd(42_000), currency: "USD", createdAt: at(10, 19),
        reason: "Chiller 2 down until parts arrive; rental keeps molding area within spec.",
        steps: [
          { role: "champion", approverId: champion("facilities"), decision: "skipped" },
          { role: "executive", approverId: executive, decision: "pending" },
          { role: "finance", approverId: finance, decision: "pending" },
        ],
      },
      {
        team: "operations", requester: champion("operations"), month: 10, status: "committed",
        description: "Overtime cleaning crew for customer audit", vendor: "LimpiaMax Servicios",
        usdCents: usd(12_500), currency: "USD", createdAt: at(10, 22),
        reason: "Customer audit on Nov 4; deep clean of lines 1–4.",
        steps: [
          { role: "champion", approverId: champion("operations"), decision: "skipped" },
          { role: "executive", approverId: executive, decision: "pending" },
        ],
      },
      {
        team: "engineering", requester: user("Ana Cantú"), month: 10, status: "committed",
        description: "Industrial 3D printer for prototyping lab", vendor: "Prototipos Rápidos MTY",
        usdCents: usd(61_000), currency: "USD", createdAt: at(10, 14),
        reason: "Cuts outsourced prototype lead time from 3 weeks to 2 days.",
        steps: [
          { role: "champion", approverId: champion("engineering"), decision: "approved", decidedAt: at(10, 15) },
          { role: "executive", approverId: executive, decision: "approved", decidedAt: at(10, 20) },
          { role: "finance", approverId: finance, decision: "pending" },
        ],
      },
      {
        team: "ehs", requester: champion("ehs"), month: 10, status: "committed",
        description: "Spill containment kits", vendor: "SeguraTex",
        usdCents: usd(8_500), currency: "MXN", createdAt: at(10, 23),
        reason: "New chemical storage area requires kits before go-live.",
        steps: [
          { role: "champion", approverId: champion("ehs"), decision: "skipped" },
          { role: "executive", approverId: executive, decision: "pending" },
        ],
      },
    ];

    for (const r of requests) {
      const decisions = r.steps.map((st) => st.decision);
      const outcome = decisions.includes("rejected") ? "rejected"
        : decisions.includes("pending") ? "pending" : "approved";
      const lastDecided = r.steps.findLast((st) => st.decidedAt)?.decidedAt;

      const [exp] = await tx
        .insert(s.expenses)
        .values({
          teamId: teamId[r.team],
          lineItemId: null,
          description: r.description,
          vendor: r.vendor,
          fiscalMonth: r.month,
          status: r.status,
          ...money(r.usdCents, r.currency, r.month),
          approval: outcome,
          createdBy: r.requester,
          createdAt: r.createdAt,
        })
        .returning({ id: s.expenses.id });

      const [req] = await tx
        .insert(s.approvalRequests)
        .values({
          expenseId: exp.id,
          requesterId: r.requester,
          reason: r.reason,
          status: outcome,
          createdAt: r.createdAt,
          closedAt: outcome === "pending" ? null : lastDecided,
        })
        .returning({ id: s.approvalRequests.id });

      await tx.insert(s.approvalSteps).values(
        r.steps.map((st, i) => ({
          requestId: req.id,
          seq: i + 1,
          role: st.role,
          approverId: st.approverId,
          decision: st.decision,
          comment: st.comment,
          decidedAt: st.decidedAt,
        })),
      );
    }
  });
}

// `pnpm db:seed` runs this file directly; /api/reset (Phase 7) imports seed().
if (process.argv[1]?.replaceAll("\\", "/").endsWith("src/db/seed.ts")) {
  (async () => {
    const { db, client } = await import("./index");
    await seed(db);
    const [{ count }] = await db.execute<{ count: string }>(sql`select count(*) from expenses`);
    console.log(`Seeded ${count} expenses.`);
    await client.end();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
