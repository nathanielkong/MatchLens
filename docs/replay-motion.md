# Replay motion and evidence boundaries

The pitch uses a canvas and a ref-held replay clock, updated with `requestAnimationFrame`. Playback advances by real elapsed foreground time at 0.5×–32× speed. Hidden tabs resume without jumping across the time spent in the background. Slider input changes the clock directly; React updates the surrounding interface at most ten times per second.

`GET /api/matches/:id/visual-replay` preloads the selected showcase match's frames and the event coordinates needed for drawing. The browser reuses this visual data on seeks and revisits. Players and ball move linearly between neighbouring samples. Halftime resets snap, and substitutions/dismissals apply at their event time and sequence, so incoming players do not appear early. Pass/carry/shot endpoints provide extra ball keyframes; actor-relative event coordinates are converted to the fixed pitch frame. Recorded samples take priority at matching timestamps. Ball trails and brief pass lines are visual overlays.

This is an approximation of simulated positions, not reconstructed continuous tracking. Interpolation intentionally looks ahead to a later position sample. It must not be used to calculate metrics, probability features, turning points, or AI evidence.

Statistics and event-feed requests use `/state` with an explicit time or sequence cutoff and `includeFrame=false`. The server filters source events before calculating statistics or grouping pressure observations. Future visual samples cannot change these results. Existing cutoff-safe event/tracking routes remain available. Future agent/probability tool registrations must allow only evidence endpoints, excluding `visual-replay` and the browser's visual cache.

To avoid repeated Azure round trips, the server keeps at most four approved showcase replays for five minutes, sharing concurrent loads. It reads only the existing replay views. The state endpoint reuses this source data but returns only the requested prefix; full-match group lengths are never reused for an earlier cutoff. Restart the backend after editing the otherwise immutable showcase data to clear this cache immediately.

Evidence refreshes at most ten times per second when the cutoff changes; repeated identical cutoffs do not trigger another request. Only one evidence request is in flight, and seeking cancels it. Responses from before a seek or match switch are discarded. The statistics panel displays its evidence timestamp. The pitch continues drawing independently of network responses.

Verification covers interpolation, duplicate timestamps, halftime boundaries, roster transitions, ball coordinates and refresh-rate-independent clock progression. Azure integration tests compare cached pressing groups with SQL, check visual/evidence separation, rewind after visual preload, and confirm repeated requests do not repeat database reads. In a local warm-cache check, ten state requests had a 1.3 ms median and a 7.5 ms maximum; this is not a deployment latency guarantee.

Reference: [Pieter Robberechts, Animating tracking data](https://observablehq.com/@probberechts/animating-tracking-data). No animation library or additional rendering dependency was added.
