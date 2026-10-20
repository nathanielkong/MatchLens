import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from '../db/connection.js';
import {teams,datasetPlans,VERSION} from './catalog.js';
const pool=connect(),client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(718042)');
 for(const t of teams) await client.query(`UPDATE teams SET name=$2,
  metadata=metadata || $3::jsonb WHERE id=$1`,[t.id,t.name,JSON.stringify({color:t.color,fictional:true,badge:null,brandingVersion:'original-labels-v1'})]);
 // Only objective score/discipline anchors are scoring references. Tactical changes
 // remain candidates until reviewed; they are not automatically important moments.
 await client.query(`INSERT INTO simulation_private.turning_points
  SELECT e.match_id,e.sequence,'anchors-v1',CASE WHEN e.type='shot' THEN 'goal' ELSE e.type END,
   e.team_id,greatest(0,e.clock_seconds-30),e.clock_seconds+30,
   CASE WHEN e.type='shot' THEN 'Goal: score becomes '||e.home_score||'-'||e.away_score
    WHEN e.type='red_card' THEN 'Red card for '||e.player_id
    ELSE 'Tactical change: '||e.details::text END,
   'Event-derived reference; independent of future insight detector',
   CASE WHEN e.type='tactic_change' THEN 'candidate' ELSE 'objective_anchor' END
  FROM replay_events e WHERE (e.type='shot' AND e.outcome='goal')
   OR e.type IN ('red_card','tactic_change') ON CONFLICT DO NOTHING`);
 await client.query(`INSERT INTO simulation_private.turning_point_evidence
  SELECT match_id,event_sequence,reference_version,event_sequence
  FROM simulation_private.turning_points ON CONFLICT DO NOTHING`);
 await client.query(`INSERT INTO simulation_private.turning_point_reviews(match_id,reference_version,objective_anchors,tactical_candidates)
  SELECT m.id,'anchors-v1',count(t.event_sequence) FILTER(WHERE t.review_status='objective_anchor'),
   count(t.event_sequence) FILTER(WHERE t.review_status='candidate')
  FROM replay_matches m LEFT JOIN simulation_private.turning_points t ON t.match_id=m.id AND t.reference_version='anchors-v1'
  GROUP BY m.id ON CONFLICT(match_id,reference_version) DO UPDATE SET
   objective_anchors=EXCLUDED.objective_anchors,tactical_candidates=EXCLUDED.tactical_candidates`);
 await client.query('COMMIT');
 const match=(await client.query('SELECT * FROM replay_matches ORDER BY id LIMIT 1')).rows[0];
 if(!match)throw new Error('Seed showcase matches before finalising');
 const events=(await client.query('SELECT * FROM replay_events WHERE match_id=$1 AND sequence<=100 ORDER BY sequence',[match.id])).rows;
 const lineups=(await client.query('SELECT * FROM replay_lineups WHERE match_id=$1 ORDER BY team_id,player_id',[match.id])).rows;
 const players=(await client.query('SELECT p.* FROM players p JOIN replay_lineups l ON l.player_id=p.id WHERE l.match_id=$1 ORDER BY p.id',[match.id])).rows;
 const publicTeams=(await client.query('SELECT * FROM teams WHERE id=ANY($1) ORDER BY id',[[match.home_team_id,match.away_team_id]])).rows;
 const frames=(await client.query('SELECT * FROM replay_tracking WHERE match_id=$1 AND through_sequence<=100 ORDER BY through_sequence LIMIT 2',[match.id])).rows;
 const sample={formatVersion:1,generatorVersion:VERSION,synthetic:true,partialReplay:true,throughSequence:100,
  limitations:['Not a full match','No private labels or final outcomes included'],match,teams:publicTeams,players,lineups,events,frames};
 const dir=new URL('../../../samples/',import.meta.url);await mkdir(dir,{recursive:true});
 await writeFile(new URL('showcase-prefix.json',dir),JSON.stringify(sample,null,2)+'\n');
 await writeFile(new URL('fixed-seeds.json',dir),JSON.stringify({generatorVersion:VERSION,plans:datasetPlans,
  matchSeed:'plan.seed + zero-based match index',selectionSeed:'match seed + 10000000',
  abilitySeed:'710000 + zero-based player index'},null,2)+'\n');
 const {rows}=await client.query(`SELECT kind,review_status,count(*)::int AS references
  FROM simulation_private.turning_points GROUP BY kind,review_status ORDER BY kind`);
 console.log(JSON.stringify({references:rows,sampleEvents:events.length,sampleFrames:frames.length}));
} catch(error){await client.query('ROLLBACK');throw error;}
finally {client.release();await pool.end();}
