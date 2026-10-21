# MatchLens Foundry connection

## Active connection

The backend uses Microsoft Foundry Agent Service with Microsoft Entra ID authentication. The OpenAI secret is stored in the Foundry admin connection, not in MatchLens or its frontend.

Path: browser → Express backend → Foundry prompt agent → external OpenAI model. OpenAI bills inference to the user's OpenAI account. Azure services can have their own charges. This is an external OpenAI model connected through Foundry, not an Azure OpenAI model deployment.

Private settings are in `backend/.env.foundry` (Git-ignored, owner read/write only). Use `backend/foundry.env.example` as the public template. The active project is `https://matchlens-nk-20261021-a7f3.services.ai.azure.com/api/projects/matchlens-ai`; the agent is `matchlens-connection-test`, immutable version `2`, using `matchlens-openai/gpt-6-luna`. Selecting a different version requires updating the configuration and restarting the backend. Requests refuse agents containing tools, skills or a managed harness; no web search is needed for this milestone.

The external model connection uses `https://api.openai.com/v1`, API-key authentication with `Authorization: Bearer {api_key}`, and the actual OpenAI `OpenAI-Project` ID. The Azure project name is not a valid OpenAI project ID. That header was configured in Foundry to resolve the portal's `invalid_project` error.

Sources: [Foundry external model connections](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/ai-gateway), [prompt agent quickstart](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/prompt-agent), [OpenAI authentication](https://developers.openai.com/api/reference/overview#authentication).

## Authentication and checks

Azure CLI is installed on this Mac. Run `npm run ai:login -w backend` when a new Azure sign-in is needed. The SDK uses `DefaultAzureCredential`; on this development machine it can use the CLI login. Production should use a managed identity with access to the Foundry project. No Azure access token is written into an environment file.

- `npm run ai:check -w backend`: local configuration check; no remote calls.
- `npm run ai:check -w backend -- --auth`: read the pinned agent definition through Azure; no inference call.
- `npm run ai:check -w backend -- --live`: one guarded CONNECTED probe, subject to persistent limits. Repeated identical probes use the database cache. Requires `AI_ENABLED=true`.
- `npm run ai:budget:test -w backend`: database integration checks in a rolled-back transaction. Does not call the model.
- `GET /api/ai/status`: local configuration and database counters. `credentialsVerified:false` deliberately means this HTTP request has not tested remote credentials; it is not a claim that the separate CLI test failed.

The Azure SDK invokes the project Responses endpoint with a pinned `agent_reference`. Do not send invocation-level `tools` with an agent reference. No conversation or `previous_response_id` is reused between requests. `store:false` is requested; this does not promise zero provider retention or disable Foundry's service-side logging.

## Persistent limits

Migration 5 creates the private `ai_runtime` accounting schema. Application credentials can call narrowly scoped functions, but cannot read or alter the accounting tables or hidden evaluation labels. Match events and dataset rows are unchanged.

Defaults: ten model attempts per UTC day globally, 120,000 conservative reserved tokens per UTC day, two attempts per minute per client IP, and at most one in-flight model request across backend workers. The server reserves UTF-8 input bytes plus pinned instructions, output allowance and framing margin before sending a request. Reported usage can increase the recorded amount; reservations are never refunded on errors or timeouts. Requests are limited to 16,000 UTF-8 input bytes, 800 output tokens by default (maximum configurable 1,000), and 45 seconds by default. Both SDK retry settings are zero. A stuck reservation continues counting toward the day but stops blocking concurrency after two minutes.

Counters and verified-result caches live in Azure PostgreSQL and survive backend restarts. Cache keys include project, model, agent/version, evidence contract, audience, match and exact evidence payload. Cache entries expire after seven days. `AI_ENABLED=false` disables the connector; the database's `ai_runtime.policy.enabled=false` disables new reservations globally. Only the database administrator can change daily policy values.

These controls bound attempts made through this backend. They are **not an OpenAI/Azure account-wide dollar cap**, do not cover Foundry playground or other clients, and cannot guarantee an exact token-to-dollar amount when providers add their own overhead or change metering. Basic support, Azure budgets/alerts, OpenAI billing settings and the database's free allowances remain separate. Client identity uses the direct peer IP; trusted reverse-proxy configuration and user authentication must be designed before public deployment. The backend still binds to loopback locally.

## First evidence summary milestone

`POST /api/matches/:id/insights` accepts `{throughSequence, audience}` where audience is `casual` or `analyst`. It queries only permitted showcase events through that sequence, selects only approved event-detail fields, calculates statistics and distinct pressing sequences, and supplies a small catalog of supported claims to the agent.

The model selects up to three fact IDs. A strict deterministic verifier rejects malformed JSON, extra fields/free-form prose, invented or duplicated IDs and future evidence. Accepted output renders the original calculated fact text and provides event links and the full aggregation-prefix range. A failed draft is withheld and is not cached; there is no automatic paid rewrite loop yet. It is an AI-selected evidence summary, not unrestricted generative football analysis.

The match room has a deliberate Generate summary button and Casual/Analyst modes. Generation pauses playback. Existing summaries display their captured cutoff and disappear when rewinding earlier than that evidence. Playback, scrolling, page loads and probability updates never trigger inference. The public sample does not call the model.

Still pending: the full orchestrator/analysis/narrative/verifier multi-agent system, free-form grounded Q&A, turning-point detection and comparison with hidden reference annotations, producer-feed persistence/exports, bounded rewrites and deployment. No Microsoft Agent Framework or Semantic Kernel implementation is claimed by this connection milestone. The older direct Azure OpenAI adapter remains available for a future Azure-hosted deployment but is not the active route.
