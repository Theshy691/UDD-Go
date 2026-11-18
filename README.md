# UDD Go

UDD Go is a school bus routing and fleet management project for Universidad de Dagupan. Fleet staff prepare trips and watch active buses, drivers record boarding and drop-offs, and students check their pickup stop and boarding ID.

## Try the demo

Start with Docker Compose.

```sh
docker compose up --build -d
```

Visit [localhost:8080](http://127.0.0.1:8080), select **Open school portal**, then choose a role under **Demo access**. The demo works without an account and saves changes in your browser.

For frontend development, use Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open the URL Vite prints, usually [localhost:5173](http://127.0.0.1:5173).

## Explore the interface

- **Landing page** — Try a sample Dagupan route, jump between stops, and open the school-run guidelines.
- **Fleet overview** — Prepare a trip, review maintenance alerts, and select a bus on the map. On smaller screens, the fleet list keeps the route, status, and **View** action in sight.
- **Driver workspace** — Review trip stops, record boarding and drop-offs, and confirm the cabin check.
- **Student workspace** — Check your pickup stop, boarding ID, and trip status.

The landing page uses a short background sweep and a looping UDD Go wordmark. Visitors who prefer reduced motion see the still design. The route demo also moves stop by stop in reduced-motion mode.

## Documentation

- [Full setup guide](md/README.md) for Supabase, Docker, and mobile builds
- [System overview](md/SYSTEM_OVERVIEW.md) for the architecture, data model, and workflows
- [Validation notes](md/VALIDATION.md) for testing and deployment prerequisites

Run the automated suite with `npm test` and build the frontend with `npm run build`.
