import assert from 'node:assert/strict';
import {connect} from '../db/connection.js';
import {replayStore} from '../db/replay-store.js';
import {matchDetails} from '../analytics/match-details.js';
import {loadEvidencePacket} from '../ai/service.js';
const admin=connect(),app=connect('app');
try{
 const audit=(await admin.query(`WITH ordered AS (
 SELECT e.*,m.home_team_id,m.duration_seconds,lag(e.clock_seconds) OVER w AS previous_clock,
 row_number() OVER w AS expected_sequence,
 sum(CASE WHEN e.type='shot' AND e.outcome='goal' AND e.team_id=m.home_team_id THEN 1 ELSE 0 END) OVER w AS expected_home,
 sum(CASE WHEN e.type='shot' AND e.outcome='goal' AND e.team_id=m.away_team_id THEN 1 ELSE 0 END) OVER w AS expected_away
 FROM events e JOIN matches m ON m.id=e.match_id JOIN datasets d ON d.id=m.dataset_id WHERE d.active
 WINDOW w AS (PARTITION BY e.match_id ORDER BY e.sequence ROWS UNBOUNDED PRECEDING)
 ),checks AS (SELECT match_id,count(*)::int AS events,min(clock_seconds) AS first_clock,max(clock_seconds) AS last_clock,
 max(duration_seconds) AS duration,count(*) FILTER(WHERE type='halftime') AS halves,count(*) FILTER(WHERE type='fulltime') AS finishes,
 count(*) FILTER(WHERE sequence<>expected_sequence OR clock_seconds<previous_clock OR home_score<>expected_home OR away_score<>expected_away) AS bad,
 (array_agg(type ORDER BY sequence))[1] AS first_type,(array_agg(type ORDER BY sequence DESC))[1] AS last_type
 FROM ordered GROUP BY match_id)
 SELECT count(*)::int AS matches,sum(events)::int AS events,min(duration)::int AS shortest,max(duration)::int AS longest,
 count(*) FILTER(WHERE bad<>0 OR first_clock<>0 OR first_type<>'kickoff' OR last_type<>'fulltime' OR halves<>1 OR finishes<>1 OR last_clock<>duration OR duration<5400) AS invalid FROM checks`)).rows[0];
 assert.equal(Number(audit.invalid),0);assert.equal(audit.matches,1516);
 const rosters=(await admin.query(`SELECT l.match_id,l.team_id,count(*)::int AS players,count(*) FILTER(WHERE starter)::int AS starters FROM lineups l JOIN matches m ON m.id=l.match_id JOIN datasets d ON d.id=m.dataset_id WHERE d.active GROUP BY l.match_id,l.team_id`)).rows;
 assert.equal(rosters.length,3032);assert.ok(rosters.every(r=>r.players===20&&r.starters===11));
 const matches=(await app.query('SELECT id FROM replay_matches ORDER BY id')).rows,load=replayStore(app);let cutoffs=0;
 for(const m of matches){const replay=(await load(m.id))!,end=replay.events.at(-1)!,half=replay.events.find(e=>e.type==='halftime')!;
  for(const cutoff of [1,half.sequence,replay.events.filter(e=>e.clock_seconds<=5400).at(-1)!.sequence,end.sequence]){
   const detail=matchDetails(replay.events,[replay.match.home_team_id,replay.match.away_team_id],replay.players,cutoff),prefix=replay.events.filter(e=>e.sequence<=cutoff);
   assert.deepEqual(detail,matchDetails(prefix,[replay.match.home_team_id,replay.match.away_team_id],replay.players,cutoff));
   assert.equal(detail.eventCount,prefix.length);assert.equal(detail.fulltime,cutoff===end.sequence);
   for(const t of detail.teams){const ps=detail.players.filter(p=>p.teamId===t.teamId);for(const key of ['shots','goals','completedPasses','passes','saves','interceptions','tackles'] as const)assert.equal(ps.reduce((n,p)=>n+p[key],0),t[key],`${m.id} ${key} player/team totals`);}
   const {packet}=await loadEvidencePacket(app,m.id,cutoff,'analyst','What happened in the last 10 minutes?');assert.ok(packet.facts.every(f=>f.evidenceSequences.length>0&&f.evidenceSequences.every(n=>n<=cutoff)));assert.ok(packet.facts.some(f=>f.id==='coverage'));cutoffs++;
  }
 }
 console.log(JSON.stringify({audit,lineups:{teamRosters:rosters.length,playersPerTeam:20,startersPerTeam:11},showcaseMatches:matches.length,detailCutoffsChecked:cutoffs,checks:'Contiguous full-match clocks and goal scores, both halves, complete rosters, additive player/team records and no future evidence. No model calls.'}));
}finally{await admin.end();await app.end();}
