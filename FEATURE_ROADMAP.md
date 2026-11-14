# UDD Go — Feature Gap Review and Implementation Plan

**Reviewed:** November 13, 2026 · Asia/Manila

**Status:** Implementation started. The trip foundation and stage 2 scheduling/route management are implemented locally. Remaining stage 2 work and later phases are tracked separately. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current scope, validation, and next steps.

**Scope:** Extend the existing school transport system. Preserve the original [system plan](fleet_management_system_plan.md).

## 1. Recommendation

The system already has a useful foundation: fleet management, route creation, student assignments, boarding validation, GPS broadcasting, maintenance thresholds, and role-based access.

The most valuable next step is to separate a **reusable route** from an **individual trip on a particular date**. Today, the same route record is started and completed repeatedly, and boarding state is reset. That prevents reliable attendance history, morning/afternoon scheduling, trip-specific substitutions, and meaningful transport reports.

Build the trip foundation first, followed by daily scheduling, explicit drop-off confirmation, account management, and reliable tracking status. Add QR scanning, remote notifications, and other conveniences after those workflows are dependable.

This review is based on the repository's source and documentation. It does not claim to have verified a deployed Supabase project, physical-device behavior, or production operations. Existing validation results and limitations are recorded in [VALIDATION.md](VALIDATION.md).

## 2. What exists and where it stops

| Area | Already implemented | Missing or limited | Repository evidence |
| --- | --- | --- | --- |
| Accounts | Supabase sign-in and admin/driver/student permissions | No invitation, password-recovery, profile-editing, or account-deactivation workflow in the app; Auth linking requires setup outside the app | [README.md](README.md), `renderLogin()` and `addPersonModal()` in [main.js](src/main.js) |
| Fleet | Add/edit buses, capacity rules, status, mileage, CSV export | No scheduled resource allocation or temporary replacement workflow | `addBusModal()` in [main.js](src/main.js), [schema.sql](supabase/schema.sql) |
| Routes | Ordered stops, bus/driver assignment, map, departure time, inactive-route deletion | No route editing, service calendar, route versions, or road-following directions | `routeModal()` and `routeDetail()` in [main.js](src/main.js), [map.js](src/map.js) |
| Resource allocation | One bus and driver per route | Unique bus and driver fields prevent using them across multiple route records, even at different times | `routes` in [schema.sql](supabase/schema.sql) |
| Student allocation | Assign/unassign a student and pickup stop; capacity checked transactionally | One assignment per student; no separate outbound/return subscriptions or date-specific ride changes | `student_assignments` in [schema.sql](supabase/schema.sql) |
| Boarding | Manual student ID validation; rejects duplicates, wrong routes, and full buses | No individual alighting, absence/no-show workflow, QR scanner, or structured attendance history | [domain.js](src/domain.js), `board_student` and `end_route` in [schema.sql](supabase/schema.sql) |
| Trips | Start/end route and final odometer | No `trips` table; ending a route clears boarding status and `boarded_at`; activity messages survive but are not a full trip manifest | `start_route` and `end_route` in [schema.sql](supabase/schema.sql) |
| Tracking | Private GPS broadcasts, coordinate validation, marker updates, connection indicator | No viewer-facing location-age warning, durable last-known fix, background tracking, or ETA | `position()` in [store.js](src/store.js), [map.js](src/map.js), [README.md](README.md) |
| Alerts | Start/end alerts while the app is running; browser/native local notifications | No remote push sender, durable personal inbox, delivery retry, delay/cancellation alerts, or stop-approach alerts | Trip event listener in [main.js](src/main.js), [README.md](README.md) |
| Maintenance | Mileage-based due/overdue alerts and completed-service action | No structured work orders, service costs, date-based servicing, defect tracking, or inspection checklist | `serviceModal()` in [main.js](src/main.js), `service_bus` in [schema.sql](supabase/schema.sql) |
| Reporting | Fleet snapshot CSV and activity feed | No date-filtered trip/attendance reports; activity lacks structured actor and before/after fields | `exportFleet()` in [main.js](src/main.js), `activity` in [schema.sql](supabase/schema.sql) |
| Data loading | Reads in pages, directory limit of 10,000 records, latest 200 activity records | UI search is client-side; refresh reloads accessible tables; no bounded historical-report queries | `readTable()` and `loadLive()` in [store.js](src/store.js) |
| Offline use | Local demo persistence | Live operations have no persistent offline queue or reconciliation workflow; demo persistence is not live offline support | [store.js](src/store.js) |

## 3. Priorities

**P0:** Core daily-operation foundation. **P1:** Next operational improvements. **P2:** Optional expansion after the core is stable. Effort is relative: small, medium, or large; it is not a delivery estimate.

| ID | Recommendation | Priority | Effort | Main dependency |
| --- | --- | --- | --- | --- |
| F01 | Dated trips and permanent passenger history | P0 | Large | Database migration and trip permissions |
| F02 | School calendar, morning/afternoon schedules, conflict checks | P0 | Large | F01 |
| F03 | Route editing, archiving, and bus/driver substitutions | P0 | Medium | F01–F02 |
| F04 | Boarding, alighting, absences, and no-shows | P0; QR in P1 | Medium | F01; F02 for recurring absences |
| F05 | Account invitations, recovery, profile updates, deactivation | P0 | Medium | Trusted account-management backend |
| F06 | Location freshness, trip recovery, background GPS, and ETA | P0 freshness; P1 background/ETA | Large overall | F01; routing provider for ETA |
| F07 | Personal inbox and remote trip notifications | P1 | Large | F01, F05; F06 for approach alerts |
| F08 | Offline passenger recording and controlled synchronization | P1 | Large | F01, F04; idempotent server operations |
| F09 | Incident reporting and dispatcher follow-up | P1 | Medium | F01, F05; F07 for remote alerts |
| F10 | Inspections and structured maintenance records | P1 | Medium | F02–F03 for availability checks |
| F11 | Historical reports, audit trail, imports, server-side search | P0 audit foundation; P1 screens/tools | Medium–large | F01–F05; F10 for maintenance reports |
| F12 | Student transport requests and waitlists | P2 | Medium | F01–F02, F05, F07 |
| F13 | Separate guardian accounts, if the school needs them | P2 | Medium | F05, F07; verified student relationships |

## 4. How each feature would work

### F01. Dated trips and permanent passenger history

**Problem:** A route represents both a reusable plan and its current journey. Ending it resets the passenger state, so yesterday's actual passenger list cannot be reconstructed reliably.

**Proposed workflow:**

1. Keep a route as a reusable ordered set of stops. Create a trip for a service date and departure time, initially through a simple admin action.
2. Give the trip its own bus, driver, status, planned/actual times, starting/final mileage, and passenger manifest.
3. Snapshot the route version, stop order, pickup/drop-off stops, and relevant display details when the trip is prepared. Later edits must not rewrite a historical journey.
4. The driver selects today's trip, starts it, records passenger events, and completes it. Tomorrow receives a different trip ID.
5. Keep the completed manifest and events available by date, route, driver, bus, and student. Corrections add a reasoned audit entry.

**Rules:** Start, boarding, alighting, and completion must be server-authorized transactions. Assign a unique operation ID to each mutation so a repeated request cannot create a second trip start or duplicate passenger event. Capture structured audit data from the first migration.

**Acceptance:** Run the same route on two days. Both manifests remain independently readable after the second trip ends, including who boarded and when. Restarting the app resumes the active trip instead of creating another.

### F02. School calendar and morning/afternoon schedules

**Problem:** A departure time alone cannot describe weekdays, holidays, term dates, separate return journeys, or shared use of vehicles and drivers.

**Proposed workflow:**

1. An administrator creates a schedule with route, direction, departure time, estimated end time, weekdays, and effective dates.
2. Add calendar exceptions for holidays, suspensions, and special service days.
3. Assign students to one or more non-overlapping services, such as a morning pickup and afternoon return, with separate pickup/drop-off stops.
4. Generate dated trips for a short rolling window, for example seven days. Use a unique schedule/date key so running generation twice does not duplicate trips.
5. Reuse a bus or driver across non-overlapping trips. Reject overlapping allocations and include a configurable turnaround buffer, initially proposed as 15 minutes.
6. Cancel affected unstarted trips when school service is suspended. Preserve records and notify affected passengers when F07 is available.

**Rules:** Store timestamps consistently and derive service dates in `Asia/Manila`. Replace the current global uniqueness of route bus/driver assignments with transactional trip-window checks. A running trip continues to reserve its resources if it overruns its planned finish. Keep the first capacity model simple: every reserved passenger occupies one seat for that trip; do not introduce segment-based seat resale yet.

**Acceptance:** One bus runs both morning and afternoon services, one student has both rides, a holiday generates no regular service, and two concurrent requests cannot reserve the same driver for overlapping trips.

### F03. Route editing and temporary substitutions

**Problem:** Changing a route currently requires removal/recreation. There is no direct way to replace an unavailable driver or bus for just one journey.

**Proposed workflow:** An administrator edits a draft route version, adds/reorders/removes stops, and reviews affected students before publishing it for future trips. A separate “Replace bus/driver” action changes one scheduled trip and explains why.

**Rules:** Keep active and completed trip snapshots unchanged. Require remapping when a removed stop has passengers. Recheck replacement capacity, maintenance availability, and driver conflicts inside the transaction. Archive used routes and people instead of deleting their history. If a breakdown requires an active-trip handover, record the transfer time, passenger reconciliation, new resources, and both mileage segments; revoke the old driver's publishing/mutation access and authorize the replacement.

**Acceptance:** Replacing a 30-seat bus carrying 25 reservations with a 24-seat bus is blocked. A route edit changes next week's journeys without altering today's completed record.

### F04. Full passenger attendance and optional QR scanning

**Problem:** “Boarded” is the only actual passenger movement recorded. Ending the route marks everyone off the bus without individual drop-off confirmation.

**Proposed workflow:**

1. The driver opens the current stop's expected passenger list and records boarding using the existing ID entry.
2. Record boarding and alighting separately, each with trip, student, stop, actor, and time. A student can board only once and alight only after boarding.
3. Students may declare a planned absence for a specific trip before the configured cutoff. Drivers can confirm a no-show after the pickup stop is served; lack of a scan alone does not prove absence.
4. Show “Expected,” “On board,” “Dropped off,” “Absent,” and “No-show” counts separately. Capacity reservations and actual occupancy are different figures.
5. Before completion, require all boarded students to be accounted for and a final cabin check. A dispatcher may resolve an exceptional closure with a reason; unresolved passengers must remain visible as an incident.
6. In P1, add camera scanning of a school-issued QR pass. Resolve an opaque, revocable pass token, validate it against the same trip rules, and show the student's name for confirmation. Keep manual ID entry available.

**Rules:** Do not put contact details or login credentials in QR codes. A QR pass is an identifier, not proof of identity; revocation and duplicate checks still apply. Attendance records are append-only events with an audited correction path. An absence does not automatically release a permanent subscription or promote a waitlisted rider without a defined seat-release policy.

**Acceptance:** Duplicate scans, wrong-trip passengers, alighting before boarding, and ordinary completion with passengers still on board are rejected. Yesterday's events survive today's scans.

### F05. Account invitations, recovery, and lifecycle management

**Problem:** Creating a fleet profile does not create a usable sign-in account. Staff must link Auth IDs manually, and the app has no recovery or account-deactivation flow.

**Proposed workflow:** The administrator creates/imports a profile, enters a verified contact email, and sends an invitation. The user accepts it and sets a password. Provide password recovery, resend-invite status, contact/profile correction, and deactivation for departing users.

Supabase provides an email invitation API and password recovery flow; the application still needs the screens, redirects, profile linkage, and delivery setup around them. See [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) and [password recovery](https://supabase.com/docs/guides/auth/passwords#resetting-a-password).

**Implementation:** Add an isolated trusted backend for privileged account operations. Keep the existing caller-JWT PHP mutation proxy separate. Verify the requesting administrator on the server, link the intended profile exactly once, and keep privileged credentials out of browser/native bundles. Track partial invite/link failures so retrying cannot create duplicate identities. Configure web and native recovery/invitation destinations.

**Rules:** Users cannot choose their own roles or link arbitrary profiles. An inactive account must lose database, mutation, and live-channel access even if it still has an old session; do not rely on hiding its navigation. Preserve historical references and restrict reassignment of inactive drivers/students.

**Acceptance:** A new driver can accept an invitation and sign in without manual SQL. Recovery works through the supported app entry points, and a deactivated account cannot continue using an already-open session.

### F06. Reliable tracking status, background GPS, and ETA

**Problem:** A connected WebSocket does not prove that the driver is still sending fresh GPS. Newly connected viewers wait for the next update, and there is no arrival prediction.

**P0 workflow:** Include the active trip ID, device session, position sequence, accuracy, sample time, and receive time. Show “Updated 12 seconds ago,” “Location delayed,” or “Location unavailable” independently from network connection status. Proposed initial thresholds are 30 seconds for delayed and 120 seconds for unavailable; tune them using field observations. Reject out-of-order samples and prevent a previous trip's position appearing on a new trip.

**Recovery:** Keep frequent movement on private Broadcast. Add a low-frequency last-known-location checkpoint, initially at most one write per 30 seconds per active trip, so a reconnecting viewer has an explicitly aged starting position. This intentionally extends the original transient-only design; it does not require storing every GPS sample or a full journey trail. Give checkpoints a short, configurable retention period.

**P1 workflow:** Evaluate and integrate native background location support, then test locked-screen operation, permission changes, battery use, and interrupted connectivity on physical devices. Capacitor 7's Geolocation plugin does not directly support background geolocation, so the existing watch call alone is insufficient. See [Capacitor 7 Geolocation](https://capacitorjs.com/docs/v7/apis/geolocation).

**ETA:** Add road-following route geometry through a selected routing service. Calculate estimates using remaining road distance, observed movement, and stop dwell assumptions. Show an approximate range and last calculation time; suppress the estimate when GPS is stale. Start with manual stop-arrival confirmation, then consider geofences with repeated samples and accuracy checks. Never treat a straight line between stops as travel distance or a geofence hit as proof of a passenger drop-off.

**Acceptance:** Stop GPS while leaving the viewer connected. The marker becomes visibly stale and the ETA disappears. A new viewer sees the checkpoint's age, and a completed trip no longer accepts location publishing.

### F07. Durable notifications and a personal inbox

**Problem:** Current trip alerts depend on a running app receiving a live event. Users cannot later inspect missed alerts or track whether a cancellation was communicated.

**Proposed workflow:** Save a notification event in the same transaction as a trip start, cancellation, substitution, delay, boarding, or alighting. A server worker reads the queued event, determines authorized recipients, creates inbox entries, and attempts remote delivery. Each entry links to the relevant trip and has a read state.

**Implementation:** Add device registration, token refresh/removal, notification preferences, retry limits, and a deduplication key per event/recipient/channel. Use a server sender with APNs/FCM configuration for native delivery; the Capacitor push plugin provides the native integration, not the business-event sender. See [Capacitor 7 Push Notifications](https://capacitorjs.com/docs/v7/apis/push-notifications). Browser remote delivery would be a separate web-push/service-worker task; the initial web experience can use the inbox and existing foreground alerts.

**Rules:** Check current recipient access before dispatch. Keep lock-screen content minimal. Distinguish queued, provider-accepted, failed, and user-read states; provider acceptance does not prove the user saw a message. Suppress obsolete alerts after a long outage. Stop-approach alerts depend on F06 and should send at most once per relevant trip/stop/recipient.

**Acceptance:** An event created while a user's app is closed remains in their inbox, a transient send failure retries without duplicating the inbox entry, and notification permissions being denied does not prevent use of the application.

### F08. Offline passenger recording and synchronization

**Problem:** A live mutation fails when connectivity disappears, while staff still need to account for passengers.

**Proposed workflow:** Download a minimal manifest before departure. For an already-started trip, store boarding/alighting events durably on the authorized device with unique operation IDs and show them as “Pending sync.” Reconnect, upload in order, and let the server acknowledge, reject, or flag each event. Present conflicts for dispatcher reconciliation.

**Rules:** Initially permit offline recording only on one server-designated device for a trip that was started online. Do not allow offline assignment changes, substitutions, new trip starts, or final completion. Apply local manifest/capacity checks while clearly distinguishing provisional records from server-confirmed occupancy. The server remains authoritative; delayed records for a closed or reassigned trip need review instead of silently changing it. Offline records are transport observations, not automatic authorization to exceed capacity.

**Data handling:** Keep only the current authorized manifest, expire it after reconciliation, and clear it on logout/deactivation when the device reconnects. Preserve queued observations across app restarts; do not replay old GPS as current location.

**Acceptance:** Record the same passenger through a network interruption and retry several times. Exactly one confirmed boarding exists. A revoked driver's queued events are held for review, not accepted as current authorized operations.

### F09. Incident reporting and dispatcher follow-up

**Problem:** There is no structured handling for a breakdown, significant delay, passenger discrepancy, or route disruption.

**Proposed workflow:** The driver selects an incident type, adds a short description, and submits it against the active trip. Record its time, last location with freshness, and affected vehicle. The dispatcher acknowledges it, assigns a response, records updates, and closes it with a resolution. Permit optional private attachments later.

**Rules:** Include a school-configured dispatch contact action. An offline report must clearly say it has not been sent. Distinguish “submitted” from “acknowledged.” Do not claim automatic emergency-service dispatch. A breakdown can initiate the audited handover in F03; student-facing notices expose only the appropriate service update.

**Acceptance:** A reported breakdown appears in the dispatcher queue, acknowledgement returns to the driver, and reassignment/resolution remains attached to the original journey.

### F10. Inspections and structured maintenance

**Problem:** Recording service currently updates mileage and marks the bus available, without a structured service record or a way to keep other unresolved defects open.

**Proposed workflow:** Add a short pre-trip inspection with configurable items. A critical defect makes the vehicle unavailable. Create a work order with issue, scheduled date, service type, workshop, mileage, notes, and optional cost/receipt. Closing that work order updates its service interval; release the bus only when other blocking defects are resolved.

**Rules:** Support both date-based and mileage-based service thresholds. Keep alerts distinct from blocking defects: overdue servicing follows a school-defined release policy. Prevent overlapping assignments during maintenance windows. Add driver credential and vehicle-document expiry reminders as a later extension after the basic work-order flow.

**Acceptance:** A failed critical inspection blocks trip start, replacement allocation respects capacity, and closing one work order cannot release a vehicle that still has another blocking defect.

### F11. Reports, audit trail, imports, and directory search

**Problem:** The current CSV represents today's fleet state. The activity feed cannot answer structured questions such as “Who changed this assignment?” or “Which students rode last Tuesday?”

**Proposed workflow:**

- **Reports:** Filter completed trips, passenger attendance, cancellations, distance, and maintenance by date, route, driver, bus, or student. Export the filtered result with the school's timezone and filter criteria.
- **Metric definitions:** Separate reserved seats, unique passengers who boarded, and peak onboard occupancy. Define on-time departure against a configurable grace period. Treat odometer distance as recorded distance and do not invent missing historical values.
- **Audit:** Capture actor, action, entity, trip, server time, operation ID, reason, and appropriate before/after values. Make ordinary application roles unable to modify the audit history. Avoid storing passwords, tokens, or unnecessary personal fields.
- **Imports:** Upload a student/driver CSV, preview mapped columns and row errors, flag duplicate IDs, and approve the valid batch. Import profiles without silently creating accounts or route assignments; those follow their own authorized workflows. Record a batch identifier for retry and review.
- **Search:** Query/filter/page directories on the server with stable ordering. Load historical trips only for the selected range, and refresh affected records instead of every accessible table.

**Acceptance:** A date-filtered attendance export matches saved passenger events. Changing a driver's contact produces an attributable audit record. Duplicate imports are detected, and page/search results do not silently omit records beyond the current client limit.

### F12. Transport requests and waitlists

**Problem:** Students cannot request a ride, stop change, or temporary absence through a reviewed process, and a full route simply rejects new assignments.

**Proposed workflow:** A student requests a service and stop, optionally for a date range. The administrator approves, declines with a reason, or adds the request to a waitlist. Approval creates the appropriate subscription or trip reservation only after a fresh capacity check.

**Rules:** Keep requested, approved, waitlisted, cancelled, and expired states distinct. A request is not a reserved seat. Record waitlist ordering and promotion decisions; use transactional capacity checks when offers are accepted. Define cutoffs for same-day changes and whether released seats may be offered temporarily. Do not auto-move students between pickup stops.

**Acceptance:** Two concurrent approvals for the final available seat produce one reservation and one explicit waitlist/full result.

### F13. Separate guardian accounts, when applicable

**Problem:** The README describes parents using the linked student account. There is no guardian role or verified guardian-to-student relationship in the schema.

**Proposed workflow:** If school policy calls for guardian access, invite a separate account and have authorized staff verify its relationship to specific students. The guardian switches between linked students to view the permitted trip status and notifications.

**Rules:** For university students, establish the student's authorization and school policy before granting access; do not assume every student needs a guardian. Limit access to linked students and permitted active-trip information. Never expose the full passenger list or unrelated fleet locations. Support relationship revocation and verify both database and live-channel access after revocation.

**Acceptance:** A guardian can see the authorized students and cannot retrieve another student's records by changing an ID or subscribing to a different trip channel.

## 5. Proposed data model

Names below are conceptual, not a migration to execute. Introduce only the tables needed by the current phase.

| Record | Purpose and important fields |
| --- | --- |
| `routes`, `route_versions`, versioned stops | Reusable route identity; immutable published stop order; archived status; optional road geometry |
| `service_schedules`, `calendar_exceptions` | Route version, direction, timezone, weekdays, effective dates, planned duration, default resources; service/cancellation overrides |
| `student_subscriptions` | Student, schedule, pickup/drop-off stops, effective dates, status; replaces the single global student assignment model |
| `trips` | Schedule, service date, route version, planned/actual times, bus, driver, status, starting/final mileage, version for conflict detection |
| `trip_stops` | Snapshot of ordered stops and planned/actual stop times |
| `trip_passengers` | Unique trip/student pair, pickup/drop-off stop snapshots, reservation and attendance state |
| `passenger_events` | Boarding, alighting, absence, no-show, correction; trip/passenger/stop/actor, device and server times, unique operation ID |
| `trip_resource_events` | Original allocation, bus/driver handovers, times, mileage segments, reason, responsible administrator |
| `trip_latest_locations` | One bounded last-known checkpoint per trip with accuracy, sequence, sample/receive times; separate from frequent Broadcast traffic |
| Account lifecycle fields and `account_invitations` | Profile status, invited email, invitation/link outcome, server-managed Auth relationship |
| `audit_events` | Structured actor/action/entity/change/reason history from P0 onward |
| `notification_outbox`, `notifications`, `device_tokens` | Pending event delivery, private user inbox/read state, registered device destinations |
| `incidents`, `incident_updates` | Trip issue, severity, acknowledgement, responsible staff, resolution history |
| `inspections`, `maintenance_work_orders`, `service_records` | Vehicle defects, unavailable windows, service completion, mileage/date intervals, costs |
| `import_batches` | File processing outcome, row errors, retry identification; no duplicate creation on retry |
| `transport_requests`, `waitlist_entries` | Requested service, decisions, order, seat offers, expiry |
| `guardian_student_links` | Verified relationship, granted scope, authorization metadata, revocation |

### State transitions

```text
Reusable route → published route version → service schedule → dated trip
Student subscription → dated trip reservation → passenger events

Trip:       scheduled → active → completed
            scheduled → cancelled
            active → interrupted → active / aborted

Passenger:  expected → boarded → alighted
            expected → absent / no_show / cancelled
```

An interrupted trip still reserves its resources until a controlled resolution. Completion/abortion must reconcile the manifest; neither should silently erase passengers or their history. Passenger corrections are attributed events, not destructive resets.

## 6. Daily workflow after the core phases

| Role | Proposed sequence |
| --- | --- |
| Administrator | Set the school calendar → publish routes and schedules → allocate buses/drivers → review capacity/conflicts → prepare dated trips → monitor location freshness and unresolved passengers → review completed journeys |
| Driver | Sign in → select today's trip → verify bus and manifest → start trip → enable location → record boarding/alighting at each stop → resolve no-shows/incidents → complete cabin check → enter final mileage → finish trip |
| Student | Sign in → view today's outbound/return trips and pickup/drop-off details → declare a planned absence when allowed → see fresh bus status and later ETA → present boarding ID/QR → review own ride status and notifications |
| Guardian, if enabled | Sign in separately → select an authorized student → view only permitted journey information and notices |

## 7. Implementation sequence and exit criteria

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| 1 — Preserve journeys | F01, core manual boarding/alighting from F04, foundational audit from F11, basic manually created dated trips | Two consecutive journeys keep separate manifests; no silent passenger reset; authorized actors only; retrying a mutation does not duplicate it |
| 2 — Plan daily operations | F02, F03, planned absences/no-shows, F05, F06 freshness/recovery | Morning and afternoon service work; overlaps are rejected; future route edits preserve history; invitations/recovery work; stale GPS is visible |
| 3 — Manage disruption | F07, F09, F10, F11 reports/search/imports | Missed messages remain in inboxes; incidents have acknowledgements; defects block dispatch appropriately; reports reflect preserved trip records |
| 4 — Improve mobile resilience | F08, QR option in F04, F06 native background tracking and road-based ETA | Physical-device and offline scenarios pass; no duplicated attendance; stale location never produces an apparently current ETA |
| 5 — Add requested extensions | F12 and, only where applicable, F13 | Capacity remains atomic; waitlist behavior is explicit; guardian access is restricted and revocable |

Phases describe dependency order, not promised dates. Phases 1–2 form the recommended initial feature scope. Decide whether closed-app alerts and background GPS are requirements for the intended pilot; if so, their Phase 3–4 work must be included before that pilot is described as supporting those capabilities.

## 8. Integration and migration approach

1. **Keep the current stack.** Extend vanilla JavaScript, Supabase, optional PHP, Leaflet, and Capacitor. A framework rewrite is not a prerequisite.
2. **Add versioned migrations.** The existing `supabase/schema.sql` is a fresh-install script. Introduce incremental migrations for existing installations and keep new-install setup aligned; do not rerun the original script on a populated database.
3. **Preserve available data honestly.** Map existing routes/stops into initial versions and existing assignments into subscriptions. Retain legacy activity separately. Do not invent past trips, boarding timestamps, or service costs from prose activity messages. Perform cutover between active journeys; if that is impossible, explicitly reconcile the current manifest with staff.
4. **Move trip operations to trip IDs.** Add guarded operations such as `create_trip`, `start_trip`, `record_boarding`, `record_alighting`, `replace_trip_resources`, `cancel_trip`, and `complete_trip`. Keep capacity, state transitions, and scheduling locks in database transactions.
5. **Update authorization alongside the model.** Base driver access on authorized trips, student access on their reservations/subscriptions, and any guardian access on verified links. Use trip-scoped live topics for movement. Historical and active access may have different scopes; account deactivation and handover must revoke live publishing too.
6. **Bound historical data loading.** Add server-side date filters, search, and pagination when trips are introduced. Do not append every historical table to the current full-table refresh path. Seed enough demo examples to show separate days, cancellations, stale location, and substitutions.
7. **Add external services only where needed.** Invitations need trusted account management and working email delivery. Remote push needs device configuration, credentials, and a worker. ETA needs a chosen routing service and a cost/request budget. Background GPS needs a compatible native implementation and device testing. None are selected, purchased, or configured by this plan.
8. **Set data lifetimes by purpose.** Keep trip/audit history according to the school's chosen retention policy, retain only necessary location checkpoints, and expire offline manifests. Apply the same access restrictions to exports and attachments as to the app.

Likely implementation touchpoints are [main.js](src/main.js) for screens, [store.js](src/store.js) for scoped data and actions, [domain.js](src/domain.js) for pure rules, [map.js](src/map.js) for tracking/geometry, and [schema.sql](supabase/schema.sql) plus new migrations for durable rules. Introduce focused trip, account, and notification modules as those features are built instead of placing all new behavior in `main.js`.

## 9. Verification plan for future implementation

The following checks belong to the implementation phases; they were not run as part of this planning-only review.

- **Database behavior:** Preserve two days of attendance; reject invalid state transitions; test duplicate operation IDs, competing last-seat approvals, conflicting resource allocations, and incompatible replacement capacity.
- **Authorization:** Verify driver ownership, student isolation, inactive accounts, handover revocation, and later guardian access across reads, writes, exports, and private live subscriptions.
- **Migration:** Upgrade a copy of an existing database without losing assignments or activity. Verify both a fresh installation and incremental migration. Review backup/restore and cutover steps before changing live data.
- **Browser workflows:** Complete admin scheduling, driver pickup/drop-off, student round-trip views, invitation/recovery, and report export on desktop and phone layouts, including empty/error states and keyboard operation.
- **Hosted integration:** Use a real Supabase test project for Auth redirects, private channels, reconnects, and permissions. Existing PGlite tests stub Auth/Realtime and cannot establish those hosted behaviors.
- **Physical devices:** Test camera permission denial, locked-screen GPS, permission revocation, app restart, low connectivity, push receipt, and offline replay. Simulator success alone is insufficient for these capabilities.
- **Failure handling:** Interrupt requests around server commit, retry them, and confirm that history and counts remain consistent. Verify that delayed GPS, stale notifications, and pending offline events are clearly labeled.
- **Required project checks:** Extend meaningful domain/database tests for the new invariants, then run `npm test` and `npm run build` for implementation changes.

## 10. Decisions to settle before the relevant phase

These are planning assumptions, not requests to begin implementation.

| Decision | Recommended starting assumption |
| --- | --- |
| School scope | One school and existing roles; no multi-school tenancy in the first release |
| Student journeys | Independent outbound and return services; permit multiple non-overlapping subscriptions |
| Capacity | Reserve one seat per passenger for the whole trip; no segment-based seat reuse initially |
| Daily service | Recurring weekdays plus explicit school-calendar exceptions |
| Trip completion | Individual alighting plus cabin check; audited dispatcher resolution for exceptions |
| Changes during trips | Ordinary edits affect future trips; active changes require an explicit handover/disruption flow |
| Offline operation | One designated device; already-started trips only; provisional events until reconciliation |
| Location history | Freshness and last-known checkpoint first; full GPS replay only for a defined need and retention policy |
| Notifications | Personal inbox first; native push next; SMS and browser remote push require separate scope and budget |
| Guardian access | Optional and explicitly authorized, especially for university students |
| Service readiness | Critical inspection defects block dispatch; the school defines overdue-service overrides |
| Retention and support | School chooses record lifetimes, who handles incidents, and who can approve exceptional corrections |

Defer fare collection, payroll, predictive maintenance, automatic route optimization, and broad chat features until daily trip records and operational needs justify them. The immediate improvement is a system that can reliably explain which journey ran, which vehicle and driver operated it, and what happened to each passenger.
