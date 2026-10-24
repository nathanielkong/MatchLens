CREATE TABLE ai_runtime.conversations (
 id uuid PRIMARY KEY,owner_hash text NOT NULL CHECK(owner_hash ~ '^[a-f0-9]{64}$'),
 match_id text NOT NULL, audience text NOT NULL CHECK(audience IN ('casual','analyst')),
 through_sequence integer NOT NULL, context jsonb NOT NULL CHECK(octet_length(context::text)<=6000),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours',
 FOREIGN KEY(match_id,through_sequence) REFERENCES events(match_id,sequence)
);
CREATE INDEX conversation_owner ON ai_runtime.conversations(owner_hash,created_at);
CREATE FUNCTION public.ai_conversation_read(ids uuid[],owner text,match text,mode text,cutoff integer)
RETURNS TABLE(id uuid,context jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,ai_runtime AS $$
 SELECT c.id,c.context FROM conversations c WHERE c.id=ANY(ids) AND array_length(ids,1)<=3
 AND c.owner_hash=owner AND c.match_id=match AND c.audience=mode AND c.through_sequence<=cutoff AND c.expires_at>now()
$$;
CREATE FUNCTION public.ai_conversation_save(turn_id uuid,owner text,match text,mode text,cutoff integer,body jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ai_runtime,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM replay_events WHERE match_id=match AND sequence=cutoff)
 OR body->>'throughSequence' IS DISTINCT FROM cutoff::text
 OR jsonb_typeof(body->'question') IS DISTINCT FROM 'string' OR length(body->>'question')>600
 OR jsonb_typeof(body->'answer') IS DISTINCT FROM 'string' OR length(body->>'answer')>900
 OR jsonb_typeof(body->'eventSequences') IS DISTINCT FROM 'array'
 OR jsonb_typeof(body->'playerIds') IS DISTINCT FROM 'array'
 OR jsonb_typeof(body->'factIds') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'INVALID_CONVERSATION'; END IF;
 IF jsonb_array_length(body->'eventSequences')>8 OR jsonb_array_length(body->'playerIds')>4 OR jsonb_array_length(body->'factIds')>8
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'eventSequences') n WHERE n::integer>cutoff OR n::integer<1)
 THEN RAISE EXCEPTION 'INVALID_CONVERSATION'; END IF;
 DELETE FROM conversations WHERE expires_at<=now();
 DELETE FROM conversations WHERE id IN (SELECT id FROM conversations WHERE owner_hash=owner ORDER BY created_at DESC OFFSET 99);
 DELETE FROM conversations WHERE id IN (SELECT id FROM conversations ORDER BY created_at DESC OFFSET 4999);
 INSERT INTO conversations(id,owner_hash,match_id,audience,through_sequence,context) VALUES(turn_id,owner,match,mode,cutoff,body);
END
$$;
REVOKE ALL ON FUNCTION public.ai_conversation_read(uuid[],text,text,text,integer),public.ai_conversation_save(uuid,text,text,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_conversation_read(uuid[],text,text,text,integer),public.ai_conversation_save(uuid,text,text,text,integer,jsonb) TO matchlens_app;
