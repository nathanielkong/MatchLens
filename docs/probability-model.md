# Simulation result probabilities — v1

Implemented on 21 October 2026. These probabilities describe this synthetic football generator, not real matches or betting odds.

## Inputs and calculation

The runtime reads only the events through the requested replay time or sequence. It uses the observed score, elapsed/period clock, cumulative synthetic xG and red cards. It does not use final results, team strengths, scenario labels, seeds, position interpolation, or the current match's eventual duration. The app database role still cannot read private truth tables.

Remaining home and away goals follow independent Poisson distributions. Training-match goal rates provide a prior; observed xG updates that rate with shrinkage. Red-card differences adjust subsequent rates. Summing the goal-count combinations gives home win, draw and away win probabilities. The deterministic sum replaces random Monte Carlo noise in the UI. A validation-selected temperature softens those probabilities. Before a recorded fulltime event, at least 60 seconds of scoring uncertainty remains, including when simulated added time exceeds the training average. A visible fulltime event resolves the result.

Training-derived expected added time is used, not the eventual added time for the current match. Finite Poisson sums use 80 goal-count values per side with means capped at 30; omitted tail mass is negligible at that cap and the three outputs are normalized.

The state endpoint adds a probability history sampled roughly once per minute, plus observed goals/red cards and the current cutoff. It filters the event prefix before computing any predictions. Scrubbing backwards returns a shorter history. Predicted future history is not sent to the chart. Runtime predictions are calculated locally in the API and are not written to the probability snapshot table yet.

## Evaluation

Reproduce with `npm run probability:evaluate -w backend`, using the administrator database connection for offline training labels only. The command reads active train/validation/evaluation matches and only shots, cards and period boundaries, not the complete event dataset. It fits locally and writes model parameters plus aggregate evaluation results. No model API calls or new cloud resources are needed.

- Train: 1,000 matches; base home/away scoring rates and average added time.
- Validation: 200 matches; select prior duration, card effect and temperature by log loss.
- Held-out evaluation: 300 matches, seven elapsed-time cutoffs per match (0, 15, 30, 45, 60, 75 and 90 minutes), giving 2,100 correlated snapshots. Fulltime outcomes are not included as prediction checkpoints.
- Cutoffs use elapsed replay minutes, including first-half added time, rather than official match-clock minutes.

| Held-out measure | Model | Constant training-result prior | Score/time Poisson baseline |
| --- | ---: | ---: | ---: |
| Multiclass Brier score, summed across 3 classes (lower is better) | 0.5066 | 0.6666 | 0.5144 |
| Log loss (lower is better) | 0.8480 | 1.0986 | 0.8612 |
| Most likely result accuracy | 57.9% | 34.7% | 57.1% |

The improvement over the score/time baseline is small. At kickoff the model's Brier score is 0.6768, worse than the constant prior; later checkpoints improve as the score becomes informative. Accuracy rises from 34.7% at kickoff to 89.0% at elapsed minute 90. This is not a promise of accuracy on a new real-world match. The ten-bin top-label expected calibration error is 0.0257 on these synthetic snapshots; it does not establish real-world calibration.

See `probability-evaluation.json` for all checkpoint metrics, bin counts and fitted parameters. Snapshots from one match are correlated; no confidence interval or statistical significance claim is made. The same generator and eight teams occur across the three match-disjoint splits. The 60 rainy evaluation fixtures are a stress subset, not a different football data source. Stronger baselines, independent generators/teams and real-world data would be needed before broader claims.

## Replay accuracy audit

Across the 16 active showcase matches, all 8,819 pass events name a recipient from the passing team; none have a missing recipient. There are 6,934 completed passes and 1,885 incomplete passes. A turnover does not by itself indicate an animation error.

The renderer now anchors a completed pass's named receiver at its recorded destination. This fixes a mismatch between the generator's lead-pass target and its independently sampled formation positions. The acting player is anchored at the source during release; carries also anchor their end position. These visual anchors never change recorded events, outcomes, statistics or model inputs. They do not enforce physical collision avoidance or reconstruct real tracking.

Ball flight uses distance and recorded ball speed, rather than the whole decision/action interval. Action endpoints take priority over post-action samples. Restarts hold the previous ball location and reposition at the restart, instead of drawing a slow cross-pitch pass. Incomplete passes have amber paths. All motion remains explicitly labelled as an interpolated approximation.

## Verification

The production build and all 21 frontend/backend unit tests pass. Azure integration tests verify app-role denial of private labels, exact event cutoffs and prediction-history rewinds. A read-only HTTP audit of all 16 showcase matches made 65 requests, checked normalization, fulltime resolution and exact rewind reproducibility; warm requests measured 3.1 ms median and 17.4 ms maximum locally. These are local warm-cache measurements, not cloud deployment guarantees. Reproduce the read-only audit with `npm run probability:check -w backend` while the API is running.

The redesigned home/match pages were checked at desktop and phone widths, including continuous playback and keyboard selection/rewind from the graph.
