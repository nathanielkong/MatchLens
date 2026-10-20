# MatchLens dataset sign-off

Decision: **Approved with conditions**.

Updated 21 October 2026. Azure Database for PostgreSQL is the active database. The original local PostgreSQL database and the migration backup are retained; the local copy is a historical snapshot and does not include subsequent Azure changes.

## Inventory

| Active split | Matches | Events | Position frames |
| --- | ---: | ---: | ---: |
| Showcase | 16 | 26,303 | 11,983 |
| Train | 1,000 | 1,695,247 | 164,667 |
| Validation | 200 | 340,342 | 33,010 |
| Evaluation | 300 | 496,212 | 49,294 |
| Total | 1,516 | 2,558,104 | 258,954 |

There are eight fictional teams and 160 players. An archived earlier dataset contains another 136 matches and 76,086 events. Archived matches are excluded from active replay views. The counts above describe source events; pressure observations are not distinct pressing actions.

Data covers passes, carries, shots and outcomes, synthetic xG, linked goalkeeper actions, tackles, interceptions, recoveries, fouls, cards, substitutions, tactical changes, restarts, periods, added time, possession identifiers and sampled player/ball positions. Events record player identity, time, sequence, score at that moment, coordinates and event-specific evidence. Dataset seeds and generator versions are fixed.

## Changes completed

- Schema migrations 3 and 4 added hidden turning-point references and their event evidence. The private coverage table records all 16 showcase matches, including one with no eligible anchor. The other 15 contain 51 goals and three red cards as objective anchors; 53 tactical changes are candidates requiring interpretation before they can become scoring references. These are event-derived references, not human-authored expert annotations. No tactical significance is assumed from an event label alone.
- The application account cannot query the references, simulator strengths, final-result labels or raw training/evaluation tables. Evaluation must use separate credentials outside the runtime agents.
- `replay_pressing_sequences(match_id, through_sequence)` groups observations for the same defending team, possession and period when successive observations are no more than ten seconds apart. A longer gap starts another sequence. Calculations use only events available at the replay cutoff. A sequence still underway can grow at later cutoffs. The rule is versioned `press-v1`; its count is not a success rate, PPDA or continuous tracking measurement.
- Producer-feed storage supports minute-linked talking points and recaps. Only insights with evidence and a latest accepted verification appear in the producer view. A later rewrite/rejection removes the insight from that view. The feed is currently empty because the agents have not been built.
- Club-style names were replaced with MatchLens-prefixed coined labels. No club badges or Premier League assets are included. Details and review limits are in `branding-review.md`.
- The public sample contains a single 100-event prefix, two position frames and the necessary team/player/lineup records. Full exports, backups, credentials and private annotation files are excluded from source control. The generator, seed script, migrations and seed manifest can be published.

## Evaluation contract

Compare detected turning points with `simulation_private.turning_points`, using the same match, kind and team and the stored time window. Match predictions to references one-to-one so repeated alerts do not receive repeated credit. Report precision, recall, duplicate alerts and timing error for the objective goal/card anchor task. Keep tactical candidates outside the scored reference set until reviewed. Goal/card results do not establish coverage of momentum shifts or tactical insight quality.

Separately check that each explanation cites events at or before its replay cutoff, reports scores and actors correctly, and avoids unsupported causal claims. Annotate sustained pressure and momentum references before claiming a comprehensive turning-point benchmark. These reference matches are a showcase benchmark, not an independent real-world test set.

## Limitations and conditions

No offsides or penalties are modelled. Injuries, VAR, extra time and shootouts are also absent. Positions, distance, speed and xG are simulated approximations; they are not measured tracking or a model trained on real football. Evaluation uses the same generator and fictional teams, with seeded variation and a rain stress subset. It cannot establish generalisation to real matches.

Probability tables exist, but a probability model, calibration and saved predictions are still future implementation. No claim of prediction accuracy is approved. The database supports the planned features; the dataset does not mean those features are already working.

Conditions before final submission: review tactical/momentum reference annotations, check any participant-only official schema against the mapping, and review the completed visuals for accidental branding resemblance. Public GitHub publication is a separate submission task. The schema and data foundation are ready for backend analytics work.

## Verification

Five generator tests passed. Azure integration checks passed for pressing deduplication, time gaps, possession and period boundaries, replay cutoffs, denied private-table access, and producer acceptance/rewrite behaviour. Integration fixtures were rolled back. Source match events and tracking frames were retained during this update.

## Reproduction

With a configured PostgreSQL database and environment, run `npm run db:migrate`, `npm run db:seed`, then `npm run db:finalise`. The first seed creates the full dataset; later seed/finalise runs are idempotent. Run `npm test`, `npm run db:test` and `npm run db:verify` for validation. The finalise step updates branding and hidden references and refreshes only the small public sample. It does not reimport or regenerate match events.
