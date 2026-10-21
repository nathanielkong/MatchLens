-- Keep accounting and short-term protections when development daily caps are disabled.
ALTER TABLE ai_runtime.policy ADD COLUMN daily_limits_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.ai_reserve(request_id uuid, requested_key text, requested_client text, tokens integer)
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
 IF p.daily_limits_enabled AND (n>=p.requests_per_day OR used+tokens>p.tokens_per_day) THEN RAISE EXCEPTION 'AI_DAILY_LIMIT'; END IF;
 IF (SELECT count(*) FROM ai_runtime.requests WHERE client_hash=requested_client AND created_at>now()-interval '1 minute')>=2
 THEN RAISE EXCEPTION 'AI_RATE_LIMIT'; END IF;
 INSERT INTO ai_runtime.requests(id,cache_key,client_hash,reserved_tokens) VALUES(request_id,requested_key,requested_client,tokens);
END
$$;

CREATE OR REPLACE FUNCTION public.ai_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
 SELECT jsonb_build_object('enabled',p.enabled,'dailyLimitsEnabled',p.daily_limits_enabled,'requestsPerDay',p.requests_per_day,'tokensPerDay',p.tokens_per_day,
 'requestsToday',(SELECT count(*) FROM ai_runtime.requests WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
 'reservedTokensToday',(SELECT coalesce(sum(greatest(reserved_tokens,actual_tokens)),0) FROM ai_runtime.requests
 WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) FROM ai_runtime.policy p WHERE id=true
$$;
