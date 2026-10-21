# Studio interface update

The explanatory home page is at `/`; replay and analysis are on `/match-room`. The home page explains the product, users, data/evidence pipeline, actual vs planned features, and Azure architecture. Scroll reveals, a scrubbed lens orbit and a growing process rail add restrained motion. The match room uses pale glass panels, ink typography, lavender/amber side colours and a slate pitch with larger dark shirt numbers. These are studio presentation colours, not changes to the fictional teams in the database. Mobile layouts stack the pitch and statistics, keep playback controls together, and provide full-width event filters. The data explanation uses a native dialog with keyboard dismissal.

Lenis manages page scrolling through the GSAP ticker, with ScrollTrigger updated on scroll. Event feeds and the dialog use `data-lenis-prevent`. GSAP scopes and reverts entry/scroll reveals on cleanup. Decorative animations skip `prefers-reduced-motion`; smooth wheel scrolling is disabled for that preference. The canvas pitch retains its independent animation loop and uses no decorative animation library. Live statistics and scores are never count-up animated.

React Bits CountUp is copied into `frontend/src/components/react-bits/` from its TypeScript/plain-CSS source, with the adjacent license retained. It animates only static dataset counts on the home page. No Tailwind/shadcn scaffold was required for this component. The checked license is MIT + Commons Clause, permitting inclusion in applications while restricting redistribution of the components themselves. MatchLens uses it as part of this application.

Sources:
- https://github.com/darkroomengineering/lenis
- https://gsap.com/resources/React/
- https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/TextAnimations/CountUp/CountUp.tsx
- https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md

## Preview without Azure

`/match-room?preview=sample` explicitly uses the existing committed public sample: 100 events and two position frames. It does not fetch the Azure API, start the backend or restart cloud resources. The sample is limited to its final event at 05:45 and ends as “SAMPLE COMPLETE”; it does not pretend to cover the full match. Position coverage is limited. Sample statistics reuse the pure calculation functions and filter by the selected time/sequence before calculation.

Normal mode continues to use the Express API. If the library is unavailable, it displays a reconnect action and an opt-in sample link. API calls have an eight-second timeout. Preview code/data loads as a separate chunk.

## Feature and backend status

| Area | Implemented | Remaining |
| --- | --- | --- |
| Dataset | Synthetic generator, fixed seeds, splits, Azure migration, protected references | Review tactical annotations and participant-only schema mapping |
| API | Match/lineup selection, cutoff-safe events, tracking, statistics, grouped pressing, visual preload, replay cache | Additional analysis endpoints as features are built |
| Replay UI | Continuous playback, interpolation, event stepping, score/statistics, new responsive studio design | Further product refinement based on review |
| Producer output | Verification/evidence storage and accepted-feed read endpoint | Content generation, producer UI, recap export |
| Probabilities | Fitted Poisson model, 300-match held-out evaluation, cutoff-safe history graph, simulation labels | Broader validation beyond this generator; optional snapshot persistence |
| AI | Evidence foundation and reference tables | Orchestrator, analysis/narrative/verifier agents, Q&A, turning-point detector and recaps |
| Hosting | Azure PostgreSQL migrated | Foundry model setup, agent runtime and Container Apps deployment |

Next backend milestone: implement the first evidence-linked insight with orchestration, analysis, narrative, verification and bounded rewrite handling. No AI calls or paid cloud deployment were introduced by this design update.

## Animated feature illustrations

The home-page cards now have bounded random player movement, smoothly changing decorative graph paths, and a floating quotation mark with breathing text lines. These illustrations are unrelated to match data or probability calculations and are hidden from assistive technology. Animation pauses outside the viewport and in background tabs; reduced-motion users see static illustrations. Scoped cleanup stops all animation when components unmount.

A local ignored `backend/.env.foundry` file is prepared for the Azure OpenAI endpoint, deployment name and API key. It is private (0600), defaults to AI disabled, and is not loaded by the current API. No Foundry client, AI requests or new cloud resources are introduced by this animation update. The next backend work is the evidence contract and orchestrator/analysis/narrative/verifier pipeline, with an explicit client configuration and bounded model usage.
