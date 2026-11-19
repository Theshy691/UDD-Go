# Ask UDD Go prompts

The [system prompt](../public/api/help-system-prompt.md) is loaded by PHP for each model request. Edit that Markdown file to update the running chatbot’s instructions on the next build.

## What the model receives

The [help endpoint](../public/api/help-chat.php) sends the fixed system prompt, then a user message containing these fields:

| Field | Value |
| --- | --- |
| `question` | The visitor’s current question |
| `languagePreference` | `en`, `tl`, `tgl`, or `auto` if a language is unclear |
| `passages` | Up to four retrieved guide entries keyed by ID. Each contains English reference text, matching phrases, and whether it was selected in the previous answer. |

The local Ollama model outputs `language` and up to two `passages` IDs. PHP validates the IDs and matches, then looks up the approved wording and source links. The model’s role is to select the relevant content. Previous chat context consists of up to two guide IDs from the last answer.

## Questions to try

| Question | Expected guide entry and behavior |
| --- | --- |
| “What is UDD Go?” | `about` explains the school project and its three roles. |
| “How can I generate trips for the week?” | `prepare-trips` explains the difference between a service and a dated trip and the seven-day batch limit. |
| “Paano gumawa ng ruta na may bagong stop?” | `route-editing` explains routes, ordered stops, and route versions. |
| “How ko i-enable ang GPS sharing?” | `gps-sharing` explains the driver action and device permission in Taglish. |
| “Paano ako mag-report ng missed pickup?” | `issue` explains Report a trip issue in My journey. |
| “And how do I know they got it?” | After the previous question, `issue-status` explains Sent, Received, and Resolved. |
| “How much is tuition?” | No matching guide entry. The chatbot says it could not find an answer. |

For a direct API check on the Docker build, send a JSON question:

```sh
curl -fsS http://localhost:8080/api/index.php?action=help-chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"How ko i-enable ang GPS sharing?","language":"auto"}'
```

## Updating the guide

Edit the [approved help entries](../public/api/help-guide.php) when a screen or workflow changes. Add a specific question alias in each language where possible. Keep the English, Tagalog, and Taglish versions consistent and link to a source that describes the feature. Use `related` and `follow` for context-dependent questions.

Keep the guide to public product instructions and documented demo behavior. Private trip records, credentials, reports, and live locations belong in the portal. Run the retrieval checks from the [README](../README.md#landing-page-help-chatbot) and test a real model reply after changing the prompt or adding a topic.
