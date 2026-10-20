# Challenge data mapping

Reviewed 21 October 2026 against the [official rules](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md), the [public repository](https://github.com/microsoft/insidethegamehackathon) and its [resource playlists](https://github.com/microsoft/insidethegamehackathon/blob/main/RESOURCE%20PLAYLISTS.md).

No downloadable canonical event schema or sample dataset was found in those public materials. This is a mapping to the published challenge concepts, not a claim of compatibility with an official interchange format. The Hackathon Website could not be inspected without access to its participant experience; participant-only materials remain to be checked. Do not rename this document an official schema specification.

| Published concept | MatchLens representation | Qualification |
| --- | --- | --- |
| Match metadata | `matches`, `teams`, `lineups`, `datasets` | Entirely synthetic; active replay limited to showcase split |
| Passes and pass quality | `events` type `pass`, coordinates, outcome, `details` recipient/difficulty/distance/progression | Seeded synthetic calculations |
| Shots and speed | `shot`, `save`, `block`; `details` xG, shot speed and goalkeeper links | Synthetic speed and xG |
| Tackles and possession changes | `tackle`, `interception`, `recovery`, possession identifiers | Possession transitions are explicit |
| Pressure events | `pressure` raw observations; `replay_pressing_sequences` for sequence counts | Repeated observations grouped before pressing statistics |
| Player identification and movement | `players`, `lineups`, `tracking_frames` positions and speed/distance fields | Sampled simulation, not video tracking |
| Key moments and explanations | `insights`, `insight_evidence`, hidden reference/evidence tables | Detector and narrative agents still to build |
| Timed broadcast output | insight event cutoff joined to clock/period in `replay_producer_feed` | API returns only verified, evidenced output at the requested cutoff |
| Personalisation | `insights.audience`, `language`; future team preference | Casual/Analyst planned now; multiple languages deferred |
| Replay and probability | event sequences and `probability_snapshots` | Probability model and calibration not implemented |

The rules request synthetic football intelligence and discuss event interpretation, narratives and overlays; they do not supply field-level definitions in the checked public files. If a participant schema becomes available, add an adapter and a field-by-field compatibility check while retaining the internal event sequence and evidence constraints.
