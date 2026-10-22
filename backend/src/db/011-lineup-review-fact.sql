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
  IF jsonb_array_length(c->'factIds')>12 THEN RAISE EXCEPTION 'INVALID_REVIEW_CHECKS'; END IF;
  FOR fact IN SELECT value FROM jsonb_array_elements_text(c->'factIds') LOOP
   IF fact IS NULL OR fact NOT IN ('score','chances','pressing','passing','discipline','latest-goal','turning-point','tactics','changes','substitutions','goals','formations','probabilities','periods','players','coverage','phases','defending','goalkeepers','restarts','progression','change-windows','passing-links','player-details','time-window','lineups')
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

