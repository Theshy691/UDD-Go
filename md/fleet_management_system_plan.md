# Master Prompt: System Initialization
**Context for LLMs/Agents:** 
> "Act as a Senior Full-Stack Architect. We are building a real-time 'School Bus Routing and Fleet Management System'. The stack is PHP/Tailwind (Admin Web), Capacitor/Vanilla JS (Mobile), and Supabase (Auth/Realtime/PostgreSQL). The UI must follow a soft beige (`#F5F4F0`) and light blue (`bg-sky-400`) aesthetic. Implement a Pub/Sub architecture for real-time tracking using Leaflet.js and OpenStreetMap. Integrate computer science concepts: Graph representations for route stops and $O(1)$ Hash Table lookups for student boarding validation."

---

# School Bus Routing & Fleet Management System

## 1. Core Features
* **Role-Based Access Control (RBAC):** Secure environments for Admins, Drivers, and Students/Parents.
* **Real-Time GPS Tracking:** Live map rendering using Pub/Sub WebSockets (zero database overload).
* **Dynamic Capacity Management:** O(N) capacity checking algorithm to prevent bus overloading.
* **Automated Maintenance Alerts:** Threshold-based odometer tracking.
* **Graph-Based Route Mapping:** Visualizing adjacency lists (bus stops) directly on an interactive map.

## 2. The Tech Stack
* **Frontend (Admin Dashboard):** PHP, Vanilla JavaScript, Tailwind CSS.
* **Frontend (Mobile Apps):** Capacitor JS wrapping HTML/JS/Tailwind for native iOS/Android compilation.
* **Backend & Auth:** Supabase (PostgreSQL, Realtime WebSockets, Authentication).
* **Mapping Engine:** Leaflet.js with CartoDB Positron (OpenStreetMap) tiles.
* **Deployment:** Vercel (Web frontend), Docker (Local PHP Dev).

## 3. UI/UX Design System
A calm, daylight-readable aesthetic optimized for mobile drivers and students.
* **Base Background:** Beige `bg-[#F5F4F0]` or Tailwind `bg-stone-100`.
* **Surface Containers:** Pure White `bg-white` with soft borders `border-stone-200`.
* **Primary Accents:** Light Blue `bg-sky-400` (Buttons, Active states, Map Route Lines).
* **Typography:** Dark Slate `text-slate-700` and `text-slate-800`.

## 4. Database Schema (PostgreSQL via Supabase)
* `users`: `id`, `auth_id`, `name`, `role`, `contact_number`
* `buses`: `id`, `plate_number`, `capacity`, `current_mileage`, `current_lat`, `current_lng`, `status`
* `routes`: `id`, `route_name`, `driver_id`, `bus_id`
* `route_stops` *(The Graph Nodes)*: `id`, `route_id`, `stop_name`, `latitude`, `longitude`, `stop_sequence`
* `student_assignments` *(The Hash Table)*: `id`, `student_id`, `route_id`, `status`

## 5. System Architecture
We utilize a **Client-Server Publisher-Subscriber (Pub/Sub)** model to orchestrate live data:
1. **Publisher (Driver App):** Uses Capacitor Geolocation API to ping device GPS. Broadcasts `[lat, lng]` payload to a Supabase Realtime channel.
2. **Subscribers (Student/Admin Apps):** Listens to the Realtime channel. Catches the payload and triggers Leaflet to update the marker position.
3. **Middleware (PHP/Supabase REST):** Handles standard CRUD, Graph node serving for the map, and Hash Table data verification for student boarding.

## 6. Execution Flow

### A. Admin Flow (Web Dashboard)
1. Authenticates into the PHP/Tailwind dashboard.
2. Plots Graph nodes (Stops) to create a `Route`.
3. Assigns a Driver and Bus to the Route.
4. Assigns Students (system runs capacity check algorithm).
5. Monitors global fleet via the live Leaflet map.

### B. Driver Flow (Capacitor App)
1. Authenticates and selects the day's assigned Route.
2. Taps **"Start Route"** -> Geolocation listener boots up and pushes WebSockets payloads.
3. Arrives at stop: Inputs Student ID -> System triggers $O(1)$ lookup to verify assignment and updates capacity counter.
4. Taps **"End Route"** -> Prompts for final odometer reading to check maintenance thresholds.

### C. Student Flow (Capacitor App)
1. Authenticates to view assigned bus/route details.
2. Receives push notification when Driver taps "Start Route".
3. Opens the Live Map to watch the light blue bus marker glide toward their specific stop in real-time.