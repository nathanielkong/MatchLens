-- Operational AI accounting, separate from match data and hidden truth labels.
CREATE SCHEMA ai_runtime;
REVOKE ALL ON SCHEMA ai_runtime FROM PUBLIC;
CREATE TABLE ai_runtime.policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT true,
 requests_per_day integer NOT NULL DEFAULT 10 CHECK(requests_per_day BETWEEN 1 AND 100),
 tokens_per_day integer NOT NULL DEFAULT 120000 CHECK(tokens_per_day BETWEEN 1 AND 1000000)
);
INSERT INTO ai_runtime.policy(id) VALUES(true);
CREATE TABLE ai_runtime.requests (
 id uuid PRIMARY KEY, cache_key text NOT NULL, client_hash text NOT NULL,
 reserved_tokens integer NOT NULL CHECK(reserved_tokens BETWEEN 1 AND 50000),
 actual_tokens integer NOT NULL DEFAULT 0 CHECK(actual_tokens>=0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(result IS NULL OR status='completed')
);
CREATE INDEX ai_requests_created ON ai_runtime.requests(created_at);
CREATE INDEX ai_requests_cache ON ai_runtime.requests(cache_key) WHERE result IS NOT NULL;

CREATE FUNCTION public.ai_cached(requested_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
 SELECT result FROM ai_runtime.requests WHERE cache_key=requested_key AND status='completed'
 AND result IS NOT NULL AND created_at>now()-interval '7 days' ORDER BY created_at DESC LIMIT 1
$$;

CREATE FUNCTION public.ai_reserve(request_id uuid, requested_key text, requested_client text, tokens integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
DECLARE p ai_runtime.policy; n bigint; used bigint;
BEGIN
 -- Serialize reservations across HTTP workers, CLI checks and replicas.
 PERFORM pg_advisory_xact_lock(718045);
 SELECT * INTO STRICT p FROM ai_runtime.policy WHERE id=true;
 IF NOT p.enabled THEN RAISE EXCEPTION 'AI_DISABLED'; END IF;
 IF tokens<1 OR tokens>50000 THEN RAISE EXCEPTION 'AI_INVALID_RESERVATION'; END IF;
 IF EXISTS(SELECT 1 FROM ai_runtime.requests WHERE status='pending' AND created_at>now()-interval '2 minutes')
 THEN RAISE EXCEPTION 'AI_BUSY'; END IF;
 SELECT count(*),coalesce(sum(greatest(reserved_tokens,actual_tokens)),0) INTO n,used
 FROM ai_runtime.requests WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF n>=p.requests_per_day OR used+tokens>p.tokens_per_day THEN RAISE EXCEPTION 'AI_DAILY_LIMIT'; END IF;
 IF (SELECT count(*) FROM ai_runtime.requests WHERE client_hash=requested_client AND created_at>now()-interval '1 minute')>=2
 THEN RAISE EXCEPTION 'AI_RATE_LIMIT'; END IF;
 INSERT INTO ai_runtime.requests(id,cache_key,client_hash,reserved_tokens) VALUES(request_id,requested_key,requested_client,tokens);
END
$$;

CREATE FUNCTION public.ai_finish(request_id uuid, tokens integer, verified_result jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
 UPDATE ai_runtime.requests SET actual_tokens=greatest(0,tokens),
 status=CASE WHEN verified_result IS NULL THEN 'failed' ELSE 'completed' END,result=verified_result
 WHERE id=request_id AND status='pending'
$$;

CREATE FUNCTION public.ai_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
 SELECT jsonb_build_object('enabled',p.enabled,'requestsPerDay',p.requests_per_day,'tokensPerDay',p.tokens_per_day,
 'requestsToday',(SELECT count(*) FROM ai_runtime.requests WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
 'reservedTokensToday',(SELECT coalesce(sum(greatest(reserved_tokens,actual_tokens)),0) FROM ai_runtime.requests
 WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) FROM ai_runtime.policy p WHERE id=true
$$;
REVOKE ALL ON FUNCTION public.ai_cached(text),public.ai_reserve(uuid,text,text,integer),public.ai_finish(uuid,integer,jsonb),public.ai_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_cached(text),public.ai_reserve(uuid,text,text,integer),public.ai_finish(uuid,integer,jsonb),public.ai_usage() TO matchlens_app;
