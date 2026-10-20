-- Evaluation references are never available to replay/AI application credentials.
CREATE TABLE simulation_private.turning_points (
 match_id text NOT NULL REFERENCES matches(id), event_sequence integer NOT NULL,
 reference_version text NOT NULL, kind text NOT NULL CHECK(kind IN ('goal','red_card','tactic_change')),
 team_id text NOT NULL REFERENCES teams(id), window_start integer NOT NULL,
 window_end integer NOT NULL, expected_fact text NOT NULL,
 provenance text NOT NULL, review_status text NOT NULL CHECK(review_status IN ('objective_anchor','candidate','human_reviewed')),
 PRIMARY KEY(match_id,event_sequence,reference_version),
 FOREIGN KEY(match_id,event_sequence) REFERENCES events(match_id,sequence),
 CHECK(window_start>=0 AND window_end>=window_start)
);
CREATE TABLE simulation_private.turning_point_evidence (
 match_id text NOT NULL, event_sequence integer NOT NULL, reference_version text NOT NULL,
 evidence_sequence integer NOT NULL,
 PRIMARY KEY(match_id,event_sequence,reference_version,evidence_sequence),
 FOREIGN KEY(match_id,event_sequence,reference_version) REFERENCES simulation_private.turning_points,
 FOREIGN KEY(match_id,evidence_sequence) REFERENCES events(match_id,sequence),
 CHECK(evidence_sequence<=event_sequence)
);
REVOKE ALL ON SCHEMA simulation_private FROM PUBLIC;

-- Operational definition, version press-v1: same defending team, possession and
-- period, with at most 10 seconds between observations. Not a PPDA/success model.
-- Filter BEFORE grouping so a replay cannot reveal future length/participants.
CREATE FUNCTION replay_pressing_sequences(requested_match text, cutoff integer)
RETURNS TABLE(team_id text, possession_id integer, period smallint,
 start_sequence integer, last_sequence integer, start_seconds integer,
 last_seconds integer, raw_pressure_records integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH observed AS (
  SELECT e.*, lag(clock_seconds) OVER (
   PARTITION BY e.team_id,e.possession_id,e.period ORDER BY e.sequence) AS previous_clock
  FROM public.replay_events e
  WHERE e.match_id=requested_match AND e.sequence<=cutoff AND e.type='pressure'
 ), segmented AS (
  SELECT *,sum(CASE WHEN previous_clock IS NULL OR clock_seconds-previous_clock>10
    THEN 1 ELSE 0 END) OVER (
    PARTITION BY observed.team_id,observed.possession_id,observed.period ORDER BY sequence) AS segment
  FROM observed
 )
 SELECT s.team_id,s.possession_id,s.period,min(sequence),max(sequence),
 min(clock_seconds),max(clock_seconds),count(*)::integer
 FROM segmented s GROUP BY s.team_id,s.possession_id,s.period,s.segment
 ORDER BY min(sequence),s.team_id
$$;
REVOKE ALL ON FUNCTION replay_pressing_sequences(text,integer) FROM PUBLIC;

ALTER TABLE insights DROP CONSTRAINT insights_kind_check;
ALTER TABLE insights ADD CONSTRAINT insights_kind_check
 CHECK(kind IN ('insight','catchup','halftime','fulltime','turning_point','talking_point'));
CREATE TABLE insight_verifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 insight_id bigint NOT NULL,match_id text NOT NULL,through_sequence integer NOT NULL,
 verifier_version text NOT NULL, verdict text NOT NULL CHECK(verdict IN ('accepted','rewrite','rejected')),
 report jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(insight_id,match_id,through_sequence) REFERENCES insights(id,match_id,through_sequence)
);
CREATE INDEX insight_verification_latest ON insight_verifications(insight_id,id DESC);
CREATE VIEW replay_producer_feed AS
 SELECT i.*,e.clock_seconds,e.period,v.verifier_version,v.report AS verification
 FROM insights i JOIN replay_matches m ON m.id=i.match_id
 JOIN events e ON e.match_id=i.match_id AND e.sequence=i.through_sequence
 JOIN LATERAL (SELECT verdict,verifier_version,report FROM insight_verifications
  WHERE insight_id=i.id ORDER BY id DESC LIMIT 1) v ON v.verdict='accepted'
 WHERE EXISTS(SELECT 1 FROM insight_evidence ie WHERE ie.insight_id=i.id);
