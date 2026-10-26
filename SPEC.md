# Budget Tracker — MVP Spec

Open-source portfolio rebuild of a site budget tool. Full stack, public live demo, one-click demo roles.
All data fictional: **Cobalt Industrial – Monterrey Plant**, FY Jan–Dec 2026, current month October.

> One question the app must answer in 10 seconds: **where is spend today, and where will it land at year end?**

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server components + server actions = no separate API |
| UI | Tailwind + shadcn/ui | Standard components, clean handoff |
| Charts | Recharts | Bar, line; heat map = CSS grid (not a chart) |
| DB | Postgres (Neon free tier) + Drizzle ORM | Real SQL, typed schema, migrations |
| Validation | Zod | Same schema validates forms and server actions |
| i18n | next-intl | ES/EN messages + locale-aware `Intl` formatting |
| Hosting | Vercel + Vercel Cron | Nightly reseed of demo data |
| Tests | Vitest | Money math only (forecast, FX, approval routing) |

No auth library. Demo buttons only (see §6).

---

## 2. Core rules (the brain)

### 2.1 Money
- Store all amounts as **integer cents** (`bigint`). Never floats.
- **Reporting currency: USD.** Each expense keeps original amount + currency, the rate used, and the converted USD amount.
- FX rate is **locked when the expense is entered** (from that fiscal month's rate in `fx_rates`). Editing the amount re-converts at the same locked rate.
- Always display the currency code: `$12,400.00 USD`, `MXN 215,000.00`.

### 2.2 Plan vs. expenses
- **Plan** lives in `plans` (line item × month). Annual team budget = sum of its plans. No separate "budget" number to drift.
- **Expenses** have status `committed` → `accrued` → `actual`. It's one row whose status changes. No "Planned" expense status: the plan already holds planned spend.
- `booked` = committed + accrued + actual for a line item/month.

### 2.3 Projected year-end (per line item, per month, then summed)

```
month <  current month:  projected = booked                 (unused plan = savings)
month >= current month:  projected = max(plan, booked)      (assume plan gets spent, unless already exceeded)

projected_year_end = Σ projected over 12 months
variance           = budget − projected_year_end            (negative = over)
```

Excluded from the 2026 forecast:
- Expenses flagged `next_fy = true`. They show in the **Next-year commitments** KPI.
- Expenses with approval `pending` or `rejected`. Pending amount shows separately as **"Pending exposure"**.

### 2.4 Status (team, line item, site)

| Status | Rule | Color | Label/icon |
|---|---|---|---|
| Over budget | `actual + accrued > budget` | Red | `● Over budget` / alert icon |
| At risk | `projected > budget` and not over | Amber | `▲ At risk` / warning icon |
| On track | `projected ≤ budget` | Green | `✓ On track` / check icon |

Red means **only** "already over budget". Never as decoration.

### 2.5 Heat map cell (team × month)
- Value = `booked / plan` for that month.
- Future months (> current): neutral gray, no %, shown as "—".
- `plan = 0` and `booked = 0`: gray "—". `plan = 0` and `booked > 0`: red "Unplanned".
- Color scale: neutral blue ramp 0–100%, **red only above 100%**. Each cell prints its % (no color alone).
- Click opens `/teams/[id]?month=N`.

### 2.6 Savings callout
Per line item: savings = `max(0, Σ past months (plan − booked))`. Netted across past months, so an item that underspent in March but overspent in May shows only the net saving. The current month is still open and doesn't count. The champion dashboard shows the total plus the top 3 items.

### 2.7 Unbudgeted expense → approval
An expense needs approval when:
- it has no line item ("Unbudgeted"), **or**
- it pushes the line item's annual `booked` above its annual plan (next-FY expenses on a line item skip this check: they don't touch this year's plan).

Only champions and delegates raise requests (expenses belong to a team). That way the executive and finance steps can never be self-approvals.

Approval steps, in order:
1. **Champion**: skipped if the requester is the champion. A delegate can never approve their own request.
2. **Executive**: always.
3. **Finance**: only if the amount is ≥ `finance_threshold` (default **$25,000 USD**).

Any rejection ends the request (expense → `rejected`, excluded from forecast). Final approval → expense counts normally.

---

## 3. Data model (Drizzle)

```
teams            id, key ('facilities'…), champion_id
users            id, name, email, role ('executive'|'champion'|'delegate'|'finance'), team_id?
line_items       id, team_id, account_code, name_en, name_es
plans            line_item_id, month (1–12), amount_cents          PK(line_item_id, month)
fx_rates         month (1–12), usd_mxn numeric(12,6)
expenses         id, team_id, line_item_id?, description, vendor, fiscal_month,
                 status ('committed'|'accrued'|'actual'),
                 amount_orig_cents, currency ('USD'|'MXN'), fx_rate numeric(12,6), amount_usd_cents,
                 invoice_url?, next_fy bool, approval ('none'|'pending'|'approved'|'rejected'),
                 created_by, created_at, updated_at
approval_requests id, expense_id, requester_id, reason, status, created_at, closed_at?
approval_steps   id, request_id, seq, role, approver_id?, decision ('pending'|'approved'|'rejected'|'skipped'),
                 comment?, decided_at?
settings         id=1, finance_threshold_cents
```

Constraints worth putting in the DB, not app code: `CHECK (month BETWEEN 1 AND 12)`, `CHECK (amount_orig_cents > 0)`, FK indexes on `team_id`, `line_item_id`, `request_id`.

---

## 4. Screens (MVP)

| Route | Who | Content |
|---|---|---|
| `/login` | all | 3 buttons: **Executive**, **Champion (Facilities)**, **Finance**. "Demo data resets daily." |
| `/` | executive | Headline sentence · 6 KPI cards · projected vs budget by team (bar) · heat map · monthly planned/booked (bar + line) · team table · pending approvals panel |
| `/teams/[id]` | executive, that team's champion | Same layout scoped to one team + line items table (plan / committed / actual / projected) + savings callout. `?month=N` filters expenses to that month. |
| `/expenses` | all (champion scoped to team) | Filterable table (team, month, status, currency, approval) · add/edit in a Sheet |
| `/approvals` | executive, finance, champion | Queue of requests waiting on *my* step · quick approve/reject |
| `/approvals/[id]` | involved users | Request detail + vertical step timeline with timestamps |

**Headline sentence** (top of dashboard, generated from data):
> Projected to finish **$412,300 USD over budget (+3.4%)**. Facilities accounts for 71%.

**KPI cards**: Annual budget · Actual (+accrued) · Committed · Projected year-end · Variance · Next-year commitments.

**Expense form**: description, team (locked for champion), line item or "Unbudgeted", vendor, fiscal month, status, currency select, amount → live "≈ $X USD @ 18.4210", next-FY toggle, invoice (see §6). The submit toast says "Approval request created" when §2.7 triggers.

**Shell**: left sidebar · top bar with role badge, FY selector (2026 only in MVP, disabled), ES/EN switch, theme toggle. Spanish copy must fit: no fixed-width buttons, let table headers wrap.

---

## 5. Seed data (tells a story)

Site budget ≈ **$24M USD**. Narrative the demo should reveal in 10 seconds:

| Team | Budget (USD) | Story | Status |
|---|---|---|---|
| Facilities | 7.2M | HVAC contract overrun, projected over | 🟡 At risk |
| Maintenance | 3.1M | Emergency compressor repair in July | 🔴 Over |
| Operations | 4.0M | Steady | 🟢 |
| EHS | 1.4M | PPE spike in Q2, recovered | 🟢 |
| Quality | 2.3M | Calibration savings; **$1,000,000 microscope flagged next FY** | 🟢 |
| Engineering | 2.6M | Steady | 🟢 |
| IT | 2.2M | License savings → savings callout | 🟢 |
| HR | 1.2M | Steady | 🟢 |

- ~3–5 line items per team, ~400 expenses Jan–Oct, ~30% in MXN.
- FX rates per month around 17–20 MXN/USD.
- 5 pending approvals spread across steps (one waiting on Finance, above threshold).
- Users: Executive *Elena Ruiz*, Champion *Marco Treviño* (Facilities), Finance *Sofía Garza*, plus 7 champions and 2 delegates with no buttons.

Seed is a deterministic script (`db/seed.ts`, fixed random seed) so screenshots stay stable.

---

## 6. Demo mode

- **Login**: a server action sets an httpOnly, signed cookie `{ userId }`. Middleware redirects to `/login` without it. A "Switch role" item in the top bar returns to `/login`.
- **Authorization runs on the server for every query and action.** A champion can't read or write another team by editing a URL or form. The UI hiding things is not security.
- **Reset**: Vercel Cron hits `/api/reset` nightly (protected by `CRON_SECRET`) → truncate + reseed.
- **Invoice upload**: seeded expenses link to sample PDFs in `/public/invoices`. Upload is disabled in the demo (tooltip: "Disabled in public demo") to avoid hosting arbitrary files. Wire to Vercel Blob later if wanted.
- Banner: "Public demo · fictional data · resets daily at 03:00 UTC".

---

## 7. Build order

Each phase ends deployed. Deploy on day 1, not at the end.

| # | Phase | Done when |
|---|---|---|
| 0 | Scaffold: Next.js, Tailwind, shadcn, Drizzle, Neon, Vercel | Empty app live on a URL; `db:migrate` + `db:seed` run |
| 1 | `lib/forecast.ts`, `lib/fx.ts`, `lib/approvals.ts` + Vitest | Tests cover §2.3–2.7, including edge cases (plan 0, next_fy, pending, champion self-request skip) |
| 2 | Demo login, middleware, shell, i18n, theme | Three buttons work; ES/EN + dark mode switch everything |
| 3 | Executive dashboard | All 7 blocks render from DB; headline sentence correct |
| 4 | Team dashboard | Line items, savings callout, heat-map click lands here |
| 5 | Expenses list + form | Create/edit with FX preview; unbudgeted creates request |
| 6 | Approvals queue + detail | Full routing incl. Finance threshold; dashboard updates after approve |
| 7 | Reset cron, README case study, a11y pass, screenshots | Lighthouse a11y ≥ 95; README tells problem → decisions → result |

---

## 8. Out of scope (MVP)

CSV/Excel import · Settings screen (threshold editable only via seed) · Month close / adjustment entries · Delegate management UI · Multi-year selector · Real auth · Email notifications.

Add month close first after MVP: it's the most interesting domain feature to talk through in interviews.

---

## 9. Legal note

Built from scratch. No code, data, account structures, terminology or screenshots from any previous employer. README describes the *problem and outcome* only.
