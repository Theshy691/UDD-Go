# UDD Go

UDD Go is a school bus routing and fleet management project for Universidad de Dagupan. Fleet staff prepare trips and watch active buses, drivers record boarding and drop-offs, and students check their pickup stop and boarding ID.

## Try the demo

Start with Docker Compose.

```sh
docker compose up --build -d
```

Visit [localhost:8080](http://127.0.0.1:8080) and select **Open school portal → Demo access**. Pick a named sample account in the Fleet admin, Driver, or Student panel, then select **Open demo**. To try typing credentials, select **School credentials → Demo accounts** and choose an account to fill the form. Demo changes stay in your browser.

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
- **Student workspace** — Check your pickup stop and boarding ID, then use **Report a trip issue** to send an optional note to dispatch. Admins review open reports under **Overview → Needs attention**. Students can see when dispatch receives and resolves a report.

The landing page uses animated ASCII route traces and a looping UDD Go wordmark. Visitors who prefer reduced motion see the still design. The route demo also moves stop by stop in reduced-motion mode.

## Landing page help chatbot

Open **Ask UDD Go** from the bottom of the landing page. Auto detects English, Tagalog, and Taglish. The PHP backend retrieves matching entries from [`public/api/help-guide.php`](public/api/help-guide.php), and the local Ollama model selects from those entries. The app renders approved text and source links. Follow-ups use up to two topics from the last answer. Closing the panel keeps the conversation on the current page. The chat reads the public guide and cannot access private accounts, live bus locations, or student report contents. If Ollama is busy or offline, the app can return a matching guide entry.

Run the demo with the local model, without an API key or per-message usage fees:

```sh
docker compose --profile chat up -d --build
docker compose exec -T help-model ollama pull qwen3:1.7b
```

The first model download is about 1.4 GB. Ollama is available to PHP over Docker’s internal network. Set `CHAT_OLLAMA_URL` and `CHAT_OLLAMA_MODEL` only if you are using a different local Ollama instance or model. Use the Docker/PHP app on port 8080 for chat, since static hosting only serves the landing page and FAQ.

Run the help retrieval checks in Docker with `docker compose exec -T -e UDD_HELP_API_DIR=/var/www/html/api web php < tests/help-chat.php`.

See the [system prompt](public/api/help-system-prompt.md) and [prompt examples](md/CHATBOT_PROMPTS.md) for the request format, English/Tagalog/Taglish examples, follow-ups, and guide maintenance.

## Driver route traffic

The driver demo includes sample delays and a map overlay. For a connected school workspace, set `TOMTOM_TRAFFIC_KEY` in `.env` and rebuild Docker, or set `VITE_TOMTOM_TRAFFIC_KEY` for a frontend build. Use a browser key restricted to the Routing product and your app’s domains. The app sends the assigned stop coordinates to TomTom for a full-route driving estimate. [TomTom key restrictions](https://docs.tomtom.com/platform/documentation/api-best-practices/api-key-management-best-practices)

## Documentation

- [Full setup guide](md/README.md) for Supabase, Docker, and mobile builds
- [System overview](md/SYSTEM_OVERVIEW.md) for the architecture, data model, and workflows
- [Validation notes](md/VALIDATION.md) for testing and deployment prerequisites

Run the automated suite with `npm test` and build the frontend with `npm run build`.
