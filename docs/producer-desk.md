# Producer desk and recap export

The match room provides explicitly requested, saved producer drafts in Casual and Analyst modes. Talking points are up to two evidence-linked spoken points. Recaps are short snapshots with a required score fact plus one optional supported fact; they are not comprehensive minute-by-minute accounts.

`POST /api/matches/:id/producer` accepts `{throughSequence, audience, output}` where output is `talking_point` or `recap`. Only prefix events enter the evidence packet. Separate narrative and verifier calls use purpose-specific prompts and cache contracts, with one bounded rewrite. An uncached draft normally uses two model calls, up to four with rewrite/review. Reading or exporting a saved draft makes no model calls. Existing minute gates, concurrency, cache and usage accounting apply; development daily caps remain disabled as requested.

The server labels a recap `catchup` except when its last observed event is the recorded halftime or fulltime boundary. That boundary is also stated in the approved score fact. Moving a slider near 45 or 90 minutes does not imply the boundary has occurred. Recap generation rejects a draft lacking the score fact.

Migration 7 adds a deduplication key and a narrow SECURITY DEFINER publication function. Accepted documents are written atomically to insights, insight_evidence and insight_verifications. The function checks accepted status, synthetic data, valid replay cutoff, source text and event citations at or before that cutoff. It does not independently evaluate prose: trusted backend orchestration performs the model review before calling it. Browser requests cannot supply a document or acceptance verdict. The app role has no direct insert privileges or hidden-reference access. Repeating an identical cached draft returns the same saved publication.

`GET /api/matches/:id/producer-feed?throughSequence=N` returns the latest 50 accepted entries through that cutoff, ordered by replay sequence and publication ID. Structured documents are validated before rendering/export; legacy unstructured records remain readable but are not exported as reviewed recaps. Feed loading is debounced while scrubbing. The UI filters by audience and cutoff again so rewinding hides later drafts immediately.

`GET /api/matches/:id/recap-export?throughSequence=N&audience=casual&format=markdown` downloads the latest valid saved recap at or before the cutoff; `format=json` provides the structured API export. No recap results in 404 rather than generating one implicitly. Exports include the evidence cutoff, original source facts, event citations, synthetic-data disclosure and the need for human producer review. Markdown escapes generated inline markup. Generation, refresh and export do not email, publish externally or submit the draft to a broadcast system.

Automated review is fallible. All producer output remains a draft for human review. Production authentication, abuse protections, deployment and independent evaluation of generated prose remain future work.

Run `npm run producer:check -w backend` for the rolled-back database checks (no model calls).

Validation: unit tests cover unreviewed/future document rejection, source-preserving exports, Markdown escaping, purpose cache separation, mandatory recap score and recorded boundaries. The rolled-back database integration test covers publication, deduplication, prefix filtering, malformed/future evidence rejection and role isolation without model calls.
