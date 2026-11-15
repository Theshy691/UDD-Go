# Roadmap implementation status

Updated November 14, 2026 (Asia/Manila).

The user authorized the full FEATURE_ROADMAP.md, with careful, incremental implementation aligned to the original system plan. The trip foundation and the F02/F03 scheduling and route-management work are implemented locally. The rest of stage 2 and subsequent stages remain authorized work; they are not implemented by the current changes.

## Implemented foundation

- F01: dated trips, route/stop/resource snapshots, fixed passenger manifests, preserved history, manual preparation, guarded start/completion, and cancellation with a reason.
- F04 core: manual boarding and individual drop-off at assigned snapshot stops; duplicate/wrong-trip rejection; cabin-check and odometer requirements. New manifests start independently of completed ones.
- F11 foundation: append-only passenger events and server-written structured audit records, date-filtered trip history, and per-trip passenger CSV export. Students can export only their own records.
- Trip operation IDs bind the actor, action, and request. A repeated successful request returns the original result without duplicate events. Database locks and active-resource indexes enforce single active trips.
- Existing demo data upgrades in place. Only current active legacy routes receive imported manifests, with unknown historical times left unset. Demo trip mutations stage changes before persistence and use a browser lock when available.
- Live state reads remain bounded: surrounding seven days plus active trips, explicit 200-result limit for history, and manifests bounded by the 100-seat limit. Student RLS hides classmates; audit records are admin-only.
- GPS messages include their trip ID, preventing late samples from being applied to a later trip. Existing foreground GPS and private Broadcast architecture are retained.

## Deployment prerequisite

For a new Supabase project, run `supabase/schema.sql`, then migrations `001_trip_history.sql` and `002_services_and_route_versions.sql`, in numeric order, once each. Existing phase 1 installations apply only `002_services_and_route_versions.sql`. Original route-only installations must finish active legacy routes using the previous frontend before applying migration 001, which refuses an active-route cutover. Apply the outstanding migrations, then roll out the matching frontend. Back up the existing database first, and do not rerun the fresh-install schema on existing data.

Both migrations are implemented and tested locally. They have not been applied to a hosted project. Auth/Realtime in the PostgreSQL test harness are stubs; hosted integration still needs a configured test project.

## Validation

- `npm test`: 42 passing tests, including actual PostgreSQL execution of the incremental migration and guarded trip actions.
- `npm run build`: passed.
- Migration test: existing assignment survives upgrade; active-route cutover fails atomically.
- Authorization tests: student/outsider isolation, direct-write denial, admin-only audit visibility, blocked legacy trip mutation bypass.
- Lifecycle tests: safe retries, wrong-stop/wrong-passenger rejection, duplicate boarding rejection, required drop-off/cabin confirmation, nondecreasing odometer, cancellation permissions, retained first-trip manifest after starting another trip.
- Browser checks in WebKit: boarding/drop-off, blocked premature completion, successful completion and reload persistence, manual trip preparation/cancellation, and student preview restricted to their records. Production-preview mobile layout is also checked; screenshots are in ignored `output/playwright/`.


## Scheduling and route management implemented November 14

- F02: recurring outbound/return services, weekdays, effective dates, duration, turnaround, and date-specific school/service exceptions. Buses and drivers may be shared across non-overlapping services. Students may reserve multiple services with separate pickup/drop-off stops and effective dates.
- Generation: atomic, idempotent, admin-triggered creation of up to seven days of dated trips. Resource/student windows, seat limits, holidays, midnight crossings, and existing cancellations are checked. No unattended cron/job is configured; generation remains an explicit action.
- F03: route publishing with immutable stop versions, optimistic version checks, referenced-stop remapping, and archiving. Existing prepared/completed trip snapshots are retained.
- Resource replacement: capacity-checked scheduled substitutions and active handovers with reasons, outgoing mileage, reconciled passengers, resource history, and separate vehicle mileage segments.
- Trip-scoped GPS: active location channels use a changing epoch. An authenticated RPC rechecks the current publisher on every sample. Former drivers cannot mutate the trip or publish to its new epoch. Students receive aggregate occupancy while their classmates' records remain hidden.
- Updated driver/student portals select dated journeys instead of a single permanent route. Maps use the selected trip's saved stops and current resource assignment.
- Database tests exercise both incremental migrations, converted subscriptions, AM/PM allocations, conflicts, generation retries, exception cancellation, extra days, archived routes, version preservation, stop remapping, handovers, and private-channel authorization. Hosted Auth/Realtime remain stubbed in the test harness.
- Browser checks cover service creation, passenger reservations, trip generation, route publishing without changing prepared stops, school-calendar persistence, resource handover, removal of former-driver controls, and student privacy. Desktop/mobile screenshots are saved under ignored `output/playwright/`.

## Multi-role login portal and authentication implemented November 15

- Multi-role portal: Redesigned authentication screen with dedicated, interactive view panels for Fleet Administrator, School Bus Driver, and Student & Parent accounts.
- Dual sign-in modes: One-click "Quick Role Access (Demo)" with instant role switching, and "School Credentials" form with autofill chips and live Supabase Auth integration.
- Session & role management: Added demo-mode role resolution in `store.login(email, password)` supporting exact email matching or role keywords. Bi-directional sign-out via sidebar profile action and topbar role switcher returns cleanly to the login portal.
- Daylight styling tokens: Integrated with system design standards (`#F5F4F0` canvas, `#0284c7` sky accent, `#368c71` driver green, `#c88a38` student amber, and responsive mobile layout).
- Generative UI: Delivered self-contained interactive daylight preview widget with real-time capability matrix and HUD simulations.

The next rollout requires `002_services_and_route_versions.sql` and matching frontend/mobile assets. Review converted service defaults before dispatch. Native background tracking and location freshness/checkpoints are still separate F06 work.

## Remaining implementation sequence

| Stage | Remaining work |
| --- | --- |
| 2 — remaining | F04 absence/no-show handling; F05 invitations/recovery/deactivation; F06 freshness/checkpoints; unattended generation job configuration |
| 3 | F07 durable inbox and remote delivery; F09 incidents and acknowledgements; F10 inspections/work orders; remaining F11 reports, audit UI, imports, server directory search |
| 4 | F08 offline recording/reconciliation; QR option in F04; native background GPS and road-based ETA in F06 |
| 5 | F12 requests/waitlists; F13 verified guardian access when enabled by school policy |

Service allocation now replaces permanent single-route assignment in the new workflows. Legacy assignments remain as migration/compatibility data; new reservations use student subscriptions. Keep remaining mutations transactional and retain independent historical snapshots.

Remote push, account invitations, and background GPS require their respective server/native setup and real integration tests. No feature should be labeled operational merely because a screen or a local mock exists. Keep these limitations visible as later stages are implemented.
