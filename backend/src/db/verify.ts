import assert from 'node:assert/strict';
import {connect} from './connection.js';
import {datasetPlans,VERSION} from '../synthetic/catalog.js';
const admin=connect(),app=connect('app');
try{
 const counts=await admin.query(`SELECT d.split,count(DISTINCT m.id)::int AS matches,count(e.sequence)::int AS events
 FROM datasets d JOIN matches m ON m.dataset_id=d.id JOIN events e ON e.match_id=m.id WHERE d.active AND d.generator_version=$1 GROUP BY d.split ORDER BY d.split`,[VERSION]);
 assert.deepEqual(counts.rows.map(r=>[r.split,r.matches]),[...datasetPlans].sort((a,b)=>a.split.localeCompare(b.split)).map(p=>[p.split,p.count]));
 assert.equal((await app.query('SELECT count(*)::int AS n FROM replay_matches')).rows[0].n,16);
 for(const table of ['simulation_private.turning_point_reviews','simulation_private.turning_points','simulation_private.turning_point_evidence','simulation_private.match_truth','simulation_private.player_attributes','simulation_private.team_parameters','matches','events','datasets','tracking_frames','dataset_quality_reports']){
  await assert.rejects(app.query(`SELECT * FROM ${table} LIMIT 1`),(e:unknown)=>(e as {code:string}).code==='42501');
 }
 const broken=await admin.query(`SELECT m.id FROM matches m JOIN simulation_private.match_truth t ON t.match_id=m.id
 JOIN LATERAL(SELECT home_score,away_score,clock_seconds,type FROM events WHERE match_id=m.id ORDER BY sequence DESC LIMIT 1)e ON true
 WHERE e.home_score<>t.final_home_score OR e.away_score<>t.final_away_score OR e.clock_seconds<>m.duration_seconds OR e.type<>'fulltime'`);
 assert.equal(broken.rowCount,0);
 const duplicateSeeds=await admin.query(`SELECT t.seed FROM simulation_private.match_truth t JOIN matches m ON m.id=t.match_id JOIN datasets d ON d.id=m.dataset_id WHERE d.active GROUP BY t.seed HAVING count(*)>1`);assert.equal(duplicateSeeds.rowCount,0);
 const tracking=await admin.query(`SELECT count(*)::int frames FROM tracking_frames f JOIN matches m ON m.id=f.match_id JOIN datasets d ON d.id=m.dataset_id WHERE d.active`);
 assert.ok(tracking.rows[0].frames>250000);
 const coverage=await admin.query(`SELECT e.type,count(*)::int AS events FROM events e JOIN matches m ON m.id=e.match_id JOIN datasets d ON d.id=m.dataset_id WHERE d.active GROUP BY e.type ORDER BY e.type`);
 for(const type of ['save','pressure','block','recovery','corner','goal_kick','throw_in','yellow_card','tactic_change'])assert.ok(coverage.rows.some(r=>r.type===type&&r.events>0));
 const references=await admin.query(`SELECT count(DISTINCT match_id)::int AS matches FROM simulation_private.turning_point_reviews`);
 assert.equal(references.rows[0].matches,16);
 assert.equal((await app.query("SELECT has_table_privilege(current_user,'public.insight_verifications','SELECT') AS allowed")).rows[0].allowed,false);
 const reports=await admin.query('SELECT dataset_id,summary FROM dataset_quality_reports ORDER BY dataset_id');
 assert.equal(reports.rowCount,4);
 console.table(counts.rows);console.table(coverage.rows);console.log(`Tracking frames: ${tracking.rows[0].frames}`);
 console.log('Verified active datasets, separate seeds, results, event coverage and restricted replay access.');
}finally{await admin.end();await app.end();}
