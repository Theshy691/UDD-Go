# Roadmap implementation status

Updated November 13, 2026 (Asia/Manila).

The user authorized the full FEATURE_ROADMAP.md, with careful, incremental implementation aligned to the original system plan. The current changes implement the first foundation stage. The remaining stages are still authorized work; they are not implemented by this patch.

## Implemented foundation

- F01: dated trips, route/stop/resource snapshots, fixed passenger manifests, preserved history, manual preparation, guarded start/completion, and cancellation with a reason.
- F04 core: manual boarding and individual drop-off at assigned snapshot stops; duplicate/wrong-trip rejection; cabin-check and odometer requirements. New manifests start independently of completed ones.
- F11 foundation: append-only passenger events and server-written structured audit records, date-filtered trip history, and per-trip passenger CSV export. Students can export only their own records.
- Trip operation IDs bind the actor, action, and request. A repeated successful request returns the original result without duplicate events. Database locks and active-resource indexes enforce single active trips.
- Existing demo data upgrades in place. Only current active legacy routes receive imported manifests, with unknown historical times left unset. Demo trip mutations stage changes before persistence and use a browser lock when available.
- Live state reads remain bounded: surrounding seven days plus active trips, explicit 200-result limit for history, and manifests bounded by the 100-seat limit. Student RLS hides classmates; audit records are admin-only.
- GPS messages include their trip ID, preventing late samples from being applied to a later trip. Existing foreground GPS and private Broadcast architecture are retained.

## Deployment prerequisite

For a new Supabase project, run `supabase/schema.sql`, then `supabase/migrations/001_trip_history.sql`, once each. For an existing project, finish active legacy routes using the previous frontend, apply only the incremental migration, then roll out this frontend. Back up the existing database before cutover. The migration refuses to run while a legacy route is active and rolls back without changing data. Do not rerun the fresh-install schema on existing data.

The migration is implemented and tested locally. It has not been applied to a hosted project. Auth/Realtime in the PostgreSQL test harness are stubs; hosted integration still needs a configured test project.

## Validation

- `npm test`: 26 passing tests, including actual PostgreSQL execution of the incremental migration and guarded trip actions.
- `npm run build`: passed.
- Migration test: existing assignment survives upgrade; active-route cutover fails atomically.
- Authorization tests: student/outsider isolation, direct-write denial, admin-only audit visibility, blocked legacy trip mutation bypass.
- Lifecycle tests: safe retries, wrong-stop/wrong-passenger rejection, duplicate boarding rejection, required drop-off/cabin confirmation, nondecreasing odometer, cancellation permissions, retained first-trip manifest after starting another trip.
- Browser checks in WebKit: boarding/drop-off, blocked premature completion, successful completion and reload persistence, manual trip preparation/cancellation, and student preview restricted to their records. Production-preview mobile layout is also checked; screenshots are in ignored `output/playwright/`.

## Remaining implementation sequence

| Stage | Remaining work |
| --- | --- |
| 2 | F02 service calendar and AM/PM schedules; F03 versioned editing and substitutions; F04 absence/no-show handling; F05 invitations/recovery/deactivation; F06 freshness/checkpoints |
| 3 | F07 durable inbox and remote delivery; F09 incidents and acknowledgements; F10 inspections/work orders; remaining F11 reports, audit UI, imports, server directory search |
| 4 | F08 offline recording/reconciliation; QR option in F04; native background GPS and road-based ETA in F06 |
| 5 | F12 requests/waitlists; F13 verified guardian access when enabled by school policy |

Stage 2 must replace global single-route bus/driver/student constraints with dated service allocation before exposing multiple independent AM/PM services. Keep mutations transactional and update database permissions together with each new model. Route snapshots already preserve history and must remain independent of later edits.

Remote push, account invitations, and background GPS require their respective server/native setup and real integration tests. No feature should be labeled operational merely because a screen or a local mock exists. Keep these limitations visible as later stages are implemented.
