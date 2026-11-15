# UDD Go — System Presentation & Defense Video Script

**Course:** ITECC04 Data Structure and Algorithm  
**Institution:** Universidad de Dagupan · School of Information Technology Education  
**Block:** 21-ITEW-03  
**Target Duration:** 3 to 5 Minutes  
**Recommended Recording Tools:** Loom, OBS Studio, Zoom (Record to Local), or QuickTime Screen Recording.

---

## 🎬 Video Recording Plan & Timeline

```
[0:00 - 0:45]  1. Title & Problem Statement (Notebooks vs. UDD Go)
[0:45 - 1:45]  2. Data Structures & Algorithms (Graphs, Hash Tables, Big-O)
[1:45 - 2:30]  3. Live Demonstration — Administrator Dashboard
[2:30 - 3:15]  4. Live Demonstration — School Bus Driver Mobile Console
[3:15 - 3:45]  5. Live Demonstration — Student Journey Radar & Pass
[3:45 - 4:15]  6. Automated Testing & Engineering Rigor (42/42 Tests)
[4:15 - 4:30]  7. Conclusion & Wrap-Up
```

---

## 🎙️ Word-for-Word Voiceover Script

### Section 1: Title & Problem Statement (0:00 - 0:45)
**Screen to show:** The **UDD Go Login Portal** (`http://127.0.0.1:5173`) showing the daylight brand panel and role selector.

> **Voiceover:**  
> *"Good day, esteemed panel and instructor. Today, we are proud to present **UDD Go**, a real-time School Bus Routing and Fleet Management System developed for the Universidad de Dagupan.*  
>  
> *Historically, assigning students to campus school buses has been managed manually using paper notebooks and disconnected spreadsheets. This manual workflow makes it nearly impossible to prevent bus overloading, frequently leads to missed vehicle maintenance intervals, and leaves campus families completely in the dark regarding transit arrival times.*  
>  
> *UDD Go was engineered to solve this problem by uniting fundamental computer science data structures with live fleet operations."*

---

### Section 2: Core Data Structures & Big-$O$ Complexity (0:45 - 1:45)
**Screen to show:** Open [`src/domain.js`](file:///Users/jamessarmiento/UDD-Go/src/domain.js) or the **Interactive Presentation Deck**.

> **Voiceover:**  
> *"In compliance with our ITECC04 syllabus, UDD Go is powered by two foundational data structures and algorithmic checks:*  
>  
> *First, we model bus routes as **Directed Graph Adjacency Lists**, operating in $\mathcal{O}(V + E)$ time complexity. Each bus stop represents a vertex $(V)$, connected by directed edges $(E)$ in topological sequence, terminating at the UDD Main Campus node. This guarantees that route progression follows physical travel order.*  
>  
> *Second, we implement **Hash Table Indexing** using key-value dictionaries. When a passenger boards, their Student ID undergoes an $\mathcal{O}(1)$ instantaneous lookup. This eliminates linear list scans, instantly validating boarding eligibility, preventing duplicate scans, and verifying seat limits.*  
>  
> *Third, our **Capacity Checking Algorithm** runs in $\mathcal{O}(N)$ time to enforce the vehicle's maximum capacity of 100 seats before saving assignments or admitting passengers.*  
>  
> *Lastly, our **Maintenance Threshold Algorithm** checks vehicle odometers against service limits, classifying buses into healthy, due soon within 500 kilometers, or overdue."*

---

### Section 3: Administrator Command Dashboard (1:45 - 2:30)
**Screen to show:** Log in as **Fleet Administrator** (Alex Morgan) on `http://127.0.0.1:5173`. Show the Overview map and Fleet Management table.

> **Voiceover:**  
> *"Let us look at the system from the **Fleet Administrator** perspective.*  
>  
> *Here on the Overview screen, administrators have live visibility of all active school buses moving across Dagupan City on an interactive Leaflet map.*  
>  
> *Under Fleet Management, we can inspect seat capacities, monitor odometers, and track real-time maintenance badges. Under Routes & Stops, administrators can click directly on the map to place stops, edit sequences, and publish immutable route versions.*  
>  
> *Furthermore, the Services and Calendar module allows recurring morning and afternoon dispatches to be automatically and idempotently generated for the school week."*

---

### Section 4: School Bus Driver Mobile Console (2:30 - 3:15)
**Screen to show:** Switch role to **School Bus Driver** (Roberto Santos). Show the In-Cabin route HUD and Boarding interface.

> **Voiceover:**  
> *"Next is the **School Bus Driver** interface, designed specifically for in-cabin tablet and mobile use via Capacitor.*  
>  
> *When Driver Roberto starts the morning run, device GPS sharing begins broadcasting position beacons. As students arrive at pickup stops, the driver taps **Board**. The system executes our $\mathcal{O}(1)$ Hash Table verification.*  
>  
> *Notice that if we attempt to scan an unassigned student or a student who has already boarded, the system rejects it immediately.*  
>  
> *Upon arrival at campus, the driver records individual drop-offs. Crucially, the trip cannot be completed until 100% of boarded students have alighted and the driver confirms: 'I checked the cabin and confirmed no passengers remain.'"*

---

### Section 5: Student & Parent Journey Radar (3:15 - 3:45)
**Screen to show:** Switch role to **Student & Parent** (Isabella Santos). Show the Radar HUD and Boarding Pass.

> **Voiceover:**  
> *"For students and parents, UDD Go provides a personal journey radar.*  
>  
> *Students can view their designated boarding ID—such as `UDD-0025`—along with estimated bus arrival proximity to their pickup stop. When the bus starts moving, device notifications alert the student so they never miss their morning ride, all while protecting passenger privacy through aggregate occupancy channels."*

---

### Section 6: Engineering Rigor & Test Suite (3:45 - 4:15)
**Screen to show:** Terminal running `npm test`.

> **Voiceover:**  
> *"Behind the user interface is production-grade software engineering.  
>  
> As you can see in our terminal, running `npm test` executes our automated test suite across real PostgreSQL transactions using PG-Lite. All **42 tests pass with zero errors**, thoroughly proving our capacity invariants, database triggers, Row-Level Security, and algorithm limits.*  
>  
> *All work is version-controlled with clean, modular commits on our GitHub repository."*

---

### Section 7: Conclusion & Wrap-Up (4:15 - 4:30)
**Screen to show:** UDD Go home screen or camera facecam.

> **Voiceover:**  
> *"UDD Go transforms school transportation into a safe, reliable, and transparent journey for the Universidad de Dagupan community.  
>  
> Thank you very much for your time, and we now welcome any questions from the panel."*

---

## 💡 Top 3 Defense Questions & Model Answers

**Q1: Why did you choose Hash Tables over a regular Array/List for student boarding?**  
*Answer:* *"A regular array lookup requires linear $\mathcal{O}(N)$ search time. During busy morning boarding with hundreds of students, scanning an array introduces latency and risk of bottlenecking. A Hash Table provides $\mathcal{O}(1)$ constant-time lookup, allowing instantaneous validation regardless of how large the student body grows."*

**Q2: How does the Graph structure handle route detours or changes?**  
*Answer:* *"Because routes are modeled as directed adjacency lists, adding or reordering a stop is simply updating the node's edge pointer. When publishing new versions, the system preserves snapshots of existing trips while linking new trips to the updated graph topology."*

**Q3: Can this system run without internet access?**  
*Answer:* *"Yes! The system features a built-in offline demo architecture persisting to browser local storage. In a production deployment with Supabase, drivers can continue logging manifest changes locally before syncing when connectivity resumes."*

