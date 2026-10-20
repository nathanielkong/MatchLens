-- A match with zero eligible anchors is a valid evaluation case, not missing data.
CREATE TABLE simulation_private.turning_point_reviews (
 match_id text NOT NULL REFERENCES matches(id),reference_version text NOT NULL,
 objective_anchors integer NOT NULL CHECK(objective_anchors>=0),
 tactical_candidates integer NOT NULL CHECK(tactical_candidates>=0),
 scope text NOT NULL DEFAULT 'objective goal/card anchors; tactical review pending',
 PRIMARY KEY(match_id,reference_version)
);
