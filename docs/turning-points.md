# MatchLens turning-point candidates

The match room now marks large changes in the simulation model’s outlook. These are **model-based candidates**, not confirmed tactical turning points or real-football predictions.

## Detection

`probability-shift-v1` processes observed events in sequence order. For each shot or red card, it compares the three result probabilities immediately before and after the event, using the same elapsed and period clocks. If any probability changes by at least **8 percentage points**, it records the event, before/after estimates, largest absolute shift and event citation. The threshold was fixed before the reference evaluation; it was not tuned on the showcase labels.

The calculation uses the existing `simulation-poisson-v1` model: observed score, xG, red cards and time. It excludes the full-time whistle, pure clock drift, interpolated player positions, generator strengths and hidden labels. A goal changes the score and adds its shot xG in the same observation, so the shift must not be described as an isolated causal effect of the goal alone. A red card only changes the model’s subsequent scoring rates; a notable dismissal can fall below the threshold.

`GET /api/matches/:id/state` returns `turningPoints` at the same explicit cutoff as statistics and probabilities. Filtering precedes detection. Same-clock events are distinguished by sequence; rewinding cannot retain a later candidate. The UI shows the latest six detected moments and total count, lets users replay the exact event, and exposes all three before/after estimates. The public offline sample does not run this analysis.

The latest candidate is also included in the approved AI fact catalogue, with its original event citation and limitations. Summaries may use this fact through the existing narrative/review workflow; detection itself makes **no model API calls**. Q&A can also select the turning-point fact when a question asks about a detected shift; current probabilities outside that fact remain outside its catalogue.

## Reference evaluation

Run `npm run turning-points:evaluate -w backend`. Runtime event reads use the restricted app role. Only this offline command uses administrator credentials to read `simulation_private.turning_points` and review coverage. Neither hidden references nor future labels are passed to the detector. The command fails if a showcase match lacks reference-review coverage, including explicit zero-anchor reviews.

The command publishes aggregate reports to `docs/turning-point-evaluation.json` and `frontend/public/turning-point-evaluation.json`. It does not publish reference rows, final outcomes, match event datasets or hidden expected explanations. Each of seven elapsed cutoffs plus full time is evaluated separately. Matches with no anchors remain in the report. Matching requires the exact event sequence and kind, once per match; duplicate predictions cannot inflate recall. Repeated prefixes are correlated and are not treated as independent evaluation samples.

Across all **16 showcase matches**, the full-time result is **48 matched candidates out of 54 eligible anchors**: precision **100%**, recall **88.9%**, F1 **0.941**. This covers **48 of 51 goals** and **0 of 3 red cards**. The six missed anchors did not cross the fixed 8-point threshold. One match has zero eligible anchors, and the detector emits no candidates for it.

These figures measure agreement with event-derived goal/card anchors, **not general AI accuracy**. The references were generated from the same simulated event records and have no independent human judgement of importance. A baseline that simply lists every goal and red card scores perfectly by construction. Tactical-change candidates are excluded until reviewed; a non-goal shot could be a meaningful model shift yet count as unmatched under this limited reference definition. AI prose correctness, tactical causality and performance on real football are not evaluated here.

## Verification

Unit checks cover identical-clock probability differences, second-half clock handling, cards without score changes, full-time/clock exclusions, exact prefix invariance, immutable inputs, one-to-one reference scoring and cutoff-safe AI citations. The read-only showcase API audit checks normalization, candidate thresholds, full/prefix consistency and exact rewind reproducibility across all 16 matches.
