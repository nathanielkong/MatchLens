CREATE TABLE ai_runtime.reviews (
 id uuid PRIMARY KEY, match_id text NOT NULL, through_sequence integer NOT NULL,
 audience text NOT NULL CHECK(audience IN ('casual','analyst')),
 task text NOT NULL CHECK(task IN ('summary','question','talking_point','recap')),
 outcome text NOT NULL CHECK(outcome IN ('passed','revised','withheld','unsupported','unavailable')),
 elapsed_ms integer NOT NULL CHECK(elapsed_ms BETWEEN 0 AND 600000), cached boolean NOT NULL,
 checks jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(match_id,through_sequence) REFERENCES public.events(match_id,sequence)
);
CREATE INDEX ai_reviews_match_cutoff ON ai_runtime.reviews(match_id,audience,through_sequence,created_at DESC);

CREATE OR REPLACE FUNCTION public.ai_record_review(review_id uuid, requested_match text, cutoff integer, requested_audience text,
 requested_task text, requested_outcome text, elapsed integer, was_cached boolean, review_checks jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ai_runtime,public AS $$
DECLARE c jsonb; fact text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.replay_events WHERE match_id=requested_match AND sequence=cutoff)
 THEN RAISE EXCEPTION 'INVALID_REVIEW_CUTOFF'; END IF;
 IF jsonb_typeof(review_checks) IS DISTINCT FROM 'array' OR octet_length(review_checks::text)>6000
 THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
 IF jsonb_array_length(review_checks)>5 THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(review_checks) LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(c))<>4
   OR coalesce(c->>'attempt','') NOT IN ('1','2') OR jsonb_typeof(c->'attempt') IS DISTINCT FROM 'number'
   OR coalesce(c->>'stage','') NOT IN ('routing','draft','review')
   OR coalesce(c->>'outcome','') NOT IN ('passed','rejected','unsupported','unavailable')
   OR jsonb_typeof(c->'factIds') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
  IF jsonb_array_length(c->'factIds')>3 THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
  FOR fact IN SELECT value FROM jsonb_array_elements_text(c->'factIds') LOOP
   IF fact IS NULL OR fact NOT IN ('score','chances','pressing','passing','discipline','latest-goal','turning-point')
   THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
  END LOOP;
 END LOOP;
 IF requested_outcome IN ('passed','revised') AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(review_checks) WITH ORDINALITY c(value,n)
  WHERE n=jsonb_array_length(review_checks) AND value->>'stage'='review' AND value->>'outcome'='passed'
 ) THEN RAISE EXCEPTION 'INVALID_REVIEW_VERDICT'; END IF;
 IF requested_outcome='passed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(review_checks) AS entry(value) WHERE entry.value->>'attempt'='2')
 OR requested_outcome='revised' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review_checks) AS entry(value) WHERE entry.value->>'attempt'='2')
 THEN RAISE EXCEPTION 'INVALID_REVIEW_VERDICT'; END IF;
 INSERT INTO ai_runtime.reviews(id,match_id,through_sequence,audience,task,outcome,elapsed_ms,cached,checks)
 VALUES(review_id,requested_match,cutoff,requested_audience,requested_task,requested_outcome,elapsed,was_cached,review_checks);
END
$$;

CREATE OR REPLACE FUNCTION public.ai_review_history(requested_match text, cutoff integer, requested_audience text)
RETURNS TABLE(id uuid, match_id text, through_sequence integer, at_seconds integer, audience text, task text,
 outcome text, elapsed_ms integer, cached boolean, checks jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,ai_runtime,public AS $$
 SELECT r.id,r.match_id,r.through_sequence,e.clock_seconds,r.audience,r.task,r.outcome,r.elapsed_ms,r.cached,r.checks,r.created_at
 FROM ai_runtime.reviews r JOIN public.replay_events e ON e.match_id=r.match_id AND e.sequence=r.through_sequence
 WHERE r.match_id=requested_match AND r.through_sequence<=cutoff AND r.audience=requested_audience
 ORDER BY r.created_at DESC,r.id DESC LIMIT 20
$$;
REVOKE ALL ON FUNCTION public.ai_record_review(uuid,text,integer,text,text,text,integer,boolean,jsonb),public.ai_review_history(text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_record_review(uuid,text,integer,text,text,text,integer,boolean,jsonb),public.ai_review_history(text,integer,text) TO matchlens_app;
