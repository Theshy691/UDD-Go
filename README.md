# UDD Go

A school bus routing and fleet management system built from [`fleet_management_system_plan.md`](fleet_management_system_plan.md). PHP middleware, vanilla JavaScript, compiled Tailwind CSS, Leaflet, Supabase Auth/PostgreSQL/private Realtime, and a Capacitor mobile shell.

## Run the demo

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed in the terminal, normally **http://127.0.0.1:5173**. No account or API key is needed for demo mode. The role selector switches between administrator, driver, and student screens.

The demo includes six buses, four Dagupan-area routes, five drivers, and 24 fictional students. All records are sample data, and coordinates are illustrative. Changes persist in this browser. A second tab receives boarding, trip, and fleet updates over `BroadcastChannel`. Settings → Reset demo restores the starting records. Demo role selection is for exploration; live mode uses authenticated roles enforced by PostgreSQL.

Try the driver view: `UDD-0005` and `UDD-0006` are assigned to the first route and have not boarded. `UDD-0001` has already boarded and will be rejected as a duplicate. `UDD-0007` belongs to another route and will be rejected. Open Trips & history to manage the active journey. Record individual drop-offs, confirm the cabin check, and complete the trip. Prepare another dated trip to get a new manifest; the old manifest remains saved.

## Included workflows

| Area | Behavior |
| --- | --- |
| Overview | Map, route filtering, bus focus, occupancy, fleet summary, activity |
| Fleet | Add, edit, and inspect buses; filter/search; remove unassigned buses; export CSV |
| Routes | Create ordered stops; publish new versions with stop remapping; archive routes while retaining history |
| Services & calendar | Weekdays/effective dates, outbound/return services, capacity-checked subscriptions, holidays/extra days, and atomic generation of up to seven days |
| Students | Create profiles; reserve separate outbound/return services with pickup/drop-off stops and date ranges |
| Drivers | Create profiles; allocate non-overlapping services; substitute resources on prepared trips or record reconciled active handovers |
| Maintenance | Odometer thresholds; overdue/due-soon alerts; record completed service |
| Driver portal | Review/start a prepared dated trip, share device GPS, record boarding and individual drop-offs, complete cabin check and final odometer |
| Trips & history | Prepare dated snapshots, inspect passenger records, search dates, cancel scheduled trips with a reason, export a passenger CSV |
| Student portal | Assigned bus, driver contact, pickup stop, route map, boarding ID/status |
| Settings | Role preview in demo, trip notifications, connection guidance, refresh/reset |

Routes are directed adjacency lists, connected in stop sequence. Lines connect stops and are **not turn-by-turn road directions**. Demo positions are visibly labeled simulations. Browsers need network access for map tiles and Google Fonts; system fonts remain available when fonts are blocked.

## Connect Supabase

1. Create your Supabase project.
2. Run **`supabase/schema.sql` once**, then **`supabase/migrations/001_trip_history.sql`** and **`supabase/migrations/002_services_and_route_versions.sql`**, once each, in that order in the SQL editor on a new project. Together they create fleet/trip tables, indexes, RLS policies, guarded mutation functions, and private Broadcast authorization. For an existing installation, apply only migrations not previously installed, in numeric order. Roll out the matching frontend after the migrations; plan the upgrade between school runs. Do not rerun the fresh-install schema.
3. In Supabase Realtime settings, **disable “Allow public access.”** All fleet channels use `config: { private: true }`.
4. Copy `.env.example` to `.env`. For Node development or static hosting, set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

   Never use a service-role/secret key. Vite variables are embedded in the browser bundle.

5. Create the first user under Supabase Authentication → Users. Copy the Auth UUID and run this in the SQL editor:

   ```sql
   insert into public.users (auth_id, name, role, contact_number)
   values ('AUTH_USER_UUID', 'Your administrator name', 'admin', '0917 123 4567');
   ```

6. Restart `npm run dev`. The app now requires sign-in and loads only shared Supabase records. Demo data is never uploaded.
7. Sign in as the administrator; add buses, drivers, students, and routes. Driver/student forms create fleet profiles. To enable their sign-in, create their Auth accounts, then link the account to the existing profile:

   ```sql
   -- Find the profile ID using select id, name, role, student_code from public.users;
   update public.users set auth_id = 'AUTH_USER_UUID' where id = 'FLEET_PROFILE_UUID';
   ```

   Student boarding uses the profile's unique `student_code`. Parents use the linked student account in this version; separate guardian-to-student accounts are not implemented.

The app paginates shared records to respect Supabase API row limits, with a 10,000-record safety limit per directory. Activity loads the latest 200 events. Larger deployments need server-side directory search and pagination before raising that limit.

### Maps

Without a CARTO key, maps use OpenStreetMap standard tiles. To use the plan's CARTO Positron basemap, set `VITE_CARTO_API_KEY` for Vite/static hosting or `CARTO_API_KEY` for PHP/Docker. CARTO now requires a basemap API key; obtain one from [CARTO](https://www.carto.com/basemaps/apikey/index.html). Attribution remains visible. Review your tile provider's usage terms before public production use.

## PHP / Docker

For PHP 8.3+ with the cURL extension installed:

```sh
npm run build
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY
npm run php
```

Open **http://127.0.0.1:8080**. PHP exposes public runtime configuration and forwards authenticated mutation RPCs. It passes the caller's JWT to Supabase; RLS/RPC authorization remains authoritative. It never holds a service-role key. When running on static hosting or native Capacitor, the app calls the same guarded RPC directly. The optional read middleware is available at `/api/index.php?action=list&resource=buses` with an authenticated bearer token.

With Docker running:

```sh
docker compose up --build
```

Compose reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optional `CARTO_API_KEY` from `.env` and injects them at runtime. Empty credentials run demo mode. The multistage image builds frontend assets and serves them with PHP/Apache on port 8080. Use HTTPS and a production reverse proxy when deploying outside localhost.

### Static hosting / Vercel

Use `npm run build` with output directory `dist`. Set the `VITE_` variables before building. Static hosting uses the Supabase SDK directly and does **not** execute the included PHP middleware. Vercel does not provide PHP execution in this setup; use Docker/PHP hosting when PHP is required. There is no client-side path router, so no rewrite rule is necessary. This repository has not been published to a hosting provider.

## Mobile apps

The same responsive driver/student views are wrapped by Capacitor. Set `VITE_SUPABASE_*` before building; native assets cannot obtain PHP runtime environment variables.

### Run in the iPhone simulator

On a Mac with Xcode and an installed iOS simulator runtime:

```sh
npm run ios:run
```

This builds the web assets, generates or syncs the iOS project with Swift Package Manager, adds location permission descriptions and scene lifecycle support, compiles the simulator app, and installs/launches it. The simulator build targets iOS 15 or later and supports Xcode 27. It reuses a booted iPhone simulator, or boots the first available iPhone. No Apple signing account is needed for this simulator build. To choose a particular device, set `UDD_IOS_SIMULATOR_UDID` to its UUID from `xcrun simctl list devices available`.

Native demo mode initially opens the driver view. Use the role selector to preview students or administrators. The app bundles its web assets and does not require the Vite dev server. Rebuild with `npm run ios:run` after source changes. Build output is saved to ignored `output/ios-build.log`.

`npm run ios:setup` prepares/syncs the project without building the native app. Its small setup helper works around a Swift Package Manager option bug in the locked Capacitor 7 CLI, without changing dependencies in `node_modules`.

The setup helper copies the tracked `native/ios/AppDelegate.swift` into the generated project. Make lifecycle changes in that tracked file; edits to the generated AppDelegate are replaced on the next setup. It uses the [UIKit scene lifecycle](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle), required by the iOS 27 SDK, and preserves Capacitor URL/activity forwarding.

### Other native builds

```sh
npm install @capacitor/android@^7
npx cap add android
npm run ios:setup
npm run mobile:sync
npx cap open android
# or npx cap open ios
```

Android requires Android Studio and its SDK/JDK; iOS requires macOS, Xcode, and signing. Native projects are generated locally and ignored in Git.

Native permissions:

- iOS `Info.plist`: the setup helper adds `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` automatically. Review their school-specific explanation before distribution.
- Android `AndroidManifest.xml`: `android.permission.ACCESS_COARSE_LOCATION` and `android.permission.ACCESS_FINE_LOCATION`; Android 13+ notification permission is requested through the notification plugin. Check the plugin documentation for your target SDK.

GPS uses Capacitor Geolocation on native devices and browser Geolocation on the web. Sharing starts only after the driver chooses **Enable GPS sharing**, and stops when the route ends or the user switches demo roles/signs out. Browser location requires HTTPS or localhost. Native background location tracking is not implemented; drivers must keep the app open for continuous tracking.

Trip alerts use private Realtime messages and browser/local native notifications while the app is running. **Remote push delivery to a closed/background app is not implemented.** Production background delivery requires APNs/FCM credentials, device-token registration, a server push sender, and the relevant native configuration.

## Architecture and security

- **Durable state:** PostgreSQL holds users, buses, routes, graph stops, student assignments, and activity.
- **Transient GPS:** The current driver sends location through an authenticated RPC, which validates trip ownership and emits private `trip:<uuid>:<epoch>` Broadcast messages. GPS updates do not create durable location records. Admin/student subscribers update Leaflet markers in place.
- **Live records:** Database triggers publish lightweight `data_changed` invalidations. Clients refresh only after durable changes. Private `user:<uuid>` topics let newly assigned students/drivers discover their first route.
- **Trip lifecycle:** Dated trips snapshot route stops, resources, and passengers. Passenger events and audit entries survive completion. Transactional operations use request IDs for safe retries. The guarded trip mutation sends start/completion alerts to passenger profile channels. Demo uses `BroadcastChannel` invalidations.
- **Boarding:** Demo builds a JavaScript `Map` for the current route snapshot in O(N), then performs an expected O(1) ID lookup. Live validation uses indexed PostgreSQL student-code and assignment lookups and a transaction.
- **Capacity:** Demo counts matching active assignments in O(N). Live operations enforce reservations and occupancy inside guarded transactions. A school-level transaction lock serializes planning changes and generation, preventing concurrent requests from overbooking resources or seats.
- **RBAC:** Anonymous users have no fleet access. Admins manage records. Drivers access assigned services and their current trip/passengers and trip operations. Students see their own assignment and route/bus/driver. An aggregate RPC provides occupancy without disclosing classmates' identities. Browser roles cannot write directly to tables or change account roles.
- **Maintenance:** Alerts are derived from odometer thresholds; no external scheduler is needed. Service history is recorded in activity. New mutations also record structured audit entries. This version does not include workshop scheduling or emailed maintenance alerts.
- **CSV:** Exported values are escaped, including spreadsheet-formula prefixes.

Private channels restrict who can subscribe and publish. The driver is the trusted location publisher. GPS is not persisted; newly connected viewers wait for the next driver update. This version does not provide location history or background GPS.

## Validation

```sh
npm test
npm run build
```

The tests cover domain algorithms and run the actual SQL migration/functions/RLS in an embedded PostgreSQL engine (PGlite). Supabase-owned Auth/Realtime primitives are stubbed in that test harness; this is not an end-to-end Supabase integration test. A real Supabase project is required to validate hosted Auth/WebSockets. See `VALIDATION.md` for the checks performed in this workspace and remaining deployment prerequisites.

## Source layout

```text
src/main.js          Views, dialogs, navigation, driver GPS and notifications
src/store.js         Demo persistence, auth, Supabase queries/RPC and Broadcast
src/scheduling.js    Service calendars, allocations, versions and demo handovers
src/scheduling-views.js Service/subscription/calendar management screens
src/trips.js         Trip snapshot and demo lifecycle rules
src/trip-views.js    Trip directory, history, manifest actions and export
src/domain.js        Capacity, boarding, route graph, maintenance, escaping
src/map.js           Leaflet maps, markers, routes and stop editor
src/styles.css       Design tokens, responsive UI and compiled Tailwind entry
src/seed.js          Fictional local sample records
public/api/index.php PHP configuration and authenticated REST/RPC middleware
supabase/schema.sql Database, RLS, transactional mutations and Broadcast policies
supabase/migrations/ Incremental upgrades after the base schema
tests/              Domain and actual PostgreSQL security/workflow tests
capacitor.config.json Native shell configuration
Dockerfile          Node build → PHP/Apache runtime
```

Technical references: [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), and [Leaflet reference](https://leafletjs.com/reference).


## Trip foundation rollout

The trip foundation and the scheduling/route-management part of stage 2 are implemented; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for completed work and remaining stages.

- Existing Supabase installations: back up the database and apply outstanding migrations in order. If upgrading from the original route-only system, finish every active legacy route before applying `001_trip_history.sql`. Then apply `002_services_and_route_versions.sql` before using this frontend. Migration 001 refuses an active-route cutover without applying changes. If your SQL client leaves an aborted transaction open after a refused cutover, issue `ROLLBACK` before retrying.
- New installations: run `schema.sql`, then migrations `001` and `002`, in that order. The original schema alone supports only the previous frontend.
- Demo: existing local records are preserved. Current active demo routes receive imported manifests; unknown start/boarding times remain unset and are labeled. Past journeys are not reconstructed from prose activity.
- Admin: create routes, configure Services & calendar, reserve students on the appropriate services, then generate up to seven days of trips (or prepare a single service date). Preparation fixes the passenger list. Later subscription changes affect future preparations.
- Driver: open today's prepared trip, start it, and record each pickup/drop-off. Completion requires no passengers left on board, the cabin check, and a valid final odometer. Expected students who never boarded remain explicitly expected in history; absence/no-show resolution belongs to the next stage.
- History: current loading covers seven days either side of today plus any active journey. Date searches are server-filtered and capped at 200 results with an explicit error for larger ranges. A manifest is bounded by the 100-seat vehicle limit. Students receive only their own passenger rows; audit data is admin-only.
- GPS remains transient and foreground-only. Samples include the current trip ID so late samples cannot move a later journey's marker. Invitations, remote push, background GPS, offline live recording, guardian accounts, and other later-stage features are not yet implemented.


## Services, versions, and resource handovers

`002_services_and_route_versions.sql` converts existing routes into one default outbound service each, with a 60-minute duration, 15-minute turnaround, Monday–Friday operation, and effective dates from migration day through the following year. Existing assignments become subscriptions. Review these defaults in Services & calendar before generating real trips. Matching legacy departures are linked to the default service to avoid duplicate preparation, while their saved stops remain unchanged.

- Configure separate outbound and return services. Direction is a label: it does not reverse the route. Select a campus-first route for the return journey. Services may share buses/drivers when their recurring windows do not overlap, including turnaround and midnight crossings.
- A student may subscribe to multiple services when their windows do not overlap. Capacity is checked across effective dates. Subscription changes do not silently modify prepared manifests.
- Generation is an explicit admin action for a rolling window of at most seven days. It is atomic and repeatable. Unattended scheduled generation is not configured. A conflict aborts the batch and explains what must be corrected.
- Calendar exceptions can cancel a service date or add an extra operating day. A service-specific exception takes precedence over the school-wide weekday rule. No-service entries cancel matching scheduled trips; active journeys continue. Removing an exception does not restore cancelled journeys. Automatic generation preserves cancellation decisions; an administrator may deliberately prepare a replacement after reviewing the restored calendar.
- Publishing a route saves a new immutable stop version and updates future service preparations. Existing trips keep their stops and passengers. Removed subscribed stops require explicit remapping, with pickup before drop-off. Concurrent editors must refresh after another version is published.
- Archive routes instead of deleting used records. Resolve pending trips first; archiving makes related services inactive and retains historical versions.
- Replace a scheduled trip's bus/driver from its trip details. Active handovers additionally require an outgoing odometer reading and passenger-reconciliation confirmation. Capacity and resource conflicts are rechecked. The trip keeps the same manifest, and a resource event records vehicle segments and the reason. With different vehicles, the final odometer belongs to the final vehicle; use segment readings rather than subtracting the original vehicle's start reading.
- Location channels rotate their epoch after resource replacement. Direct client Broadcast publishing is disabled; the location RPC checks the current driver on every sample. The removed driver cannot publish by retaining an old session or guessing the new channel. Hosted Realtime and physical-device handovers still require integration testing.
