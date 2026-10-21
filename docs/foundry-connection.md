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

## Persistent limits and development mode

Migration 5 creates the private `ai_runtime` accounting schema. Application credentials can call narrowly scoped functions, but cannot read or alter the accounting tables or hidden evaluation labels. Match events and dataset rows are unchanged.

Migration 6 adds `daily_limits_enabled`, defaulting to true. On the current development database it is set to **false** at the user’s request: daily request and token ceilings do not block calls, while accounting, cache, per-minute gates, concurrency and per-request bounds remain active. Calls still incur provider usage charges. Before public deployment, the administrator must re-enable daily caps with `UPDATE ai_runtime.policy SET daily_limits_enabled=true WHERE id=true;`. Setting it to false again disables only the daily caps, not the connector.

When daily caps are enabled, defaults are ten model attempts per UTC day globally, 120,000 conservative reserved tokens per UTC day, two attempts per minute per client IP/stage, and at most one in-flight model request across backend workers. The server reserves UTF-8 input bytes plus pinned instructions, output allowance and framing margin before sending a request. Reported usage can increase the recorded amount; reservations are never refunded on errors or timeouts. Requests are limited to 16,000 UTF-8 input bytes, 800 output tokens by default (maximum configurable 1,000), and 45 seconds by default. Both SDK retry settings are zero. A stuck reservation continues counting toward the day but stops blocking concurrency after two minutes.

Counters and schema-validated stage caches live in Azure PostgreSQL and survive backend restarts. Cache keys include project, model, agent/version, evidence contract, audience, match and exact evidence payload. Cache entries expire after seven days. `AI_ENABLED=false` disables the connector; the database's `ai_runtime.policy.enabled=false` disables new reservations globally. Only the database administrator can change daily policy values.

These controls bound attempts made through this backend. They are **not an OpenAI/Azure account-wide dollar cap**, do not cover Foundry playground or other clients, and cannot guarantee an exact token-to-dollar amount when providers add their own overhead or change metering. Basic support, Azure budgets/alerts, OpenAI billing settings and the database's free allowances remain separate. Client identity uses the direct peer IP; trusted reverse-proxy configuration and user authentication must be designed before public deployment. The backend still binds to loopback locally.

## Narrative and verification workflow

`POST /api/matches/:id/insights` accepts `{throughSequence, audience}` with casual/analyst modes. The orchestrator fixes the cutoff and audience. The analysis stage uses SQL and deterministic calculations to supply only permitted prefix evidence, including grouped pressing sequences. It never queries tracking or hidden truth labels.

The narrative role generates up to two claims with fact IDs, paraphrased text and cautious explanations. Strict schema/ID checks and a numeric check reject invalid output before review. A separate verifier model call, with a fresh context, judges all assertions against the approved source facts. Unsupported drafts go back for one rewrite and re-review. Invalid schemas, repeated rejection, provider failures or budget exhaustion withhold the draft. The UI displays original computed evidence, citations and a role trace beside accepted prose.

Both generative roles use the same pinned Foundry agent/model with distinct role prompts. Orchestration and evidence analysis are deterministic TypeScript stages. This is custom staged orchestration; Microsoft Agent Framework/Semantic Kernel and four independently deployed model agents are not claimed. A same-model verifier can miss errors and is not a guarantee of factual correctness.

A normal uncached summary uses two model attempts; a rewrite may need two more. When daily caps are enabled, all calls share the ten-attempt UTC ceiling and conservative token allowance. Each fixed workflow stage has a separate two-attempt per-IP minute gate, so verification and a bounded rewrite do not block each other; the in-flight gate always applies and the daily allowance applies when enabled. No unbounded paid retries occur. Stage outputs are cached privately after schema checks; candidate prose is never published until a verifier accepts it. Repeated stage inputs can reuse the cache after a restart.

The match room Generate summary button pauses playback. Scrolling, page loads, pitch animation and probability updates never call a model. Rewinding hides summaries based on later evidence. The public sample never calls the model. The browser timeout accommodates the bounded multi-stage workflow; individual model requests retain their configured timeout.

Still pending: richer Q&A beyond the computed fact catalogue, producer-feed persistence/exports, richer analysis tools and production deployment/authentication.

## Grounded match questions

`POST /api/matches/:id/questions` adds a trimmed 5–300 character `question` to the summary request fields. Questions are independent, use only the selected match prefix and have no conversation memory. A routing call selects up to three existing fact IDs, or returns an empty list. Empty selections produce a fixed insufficient-evidence response, without narrative/review calls. Unknown or duplicate IDs and extra output fields are rejected. Selected facts feed the existing narrative/review workflow; both roles receive the question as untrusted, JSON-quoted data, and the reviewer also checks whether the answer addresses it.

Supported topics: score, shots (and synthetic xG in Analyst mode), passing, grouped pressing, red cards, latest goal and detected model shifts. Future results, tactical causes, probabilities outside the supplied turning-point fact and period/player comparisons are outside this first version. The model-based router and reviewer remain fallible; original facts stay visible. The prompt uses bounded input and backend-validated evidence following [OpenAI safety guidance](https://developers.openai.com/api/docs/guides/safety-best-practices#constrain-user-input-and-limit-output-tokens).

A fresh supported question normally uses three model calls, up to five with one rewrite/review cycle; an unsupported question uses one routing call. Each stage uses the existing accounting/cache and per-stage minute gates. The UI pauses playback and hides answers after rewinding before their evidence cutoff. The question and source packet are part of cache input; summary and question contracts are separated.

Turning-point candidates are now available in the match room and latest-candidate facts are available to summaries. See [detection and reference evaluation](turning-points.md) for the limited event-anchor evaluation; this does not evaluate generated explanations.
