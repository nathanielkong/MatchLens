ALTER TABLE datasets DROP CONSTRAINT datasets_split_check;
ALTER TABLE datasets ADD CONSTRAINT datasets_split_check CHECK(split IN ('showcase','train','validation','evaluation'));
ALTER TABLE datasets ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE datasets ADD COLUMN configuration jsonb NOT NULL DEFAULT '{}';
ALTER TABLE teams ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE matches ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE matches ADD COLUMN kickoff_at timestamptz;
ALTER TABLE lineups ADD COLUMN role text;
ALTER TABLE events DROP CONSTRAINT events_type_check;
ALTER TABLE events ADD CONSTRAINT events_type_check CHECK(type IN ('kickoff','pass','carry','shot','tackle','interception','foul','red_card','substitution','halftime','fulltime','pressure','save','block','recovery','corner','goal_kick','free_kick','throw_in','yellow_card','tactic_change'));
ALTER TABLE events DROP CONSTRAINT events_clock_seconds_check;
ALTER TABLE events ADD CONSTRAINT events_clock_seconds_check CHECK(clock_seconds BETWEEN 0 AND 7200);
ALTER TABLE simulation_private.match_truth ADD COLUMN configuration jsonb NOT NULL DEFAULT '{}';
CREATE TABLE simulation_private.player_attributes (
 player_id text NOT NULL REFERENCES players(id),generator_version text NOT NULL,attributes jsonb NOT NULL,
 PRIMARY KEY(player_id,generator_version)
);
CREATE TABLE simulation_private.team_parameters (
 team_id text NOT NULL REFERENCES teams(id),generator_version text NOT NULL,parameters jsonb NOT NULL,
 PRIMARY KEY(team_id,generator_version)
);
CREATE TABLE tracking_frames (
 match_id text NOT NULL,through_sequence integer NOT NULL,clock_seconds integer NOT NULL,period smallint NOT NULL CHECK(period IN(1,2)),
 ball jsonb NOT NULL,positions jsonb NOT NULL CHECK(jsonb_typeof(positions)='array'),
 PRIMARY KEY(match_id,through_sequence),
 FOREIGN KEY(match_id,through_sequence) REFERENCES events(match_id,sequence)
);
CREATE INDEX tracking_clock_idx ON tracking_frames(match_id,clock_seconds,through_sequence);
CREATE TABLE dataset_quality_reports (
 dataset_id text PRIMARY KEY REFERENCES datasets(id),validator_version text NOT NULL,summary jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
-- Keep existing view columns stable for existing clients, then append new metadata.
CREATE OR REPLACE VIEW replay_matches AS
 SELECT m.id,m.home_team_id,m.away_team_id,m.duration_seconds,m.synthetic,m.metadata,m.kickoff_at
 FROM matches m JOIN datasets d ON d.id=m.dataset_id WHERE d.split='showcase' AND d.active;
CREATE OR REPLACE VIEW replay_events AS SELECT e.* FROM events e JOIN replay_matches m ON m.id=e.match_id;
CREATE OR REPLACE VIEW replay_lineups AS SELECT l.match_id,l.team_id,l.player_id,l.starter,l.role FROM lineups l JOIN replay_matches m ON m.id=l.match_id;
CREATE VIEW replay_tracking AS SELECT t.* FROM tracking_frames t JOIN replay_matches m ON m.id=t.match_id;
