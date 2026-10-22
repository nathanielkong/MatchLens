# Period comparisons and team focus

The match room compares the two halves for both teams, with a switch to focus on either team. It shows period-local goals, shots, on-target shots, synthetic xG, completed passes, pass accuracy, possession estimates, grouped pressing sequences and cards.

The existing state endpoint returns an `analysis` object using the same explicit replay cutoff as match statistics. Events are filtered before splitting by recorded period and grouping pressure records. Period-local goals are counted from goal events; the cumulative match score is never reused as a half's goal total. Percentage metrics are recalculated within each half rather than averaged from earlier percentages. No tracking interpolation, private labels or model API calls enter this calculation.

A not-started half has no team statistics and displays dashes. Started halves show observed counts, including zeros. First-half completion requires a recorded halftime event or observed second-half events; second-half completion requires recorded full time. The displayed duration uses period clocks, includes added time, and advances only for the active unfinished half. A partial second half has less exposure than a completed first half; totals are not presented as equal-duration rate comparisons or proof of improvement.

The public sample uses the same calculation over its committed event prefix. Team focus changes only the displayed table and does not trigger AI requests, change evidence retrieval, or provide a full Teams page. AI summaries/Q&A do not yet receive period comparisons as approved facts; this milestone is deterministic analysis.

Tests cover unseen halves, prefix invariance, added time, period boundaries, non-cumulative goals, pressure grouping across halves and period-specific passing percentages. The showcase API audit checks that period shot/press counts and xG reconcile with overall totals, plus rewind reproducibility.
