# Validation record

Validated locally on November 13, 2026 (Asia/Manila).

## Automated checks

- `npm test`: 16 passing tests, including nine PostgreSQL workflow/security subtests.
- The actual `supabase/schema.sql` was executed in PGlite, an embedded PostgreSQL engine. Auth users, `auth.uid()`, Realtime topics, and the `realtime.send()` transport were supplied by the test harness.
- Checks include atomic assignment limits, direct-write denial, privilege-escalation denial, student RLS, aggregate occupancy authorization, driver trip ownership, duplicate/wrong-route boarding, monotonic odometers, service thresholds, vehicle edits, private Broadcast policies, and inactive-route removal.
- `npm run build`: production frontend build.
- The built app was also served with `npm run preview` and loaded successfully in WebKit; its overview heading and all icons rendered.
- `docker compose config --quiet`: Compose configuration accepted.
- Dependency installation audit reported zero vulnerabilities.

## Browser checks

Executed with Playwright CLI in WebKit, including 1440 × 1100 desktop and 390 × 844 phone viewports.

- Added a bus, searched it by name/plate, reloaded, and confirmed persistence.
- Created a route using a campus stop and an actual click on the Leaflet stop editor; named a pickup stop and assigned a bus/driver.
- Created a student profile and assigned it to the new route.
- Edited a vehicle and confirmed the change in the fleet directory.
- Recorded maintenance and confirmed that the overdue service alert cleared.
- Boarded an assigned student and confirmed the passenger status.
- Rejected duplicate boarding and a student from another route.
- Ended a trip with a final odometer, started another trip, and confirmed its boarding list reset.
- Switched to the student portal and confirmed its route, boarding ID, and absence of administrator navigation.
- Verified phone navigation and no document-level horizontal overflow on the overview/student pages.
- Opened a second tab, boarded a student there, and observed occupancy update in the first tab.
- Granted browser geolocation and supplied a simulated device coordinate; confirmed GPS publishing status. This verifies the browser code path, not physical/native hardware.
- Downloaded and inspected the actual CSV export.
- Closed a dialog using Escape.
- Restored the starting demo records after testing.
- The final browser session reported zero console errors and zero warnings. Earlier icon and Leaflet navigation errors were fixed and rechecked.

Screenshots and the exported sample report are under ignored `output/playwright/`:

- `overview-desktop.png`
- `overview-mobile.png`
- `student-mobile.png`
- `fleet-report.csv`

## Not verified in this environment

Update: the native iOS simulator was subsequently configured and verified as described below.

- Hosted Supabase sign-in, Auth-account linking, remote private WebSockets, and PHP-to-Supabase requests: no Supabase project credentials were supplied.
- PHP execution/linting and Docker image build/runtime: PHP is not installed and the local Docker daemon is stopped. Compose configuration was validated; the PHP and image execution paths remain unverified.
- Android compilation, physical-device GPS accuracy, native location permission interaction, and native local notifications remain unverified. iOS simulator compilation/launch is now verified; physical-device signing is not configured.
- Remote push delivery and background GPS: not implemented; these need separate platform services and credentials, as documented in README.md.
- Production hosting: no site was deployed.

## Native iOS simulator validation

- Installed the Capacitor iOS dependency and generated the native project using Swift Package Manager.
- Added repeatable `npm run ios:setup` and `npm run ios:run` commands, including simulator selection, native build/install/launch, and a process-survival check after launch.
- Built with Xcode 27.2 for the iPhone 16 Pro Max simulator running iOS 27.0. `xcodebuild` completed with `BUILD SUCCEEDED`.
- Verified official Capacitor/Cordova framework downloads against the SHA-256 checksums in their package manifest before caching them for SwiftPM.
- Fixed the Capacitor 7 template's missing scene lifecycle, which caused an immediate iOS 27 launch failure. The tracked native delegate and generated scene manifest now launch successfully.
- Captured and visually inspected the running native driver view, including its Leaflet map and simulated bus marker. The app process remained running after launch.
- Fixed the native safe-area layout so the header, navigation, and role selector appear below the iPhone status bar.
- Native demo mode defaults to the driver view; web demo mode continues to default to administrator.
- Screenshot: `output/playwright/native-driver.png`. Native build output: `output/ios-build.log`.
- This is a simulator launch/visual check. It does not establish that physical-device GPS, native notification delivery, background tracking, or hosted Supabase tracking work end to end.
