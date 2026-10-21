# MatchLens feature scope

Decision: **Approved with the scope above. The 'Later' tier is deferred.**

MatchLens is an AI insights engine for studio and streaming use. It turns a synthetic match replay into timely explanations, evidence and producer talking points, with Casual and Analyst presentations.

| Tier | Features |
| --- | --- |
| Must have | Replay controls, event feed, pitch view, home/draw/away simulation probabilities, turning points, evidence panel, recaps, grounded Q&A, Casual/Analyst mode, producer talking-points feed, minute-linked insights and recap export/API |
| Should have | Match view with period comparisons, team focus and verification reporting |
| Later | Full Teams and Players views, passing networks, movement views, multiple languages and player focus |

The Later tier is future work and is excluded from the 27 October 2026 submission. Existing player and position data prepares for it without making it a submission commitment.

## Workflow and agents

1. Ingest replay events through an explicit sequence cutoff and calculate deterministic statistics, including grouped pressing sequences.
2. An orchestrator assigns the question, audience, cutoff and available evidence to specialist agents.
3. An analysis agent retrieves permitted match evidence and identifies patterns or candidate turning points. It cannot read hidden reference annotations or future outcomes.
4. A narrative agent writes a timed explanation, talking point or recap in the chosen audience mode, attaching evidence identifiers.
5. A verifier checks each claim against the cited events and calculated statistics. Unsupported claims return to the narrative agent for rewrite. After a bounded retry limit, withhold the insight and expose its failure in verification reporting. Never publish a failed draft as verified output.
6. Publish accepted insights to the replay and producer feed; provide recap export/API. A new replay cutoff permits new analysis without exposing later information in earlier insights.

The challenge's ingest/interpret/explain/render/personalise stages remain the product workflow. The agents provide distinct responsibilities inside that workflow; their implementation is pending.

## Azure implementation

Use Microsoft Foundry with Azure OpenAI for language models, Microsoft Agent Framework for orchestration, Azure Database for PostgreSQL for event/evidence storage, and Azure Container Apps for deployment. Semantic Kernel is an alternative if required by the chosen runtime; do not claim both frameworks are in use. PostgreSQL is already migrated. Model deployments, agent orchestration and Container Apps deployment remain to build. Add pgvector only if semantic retrieval is implemented; SQL retrieval over match events does not require it.

The [official rules, sections 4.2 and 6.2](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md) name Foundry, Agent Framework, Azure databases and Azure Apps among relevant technologies, and explicitly include Container Apps in the cloud-native category. This supports the chosen stack. The Hackathon Website's participant-only hero-technology guidance still needs a direct check; this report does not claim that page was accessible.

## Evaluation and delivery

Compare detected turning points against the hidden reference table, separating objective goal/card anchors from tactical candidates awaiting review. Measure evidence accuracy, cutoff violations, unsupported claims, rewrite outcomes and response time. Probabilities must be labelled simulation estimates and evaluated on held-out synthetic matches before making any accuracy claim.

Submission requires a public GitHub repository, a pitch naming the Microsoft/Azure technologies actually used, and a public demo video under two minutes showing the working application. Use no third-party trademarks or copyrighted music in the demo. These requirements and the 27 October deadline are recorded in [the official rules, sections 1 and 4.4](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md). Keep the project accessible for judging.

Implemented: Azure data access, responsive studio design, an explicit offline public-sample preview, replay screen, match selection, play/pause, time seeking, exact event stepping, interpolated canvas pitch view with continuous playback, key-event feed and deterministic statistics at a replay cutoff. Producer and verification storage also exists. Agents, the probability model, Q&A and recap generation are still pending. Next, implement and evaluate simulation probabilities, then connect agents to the evidence contract.
