CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE teams (
  id text PRIMARY KEY, name text NOT NULL UNIQUE, synthetic boolean NOT NULL DEFAULT true CHECK (synthetic)
);
CREATE TABLE players (
  id text PRIMARY KEY, team_id text NOT NULL REFERENCES teams(id), name text NOT NULL,
  position text NOT NULL CHECK (position IN ('GK','DF','MF','FW')), shirt_number integer NOT NULL CHECK (shirt_number BETWEEN 1 AND 99),
  UNIQUE(team_id, shirt_number), UNIQUE(id, team_id)
);
CREATE TABLE datasets (
  id text PRIMARY KEY, split text NOT NULL CHECK (split IN ('showcase','train','evaluation')),
  generator_version text NOT NULL, seed integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE matches (
  id text PRIMARY KEY, dataset_id text NOT NULL REFERENCES datasets(id),
  home_team_id text NOT NULL REFERENCES teams(id), away_team_id text NOT NULL REFERENCES teams(id),
  duration_seconds integer NOT NULL DEFAULT 5400 CHECK (duration_seconds > 0),
  synthetic boolean NOT NULL DEFAULT true CHECK (synthetic), CHECK (home_team_id <> away_team_id)
);
CREATE TABLE lineups (
  match_id text NOT NULL REFERENCES matches(id), team_id text NOT NULL REFERENCES teams(id),
  player_id text NOT NULL, starter boolean NOT NULL, PRIMARY KEY(match_id, player_id),
  FOREIGN KEY(player_id, team_id) REFERENCES players(id, team_id)
);
CREATE TABLE events (
  match_id text NOT NULL REFERENCES matches(id), sequence integer NOT NULL CHECK (sequence > 0),
  clock_seconds integer NOT NULL CHECK(clock_seconds BETWEEN 0 AND 5400), period smallint NOT NULL CHECK(period IN (1,2)),
  type text NOT NULL CHECK(type IN ('kickoff','pass','carry','shot','tackle','interception','foul','red_card','substitution','halftime','fulltime')),
  team_id text REFERENCES teams(id), player_id text, possession_id integer NOT NULL CHECK(possession_id >= 0),
  x real CHECK(x BETWEEN 0 AND 100), y real CHECK(y BETWEEN 0 AND 100),
  end_x real CHECK(end_x BETWEEN 0 AND 100), end_y real CHECK(end_y BETWEEN 0 AND 100),
  outcome text, details jsonb NOT NULL DEFAULT '{}',
  home_score integer NOT NULL CHECK(home_score >= 0), away_score integer NOT NULL CHECK(away_score >= 0),
  PRIMARY KEY(match_id, sequence),
  FOREIGN KEY(match_id,player_id) REFERENCES lineups(match_id,player_id),
  FOREIGN KEY(player_id,team_id) REFERENCES players(id,team_id),
  CHECK(player_id IS NULL OR team_id IS NOT NULL)
);
CREATE INDEX events_clock_idx ON events(match_id, clock_seconds, sequence);
CREATE INDEX events_player_idx ON events(match_id, player_id, sequence);
CREATE TABLE statistic_snapshots (
  match_id text NOT NULL, through_sequence integer NOT NULL, scope text NOT NULL CHECK(scope IN ('match','team','player')),
  subject_id text NOT NULL, calculation_version text NOT NULL, metrics jsonb NOT NULL,
  PRIMARY KEY(match_id,through_sequence,scope,subject_id,calculation_version),
  FOREIGN KEY(match_id,through_sequence) REFERENCES events(match_id,sequence)
);
CREATE TABLE probability_snapshots (
  match_id text NOT NULL, through_sequence integer NOT NULL, model_version text NOT NULL,
  home_win numeric NOT NULL CHECK(home_win BETWEEN 0 AND 1), draw numeric NOT NULL CHECK(draw BETWEEN 0 AND 1),
  away_win numeric NOT NULL CHECK(away_win BETWEEN 0 AND 1), simulation_estimate boolean NOT NULL DEFAULT true CHECK(simulation_estimate),
  PRIMARY KEY(match_id,through_sequence,model_version),
  FOREIGN KEY(match_id,through_sequence) REFERENCES events(match_id,sequence),
  CHECK(abs(home_win + draw + away_win - 1) < 0.00001)
);
CREATE TABLE insights (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, match_id text NOT NULL, through_sequence integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('insight','catchup','halftime','fulltime')),
  audience text NOT NULL CHECK(audience IN ('casual','analyst')), language text NOT NULL,
  model_version text NOT NULL, body text NOT NULL, UNIQUE(id,match_id,through_sequence),
  FOREIGN KEY(match_id,through_sequence) REFERENCES events(match_id,sequence)
);
CREATE TABLE insight_evidence (
  insight_id bigint NOT NULL, match_id text NOT NULL, through_sequence integer NOT NULL, event_sequence integer NOT NULL,
  PRIMARY KEY(insight_id,event_sequence),
  FOREIGN KEY(insight_id,match_id,through_sequence) REFERENCES insights(id,match_id,through_sequence),
  FOREIGN KEY(match_id,event_sequence) REFERENCES events(match_id,sequence),
  CHECK(event_sequence <= through_sequence)
);
-- Generator metadata and labels are deliberately outside the replay schema.
CREATE SCHEMA simulation_private;
CREATE TABLE simulation_private.match_truth (
  match_id text PRIMARY KEY REFERENCES matches(id), seed integer NOT NULL, scenario text NOT NULL,
  home_strength real NOT NULL, away_strength real NOT NULL, final_home_score integer NOT NULL, final_away_score integer NOT NULL
);
-- Public views omit evaluation/training matches and all future outcomes/hidden attributes.
CREATE VIEW replay_matches AS
 SELECT m.id,m.home_team_id,m.away_team_id,m.duration_seconds,m.synthetic
 FROM matches m JOIN datasets d ON d.id=m.dataset_id WHERE d.split='showcase';
CREATE VIEW replay_events AS SELECT e.* FROM events e JOIN replay_matches m ON m.id=e.match_id;
CREATE VIEW replay_lineups AS SELECT l.* FROM lineups l JOIN replay_matches m ON m.id=l.match_id;
