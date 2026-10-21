# Studio interface update

The interface now uses an ivory background, ink typography, lilac accents and a dark replay pitch. The header links directly to the workspace and match events; the introductory action skips the decorative hero. Mobile layouts stack the pitch and statistics, keep playback controls together, and provide full-width event filters. The data explanation uses a native dialog with keyboard dismissal.

Lenis manages page scrolling through the GSAP ticker, with ScrollTrigger updated on scroll. Event feeds and the dialog use `data-lenis-prevent`. GSAP scopes and reverts entry/scroll reveals on cleanup. Decorative animations skip `prefers-reduced-motion`; smooth wheel scrolling is disabled for that preference. The canvas pitch retains its independent animation loop and uses no decorative animation library. Live statistics and scores are never count-up animated.

React Bits CountUp is copied into `frontend/src/components/react-bits/` from its TypeScript/plain-CSS source, with the adjacent license retained. It animates only the hero's static synthetic-data percentage. No Tailwind/shadcn scaffold was required for this component. The checked license is MIT + Commons Clause, permitting inclusion in applications while restricting redistribution of the components themselves. MatchLens uses it as part of this application.

Sources:
- https://github.com/darkroomengineering/lenis
- https://gsap.com/resources/React/
- https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/TextAnimations/CountUp/CountUp.tsx
- https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md

## Preview without Azure

`/?preview=sample` explicitly uses the existing committed public sample: 100 events and two position frames. It does not fetch the Azure API, start the backend or restart cloud resources. The sample is limited to its final event at 05:45 and ends as “SAMPLE COMPLETE”; it does not pretend to cover the full match. Position coverage is limited. Sample statistics reuse the pure calculation functions and filter by the selected time/sequence before calculation.

Normal mode continues to use the Express API. If the library is unavailable, it displays a reconnect action and an opt-in sample link. API calls have an eight-second timeout. Preview code/data loads as a separate chunk.

## Feature and backend status

| Area | Implemented | Remaining |
| --- | --- | --- |
| Dataset | Synthetic generator, fixed seeds, splits, Azure migration, protected references | Review tactical annotations and participant-only schema mapping |
| API | Match/lineup selection, cutoff-safe events, tracking, statistics, grouped pressing, visual preload, replay cache | Additional analysis endpoints as features are built |
| Replay UI | Continuous playback, interpolation, event stepping, score/statistics, new responsive studio design | Further product refinement based on review |
| Producer output | Verification/evidence storage and accepted-feed read endpoint | Content generation, producer UI, recap export |
| Probabilities | Snapshot schema | Numerical model, held-out evaluation and probability UI |
| AI | Evidence foundation and reference tables | Orchestrator, analysis/narrative/verifier agents, Q&A, turning-point detector and recaps |
| Hosting | Azure PostgreSQL migrated | Foundry model setup, agent runtime and Container Apps deployment |

Next backend milestone: build and evaluate simulation probabilities, then implement the first evidence-linked insight with verification and rewrite handling. No AI calls or paid cloud deployment were introduced by this design update.
