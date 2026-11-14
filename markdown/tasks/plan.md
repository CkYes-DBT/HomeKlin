# Implementation Plan: HomeKlin Web Platform

## Overview
Build the HomeKlin website: a hosted, bilingual (Indonesian/English) middleman between customers and partner cleaning agencies. **To the customer, HomeKlin is one cleaning company** with its own services and one price list (set by admin); bookings are routed automatically to a partner agency in the customer's area with the slot free, and agencies are never shown on customer pages (decision of 2026-10-18). Visitors land on a landing page at `/`; the customer app home is `/home`. Customers and cleaners use mobile-first pages. Agencies, admins and the owner use desktop-first pages (the owner dashboard, added 2026-11-03, covers business numbers, partner agency oversight and admin accounts; HomeKlin is in effect a remote cleaning agency whose cleaning is done by partner agencies). Scope is everything the Quality Plan tests, built in the spec's priority order. Deadline: Contract end, **9 Nov 2026** (about 3 weeks from 17 Oct). Free tiers only. Demo footage is pre-recorded clips you supply.

## Architecture decisions
- **Next.js (App Router) + TypeScript + Tailwind, on Vercel.** One codebase with route groups per role: `(customer)`, `(cleaner)`, `(agency)`, `(admin)`, `(owner)`.
- **Supabase** for Postgres, Auth, Realtime (chat), Storage (recordings). **Row-level security (RLS) is the real access control**; UI checks are only a convenience.
- **Vertical slices.** Each task delivers schema + API + UI + test for one user-visible behaviour, and leaves the app working. Migrations are added per slice, not all up front.
- **Stream source seam.** The live viewer reads from a `StreamSource` interface. Demo source = looped pre-recorded clip. LiveKit source is built last (task 31-33) and swapped in.
- **Recording seam.** One `attachRecording(jobId)` function. Demo version attaches a pre-recorded clip from a private bucket; a real capture can replace it later.
- **Payment** = Midtrans Sandbox (Snap) + signed, idempotent webhook.
- **Tests:** Vitest (unit/integration), Playwright (one e2e spec per Quality Plan scenario; mobile and desktop viewports).

## Skills used (and when)
| When | Skill | Use |
|---|---|---|
| Every task | `incremental-implementation`, `test-driven-development` | thin slices; failing test first |
| Setup (T1-T2) | `constraint-driven-development`, `git-workflow-and-versioning`, `ci-cd-and-automation` | write markdown/CONSTRAINTS.md, atomic commits, CI gates |
| Any library code (Next, Supabase, LiveKit, Midtrans, next-intl) | `source-driven-development` | check current official docs before coding |
| UI direction (T3) | `design-taste-frontend` **or** `impeccable` (pick one), `ui-ux-pro-max` | one-time visual direction, tokens, patterns |
| Redesign and landing page (T3b) | `design-taste-frontend` (incl. its Section 14 pre-flight), `frontend-ui-engineering` | one-brand redesign from researched references; landing rules |
| Every UI task | `frontend-ui-engineering` | accessible, responsive components |
| Endpoints (orders, webhook, tokens, signed URLs) | `api-and-interface-design` | contracts and error shapes |
| Access-control tasks | `security-and-hardening`, `doubt-driven-development` | RLS, token scoping, payment status |
| Browser checks | `browser-testing-with-devtools` | needs Chrome DevTools MCP configured |
| Failures | `debugging-and-error-recovery` | reproduce, localise, fix, guard |
| Each checkpoint | `code-review-and-quality` (`/agent-skills:review`) | five-axis review |
| Late | `performance-optimization` (`/agent-skills:webperf`), `code-simplification` | mobile speed; cleanup |
| Docs | `documentation-and-adrs` | ADRs, handover docs |
| Launch | `shipping-and-launch` (`/agent-skills:ship`) | pre-demo checklist |
Figma skills are skipped: the Figma connection failed earlier.

## Quality Plan coverage
| Quality attribute (target) | Where it is built and proven |
|---|---|
| Functional correctness (100% critical) | all slices; T37 full e2e suite |
| Streaming performance (<=3 s) | T32-T33 (real LiveKit only) |
| Streaming reliability | T32 (adaptive bitrate, reconnect) |
| Security and privacy | T5, T14, T23, T29, T29c, T34 |
| Availability (>=99%) | T2, T37 (uptime monitor) |
| Usability (>=90% book unaided) | T8-T9, T35 (3-person trial) |
| Compatibility | T35 |
| Defect quality (0 critical) | T37 defect log |
| Customer support (100% escalation) | T19-T21 |
| Payment reliability (100%) | T10-T11 |

## Dependency graph (summary)
```
T1 scaffold -> T2 deploy -> T3 design shell -> T3b redesign + landing -> T4 i18n -> T5 auth/roles -> T6 seed
T6 -> catalog (T7, T7b admin prices, T8) -> booking with routing (T9) -> payment (T10,T11) -> order status (T12)
T12 -> recordings (T13-T16)           [customer replay = top priority]
T12 -> cleaner jobs + check-in (T17,T18) -> attaches recording at check-out
T5 -> support (T19-T21)               [independent of orders; can run in parallel]
T18 -> stream seam + live viewer (T22,T23) -> admin (T24-T26) -> agency (T27-T29)
T12, T9 -> owner dashboard (T29b,T29c)  [needs only orders and the agencies table; built after the agency back office]
T12 -> reviews (T30)
T23 -> LiveKit (T31-T33)
all -> hardening and ship (T34-T39)
```
Parallelisable: support (T19-T21) can be built any time after T5. Everything else is sequential.

## Suggested pacing (estimate, adjust as we go)
| Target date | Phases |
|---|---|
| 24 Oct | 1 Foundation, 2 Catalog and order |
| 29 Oct | 3 Recording replay, 4 Check-in, 5 Support |
| 4 Nov | 6 Live viewer, 7 Admin, 8 Agency |
| 7 Nov | 9 Reviews, 10 LiveKit, 11 hardening |
| 8-9 Nov | Ship checklist, buffer |
If behind schedule, work stops at the lowest-priority task reached (spec's Build Priority). Everything stays in scope.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Scope is large for ~3 weeks | High | strict priority order; checkpoints; vertical slices |
| Free tiers: Supabase pauses idle projects; 1 GB storage; LiveKit 5,000 min/month | Med | keep clips small; wake project before demo; LiveKit last |
| Role/RLS mistakes leak other users' video | High | RLS tests in the same task as each policy; T34 audit |
| Midtrans webhook retries cause wrong status | Med | idempotent handler + unit tests (T11) |
| No partner agency free in an area (or two customers take the last free capacity at once) | Med | only offer slots at least one agency in the area can serve (T7); race-safe routing that re-checks capacity in one transaction (T9); honest "no free slot in your area" empty state (T8); seed overlapping coverage for the demo (T6) |
| An agency name leaks onto a customer page | Med | e2e test that no customer page contains "agensi", "agency" or "mitra" (T3b, kept green in every later task); customer APIs never return agency identity (T7, T9) |
| Owner role is new (2026-11-03), late, and not part of the Quality Plan | Med | built after the agency back office (T29b, T29c); cut after reviews and real LiveKit but before the agency back office and admin grid; no Quality Plan scenario depends on it |
| Admin creation by the owner is a privilege-escalation path | High | owner-only server action (`authorize(["owner"])`), secret key on the server only, roles never taken from sign-up metadata (existing `handle_new_user` rule), tests that every other role is refused (T29b, T29c, T34) |
| Website vs Contract's Android app | Med | ADR (T38); the client agreed, get it in writing as Pasal 8 addendum |
| WebRTC latency/recovery can't be shown with clips | Med | explicit T33 measurement once LiveKit exists |
| Chrome DevTools MCP / accounts not set up | Low | human setup list below |

## Human setup needed (blocks tasks)
- Accounts and keys: Vercel, Supabase, Midtrans Sandbox, LiveKit Cloud (T2, T10, T31).
- Supply the short demo clips (T13).
- The client's written agreement to the website (Pasal 8 addendum).
- Chrome DevTools MCP configured, if you want browser verification (T35).

## Open questions
- Vercel Hobby limits not yet checked (check at T2).
- Product grading status unknown (not a blocker).

## Phase 13: Back-office redesign, admin first (2026-11-12)
The redesign moves to the admin group through the scoped `theme-forest` class (no rename codemod), starting with the "Layanan dan harga" screen. Tasks R1 to R7 in `markdown/tasks/todo.md`.
- **Skills:** `frontend-ui-engineering` (every step), `impeccable` (fidelity to the mock and polish), `test-driven-development` and `incremental-implementation`, `source-driven-development` (next/font, forms, updateTag), `deprecation-and-migration` (retiring the new and edit pages), `code-review-and-quality` at Checkpoint B. Not used: `design-taste-frontend` (direction already fixed), `ui-ux-pro-max` (overlaps impeccable), DevTools browser testing (not configured; Playwright screenshots instead), Figma (not connected).
- **Agents:** `homeklin-frontend` builds each task, one at a time (all tasks share globals.css, messages, the sidebar and the services e2e spec, so nothing runs in parallel); the lead runs the checks and commits; `code-reviewer` reviews at Checkpoint B.
- **Risk:** the other admin pages (monitor, tickets, recordings, dashboard) pick up the cream canvas, new fonts and new radii from the wrapper and look mixed until their own migration.

## Phase 15: Backend for the redesign (analysis 2026-11-14, proposed, not approved)
Every mock in `mocks/` was compared with the migrations and the read functions. Most screens can be built on today's backend. Some need small read-only additions; a few show features that do not exist. Tasks B1 to B14 in `markdown/tasks/todo.md`, in three tiers.
- **Tier 1, no new behaviour (read functions and a few columns):** the order number is missing from `my_orders`, `my_jobs` and `agency_jobs` (O1 added it only to `live_streams` and `admin_jobs`); there is no admin read of one order (customer name and phone, fee split, timeline); the agency fee is known only after check-out (`order_fees`), but the partner jobs list shows it before; owner and agency numbers have no 7/30/90-day period or "vs previous period"; `owner_admins` lacks last sign-in; there is no time for "assigned"; the cleaner home stats need counts over the month (`my_jobs` keeps only the last day).
- **Tier 2, small new behaviour:** a customer note for the cleaner (`orders.customer_note`, through `book_slot`); the payment method shown after paying (Midtrans `payment_type`, stored by the notification); payment method choice before Snap (`enabled_payments`, no schema); the "recording ready" email and the cleaner's profile in an email when the agency assigns one; "Kirim ulang email" (limited); a photo per service (column and bucket); the service types in the mock (four) against the enum (three); full windows shown as "penuh"; cleaner phone and area.
- **Tier 3, new features (scope decisions for the user):** agencies choose which services they offer (changes routing in `book_slot`); availability per cleaner instead of per agency capacity; cleaners chatting with admin (tickets are customer-only); support chat without an account; opening the order page from the email link without signing in; agency "waiting for approval" with an emailed invitation; a temporary admin password that must be changed; recurring bookings.
- **Order and risk:** tier 1 first (low risk, unblocks most screens); `book_slot` changes (B6, B12) are the riskiest because of its race-safety tests, so they run alone; every migration goes to the test project first, live only with the user's permission. Migrations run one after another, never in parallel agents.
- **Skills:** `test-driven-development` (integration tests against the test project, as for every migration so far), `security-and-hardening` for B8, B13 and tier 3, `api-and-interface-design` for the new read functions.
