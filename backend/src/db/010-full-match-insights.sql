-- Expand bounded output and approved derived evidence; preserve cutoff and publication checks.
CREATE OR REPLACE FUNCTION public.publish_producer_document(document jsonb, output_kind text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item_id bigint; claim jsonb; evidence integer; seq integer; requested_match text; key text;
BEGIN
 IF output_kind NOT IN ('talking_point','catchup','halftime','fulltime') OR octet_length(document::text)>50000
 OR document->>'publicationKind' IS DISTINCT FROM output_kind
 OR document->'verification'->>'accepted' IS DISTINCT FROM 'true'
 OR document->>'synthetic' IS DISTINCT FROM 'true'
 OR coalesce(document->>'audience','') NOT IN ('casual','analyst')
 OR jsonb_typeof(document->'claims') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'INVALID_PRODUCER_DOCUMENT'; END IF;
 IF jsonb_array_length(document->'claims') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'INVALID_PRODUCER_DOCUMENT'; END IF;
 requested_match:=document->>'matchId';seq:=(document->>'throughSequence')::integer;
 IF NOT EXISTS(SELECT 1 FROM replay_events WHERE match_id=requested_match AND sequence=seq AND clock_seconds=(document->>'atSeconds')::integer)
 THEN RAISE EXCEPTION 'INVALID_PRODUCER_CUTOFF'; END IF;
 IF output_kind IN ('halftime','fulltime') AND NOT EXISTS(SELECT 1 FROM replay_events WHERE match_id=requested_match AND sequence=seq AND type=output_kind)
 THEN RAISE EXCEPTION 'INVALID_PRODUCER_BOUNDARY'; END IF;
 IF output_kind<>'talking_point' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(document->'claims') c WHERE c->>'id'='score')
 THEN RAISE EXCEPTION 'INVALID_PRODUCER_SCORE'; END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(document->'claims') LOOP
  IF coalesce(length(claim->>'text'),0) NOT BETWEEN 1 AND 650 OR coalesce(length(claim->>'sourceText'),0)<1
  OR (claim->'prefix'->>'throughSequence')::integer IS DISTINCT FROM seq
  OR jsonb_typeof(claim->'evidenceSequences') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'INVALID_PRODUCER_EVIDENCE'; END IF;
  IF jsonb_array_length(claim->'evidenceSequences')<1 THEN RAISE EXCEPTION 'INVALID_PRODUCER_EVIDENCE'; END IF;
  FOR evidence IN SELECT value::integer FROM jsonb_array_elements_text(claim->'evidenceSequences') LOOP
   IF evidence>seq OR NOT EXISTS(SELECT 1 FROM replay_events WHERE match_id=requested_match AND sequence=evidence)
   THEN RAISE EXCEPTION 'INVALID_PRODUCER_EVIDENCE'; END IF;
  END LOOP;
 END LOOP;
 key:=md5(output_kind||document::text);
 INSERT INTO insights(match_id,through_sequence,kind,audience,language,model_version,body,publication_key)
 VALUES(requested_match,seq,output_kind,document->>'audience','en',document->'verification'->>'version',document::text,key)
 ON CONFLICT(publication_key) DO NOTHING RETURNING id INTO item_id;
 IF item_id IS NULL THEN SELECT id INTO STRICT item_id FROM insights WHERE publication_key=key;RETURN item_id;END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(document->'claims') LOOP
  FOR evidence IN SELECT value::integer FROM jsonb_array_elements_text(claim->'evidenceSequences') LOOP
   INSERT INTO insight_evidence VALUES(item_id,requested_match,seq,evidence) ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 INSERT INTO insight_verifications(insight_id,match_id,through_sequence,verifier_version,verdict,report)
 VALUES(item_id,requested_match,seq,document->'verification'->>'version','accepted',document->'verification');
 RETURN item_id;
END
$$;
REVOKE ALL ON FUNCTION public.publish_producer_document(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_producer_document(jsonb,text) TO matchlens_app;

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
   IF fact IS NULL OR fact NOT IN ('score','chances','pressing','passing','discipline','latest-goal','turning-point','tactics','changes','substitutions','goals','formations','probabilities','periods','players','coverage','phases','defending','goalkeepers','restarts','progression','change-windows','passing-links','player-details','time-window')
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

