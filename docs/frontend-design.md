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

A local ignored `backend/.env.foundry` file is prepared for the Azure OpenAI endpoint, deployment name and API key. It is private (0600) and defaults to AI disabled. The subsequent connection update adds an optional server-only Responses API adapter, local readiness endpoint and an opt-in live check; see foundry-connection.md. Live credentials have not been supplied or verified, and no model requests or new cloud resources were used. The evidence contract and orchestrator/analysis/narrative/verifier pipeline remain to implement.

## Performance tuning

Player dots use composited x/y transforms instead of animated left/top layout coordinates. Decorative graph paths update at up to 30 Hz while retaining smooth interpolation. All decorative animations still suspend off-screen and in background tabs. Home scrolling uses a shorter 0.45-second smoothing duration and shorter reveal/parallax easing; the working match room uses native scrolling. Large panels retain their glass-like gradients/borders without live backdrop blur. The sticky header retains a smaller blur.

The canvas skips repainting when the cursor and dimensions are unchanged, suspends drawing outside the viewport or in hidden documents, and caps pixel ratio at 2. Pass geometry is computed once, nearby pass flights are found by binary search, and player keyframes are indexed per half once. The control loop avoids writing the same slider value again.

The repeatable CPU-only `frontend/scripts/benchmark-motion.ts` uses 750 generated frames, 22 players and 10,000 lookups. Median cost per lookup was 0.0903 ms before indexing and 0.0091 ms after in a local run. This microbenchmark does not measure browser FPS or establish a whole-page speedup. Existing timing, roster and evidence-cutoff checks remain applicable; an added regression checks cached paths across half boundaries and rewinds.

## Hero and motion revision (21 October 2026)

The home hero uses a charcoal broadcast instrument with a drawn pitch, dashed action route, orbit markers, floating evidence tags and a compact faster probability illustration. It is labelled illustrative rather than live match data. CSS animations pause offscreen and in background tabs. Probability illustration morphs now take 0.65–1.05 seconds, with the existing 30 Hz drawing ceiling.

Dataset figures use large tabular number reels counting sequentially from zero on entering view, then stopping at 16/8/3. Native Web Animations move one clipped strip per counter; reduced-motion renders the final value immediately. This fixes the old inherited span font size that made two figures tiny.

Native scrolling replaces the Lenis wrapper and ticker on the home page as well as the match room. Removed hero scroll scrubbing, shortened reveal motion and removed home-header backdrop blur reduce rendering work and input smoothing. No whole-page FPS guarantee is claimed.

## Current status update: grounded questions and turning points

The hero now contains only the animated logo and orbit rings on the page background. Counters wait until the user scrolls and at least 75% of the number strip is inside a viewport inset by 15% at the bottom; they start after a short delay and stop at 16/8/3. Native scrolling remains, with short staggered reveals and gentle logo scroll movement; reduced-motion avoids these effects. This supersedes the earlier charcoal hero and smooth-scroll description.

The connected match room now includes narrative summaries, bounded grounded Q&A and a model-based turning-point panel. Turning points require an 8-percentage-point same-clock change after a shot or dismissal, show before/after probabilities, and link to the event. Only observed candidates appear, with the latest six shown. The detector makes no language-model calls. Hidden event-anchor evaluation and limitations are documented in turning-points.md. Foundry is connected through Entra ID; Container Apps hosting, richer analysis, recaps and producer exports remain pending. Earlier status tables describe the initial design milestone rather than the current implementation.
