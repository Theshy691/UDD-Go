# UDD Go — System Overview & Architecture Guide

**UDD Go** is a real-time school bus routing and fleet management platform developed for **Universidad de Dagupan (UDD)**. The platform provides administrators with centralized dispatch and fleet governance, gives school bus drivers an intuitive boarding and navigation workflow, and gives students and families live tracking, digital boarding passes, and trip notifications.

---

## 1. System Vision & Objectives

* **Student Safety & Accountability:** Prevent bus overloading, track exact passenger boarding and drop-off stops, and mandate cabin checks before completing any journey.
* **Real-Time Visibility:** Live GPS bus tracking on daylight-optimized campus maps using WebSocket pub/sub broadcasting without overloading the transactional database.
* **Operational Continuity:** Separate recurring service templates from dated journeys so daily trips retain permanent manifests, audit trails, and immutable historical records.
* **Privacy by Design:** Row-Level Security (RLS) ensures students can only see their own journey records and aggregate bus occupancy—never classmate data.

---

## 2. Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│   Vanilla JS (ES Modules)  •  Tailwind CSS  •  Leaflet.js   │
│   Capacitor Native Shell (iOS / Android)  •  Lucide Icons   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────┐         ┌───────────────────────┐
│     Docker / Web Host     │         │   Supabase Backend    │
│  PHP 8.3 Apache / Docker  │         │  PostgreSQL 15+ & RLS │
│  Multi-stage Node Build   │         │  Realtime WebSockets  │
│  Port 8080 (REST / Proxy) │         │  Supabase Auth        │
└───────────────────────────┘         └───────────────────────┘
```

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Web Frontend** | Vanilla JavaScript (ES2022+), Tailwind CSS v4, Lucide Icons | Responsive daylight interface, role switching, administrative tools. |
| **Mobile Runtime** | Capacitor JS v7 | Wraps the frontend into native iOS (SwiftPM) and Android applications. |
| **Mapping Engine** | Leaflet.js v1.9, CartoDB Positron & OpenStreetMap | Daylight campus maps, bus marker interpolation, stop sequence editors. |
| **Database & Auth** | Supabase (PostgreSQL 15+, Supabase Auth, Realtime) | Relational persistence, Row-Level Security, private WebSocket channels. |
| **Local Test Engine**| PGlite (Embedded WASM/Node PostgreSQL) | Executes authentic PostgreSQL migrations and security policies during tests. |
| **Containerization**| Docker, Docker Compose, PHP 8.3 Apache | Production containerized deployment and reverse-proxy routing. |

---

## 3. Computer Science Concepts & Data Structures

### Graph Representation for Route Stops
Bus routes are modeled as directed graphs where each bus stop is a node:
$$\text{Graph } G = (V, E)$$
* **Nodes ($V$):** Distinct physical stops defined by geographic coordinates `(latitude, longitude)`, name, and integer sequence.
* **Edges ($E$):** Directed transit segments connecting node $i \to i+1$, ending at a terminal campus destination node.
* **Map Rendering:** The route graph generates an ordered adjacency list that draws dual-layer polylines (white casing + brand accent) and numbered waypoint icons on the Leaflet canvas.

### $O(1)$ Hash Table Boarding Validation
Student boarding validation occurs at high frequency during pickup:
* When a trip starts, student passenger records are indexed into a hash map keyed by uppercase student identifier (`Map<StudentCode, PassengerRecord>`).
* Student ID entry triggers an $O(1)$ lookup:
  1. Validates that the passenger is registered on the specific dated trip.
  2. Confirms the student has not already boarded (prevents duplicate scans).
  3. Rechecks vehicle capacity threshold before admitting the student.

### Monotonic Odometer & State Transitions
Vehicle mileage transitions are modeled as monotonic non-decreasing invariants:
$$\text{Odometer}_{\text{final}} \ge \text{Odometer}_{\text{segment\_start}} \ge \text{Odometer}_{\text{initial}}$$
Prevents backwards odometer manipulation across vehicle handovers and maintenance cycles.

---

## 4. User Roles & Workflows

### A. Fleet Administrator (Web Operations Dashboard)
1. **Fleet Governance:** Register vehicles, track seat capacity (1–100 seats), record current mileage, and monitor maintenance thresholds (`healthy`, `due_soon` $\le 500\text{ km}$, `overdue`).
2. **Route Design & Stop Editor:** Create routes by clicking on an interactive Leaflet map, reorder stops, set default schedules, and publish versioned routes with stop remapping.
3. **Services & Calendar:**
   * Configure recurring morning (outbound) and afternoon (return) services with weekday schedules, duration, and turnaround buffers.
   * Add school calendar exceptions (holidays/cancellations or extra service days).
   * Batch-generate up to 7 days of dated trips idempotently.
4. **Resource Management:** Execute scheduled substitutions or emergency active-trip handovers with outgoing odometer capture and passenger reconciliation.
5. **Auditing & Reporting:** Export fleet summary CSVs, passenger attendance manifests, and inspect the chronological activity log.

### B. School Bus Driver (Capacitor Mobile App / Driver View)
1. **Journey Selection:** View today's prepared journeys (outbound/return) with scheduled departure times and assigned bus.
2. **Start Trip:** Verifies driver assignment, ensures the bus is not in maintenance, and captures starting odometer.
3. **Live GPS Broadcasting:** Toggles device GPS sharing (`Geolocation.watchPosition`). Pushes encrypted coordinates to a trip-specific private Realtime epoch topic.
4. **Passenger Boarding & Drop-Off:**
   * Taps **Board** when a student arrives at their assigned pickup stop.
   * Taps **Confirm drop-off** as students alight at the campus or return destination.
5. **Trip Completion:** Requires that 100% of boarded students have alighted, prompts for the final odometer reading, and mandates confirmation: *"I checked the cabin and confirmed no passengers remain."*

### C. Student / Passenger (Capacitor Mobile App / Student View)
1. **Digital Pass:** Displays the student's unique boarding ID (`UDD-XXXX`), assigned pickup stop, and drop-off destination.
2. **Live Bus Tracking:** Real-time map displaying the active bus marker moving towards the student's specific pickup stop.
3. **Trip Alerts:** In-app toasts and device notifications triggered when the assigned driver starts or completes the route.
4. **Privacy Isolation:** Students cannot see classmate identities or travel stops. Realtime channels broadcast aggregate seat occupancy only.
5. **Trip Record Export:** Students can export their own historical travel record as a CSV file.

---

## 5. Database Schema & Architecture

```
                  ┌────────────────────────┐
                  │         routes         │
                  └───────────┬────────────┘
                              │ 1:N
                  ┌───────────▼────────────┐
                  │     route_versions     │
                  └───────────┬────────────┘
                              │ 1:N
┌──────────────┐  ┌───────────▼────────────┐  ┌──────────────┐
│    buses     │◄─┤   service_schedules    ├─►│    users     │
└──────┬───────┘  └───────────┬────────────┘  └──────┬───────┘
       │                      │ 1:N                  │
       │ 1:N      ┌───────────▼────────────┐         │ 1:N
       └─────────►│         trips          │◄────────┘
                  └───────────┬────────────┘
                              │ 1:N
                  ┌───────────▼────────────┐
                  │    trip_passengers     │
                  └────────────────────────┘
```

### Key Relational Entities
* `users`: Profiles linked to Supabase Auth (`id`, `auth_id`, `name`, `role`, `student_code`, `contact_number`).
* `buses`: Fleet vehicles (`plate_number`, `capacity`, `current_mileage`, `next_service_mileage`, `status`).
* `routes` & `route_stops`: Master route definitions and ordered sequence of geographic stops.
* `route_versions`: Immutable snapshots of route stops captured at each publication.
* `service_schedules`: Recurring service templates (`outbound`/`return`, weekdays, effective dates, turnaround buffer).
* `student_subscriptions`: Student reservations linking students to specific services and stops.
* `calendar_exceptions`: Holiday cancellations and extra operating dates.
* `trips`: Dated operational journeys created from services or manual dispatch (`service_date`, `status`, `start_mileage`, `final_mileage`, `location_epoch`).
* `trip_passengers`: Immutable passenger manifest snapshot for a specific trip (`pickup_stop_id`, `dropoff_stop_id`, `status`, `boarded_at`, `alighted_at`).
* `trip_resource_events`: Audit trail for bus/driver substitutions and active-trip handovers.
* `audit_events`: Append-only security audit log recording every mutation and actor.

---

## 6. Execution Modes

### 1. Local Demo Mode (Browser Sandbox)
* Operates entirely client-side without external dependencies.
* Seeded with realistic UDD routes (Bonuan, Calasiao, Lucao, Downtown), buses, drivers, and students.
* Synchronizes across browser tabs using the browser `BroadcastChannel` API.
* Includes automated 5-second simulated GPS movement along route nodes.

### 2. Live Production Mode (Supabase / Cloud)
* Connects via environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
* Enforces PostgreSQL Row-Level Security (RLS) policies for all data access.
* Pub/Sub location broadcasting over Supabase Realtime channels (`trip:<id>:<epoch>`).
* Authenticated database RPCs (`fleet_action`, `fleet_publish_position`, `fleet_trip_capacity`).

---

## 7. Development & Deployment Commands

```bash
# Install dependencies
npm install

# Run automated test suite (PGlite embedded PostgreSQL engine)
npm test

# Launch local Vite development server
npm run dev

# Build production bundle
npm run build

# Preview production build locally
npm run preview

# Run inside Docker container (Apache + PHP 8.3)
docker compose up -d --build

# Run iOS Simulator (Xcode / SwiftPM)
npm run ios:run
```

