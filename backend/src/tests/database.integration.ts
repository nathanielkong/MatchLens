import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import {groupPressing,type ReplayEvent} from '../analytics/statistics.js';
import {stateRoutes} from '../db/state.js';
import {connect} from '../db/connection.js';
const pool=connect(),db=await pool.connect(),id=`verification-${randomUUID()}`;
try{
 await db.query('BEGIN');
 await db.query("INSERT INTO datasets(id,split,generator_version,seed) VALUES($1,'showcase','test',0)",[id]);
 await db.query("INSERT INTO matches(id,dataset_id,home_team_id,away_team_id) VALUES($1,$1,'team-1','team-2')",[id]);
 for(const [sequence,clock,period,possession] of [[1,0,1,1],[2,3,1,1],[3,20,1,1],[4,22,1,2],[5,2800,2,2]]){
  await db.query(`INSERT INTO events(match_id,sequence,clock_seconds,period,type,team_id,possession_id,home_score,away_score)
   VALUES($1,$2,$3,$4,'pressure','team-2',$5,0,0)`,[id,sequence,clock,period,possession]);
 }
 await db.query(`INSERT INTO events(match_id,sequence,clock_seconds,period,type,team_id,possession_id,outcome,home_score,away_score,details)
  VALUES($1,6,2801,2,'shot','team-1',3,'goal',1,0,'{"xg":0.25}')`,[id]);
 await db.query(`INSERT INTO tracking_frames(match_id,through_sequence,clock_seconds,period,ball,positions)
  VALUES($1,2,3,1,'{"x":20,"y":30}','[]'),($1,6,2801,2,'{"x":90,"y":30}','[]')`,[id]);
 await db.query('SET LOCAL ROLE matchlens_app');
 assert.equal((await db.query('SELECT * FROM replay_pressing_sequences($1,0)',[id])).rowCount,0);
 const prefix=(await db.query('SELECT * FROM replay_pressing_sequences($1,1)',[id])).rows;
 assert.equal(prefix.length,1);assert.equal(prefix[0].last_sequence,1);assert.equal(prefix[0].raw_pressure_records,1);
 const grouped=(await db.query('SELECT * FROM replay_pressing_sequences($1,5)',[id])).rows;
 assert.equal(grouped.length,4);assert.equal(grouped[0].raw_pressure_records,2);
 for(const table of ['simulation_private.turning_point_reviews','simulation_private.turning_points','simulation_private.turning_point_evidence','simulation_private.match_truth','insight_verifications','events']){
  await db.query('SAVEPOINT privilege_check');
  await assert.rejects(db.query(`SELECT * FROM ${table} LIMIT 1`),{code:'42501'});
  await db.query('ROLLBACK TO SAVEPOINT privilege_check');
 }
 // Production uses a pool; serialize the transaction-bound test client's reads.
 let queryCount=0;
 let queryQueue:Promise<unknown>=Promise.resolve();
 const query=((...args:unknown[])=>{
  queryCount++;const result=queryQueue.then(()=>Reflect.apply(db.query,db,args));
  queryQueue=result.catch(()=>undefined);return result;
 }) as typeof db.query;
 const eventPrefix=(await db.query<ReplayEvent>('SELECT * FROM replay_events WHERE match_id=$1 AND sequence<=5 ORDER BY sequence',[id])).rows;
 assert.deepEqual(groupPressing(eventPrefix),grouped.map(g=>({team_id:g.team_id,start_sequence:g.start_sequence,last_sequence:g.last_sequence,raw_pressure_records:g.raw_pressure_records})));
 const app=express();app.use('/matches',stateRoutes({query}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}/matches`;
  const early=await (await fetch(`${base}/${id}/state?atSeconds=3`)).json();
  assert.equal(early.throughSequence,2);assert.equal(early.statistics.score.home,0);
  assert.equal(early.events.length,2);assert.equal(early.keyEvents.length,0);assert.equal(early.frame.through_sequence,2);
  assert.equal(early.statistics.teams[1].pressingSequences,1);
  const exact=await (await fetch(`${base}/${id}/state?throughSequence=1`)).json();
  assert.equal(exact.throughSequence,1);assert.equal(exact.frame,null);
  const goal=await (await fetch(`${base}/${id}/state?atSeconds=2801`)).json();
  assert.equal(goal.keyEvents[0].sequence,6);assert.equal(goal.statistics.score.home,1);assert.equal(goal.statistics.teams[0].xg,.25);
  for(const query of ['', '?atSeconds=2&throughSequence=1','?atSeconds=-1','?atSeconds=0.5'])
   assert.equal((await fetch(`${base}/${id}/state${query}`)).status,400);
  const visual=await (await fetch(`${base}/${id}/visual-replay`)).json();
  assert.equal(visual.purpose,'visual-only');assert.equal(visual.containsFutureSamples,true);assert.equal(visual.frames.length,2);
  assert.equal(visual.frames[1].through_sequence,6);
  assert.equal(visual.events[0].home_score,undefined);assert.equal(visual.events[0].details.xg,undefined);
  const rewind=await (await fetch(`${base}/${id}/state?atSeconds=3&includeFrame=false`)).json();
  assert.equal(rewind.frame,null);assert.equal(rewind.statistics.score.home,0);assert.equal(rewind.throughSequence,2);
  assert.deepEqual(rewind.probabilities,early.probabilities);
  assert.ok(rewind.probabilities.history.every((p:{time:number;sequence:number})=>p.time<=3&&p.sequence<=rewind.throughSequence));
  assert.ok(goal.probabilities.current.home>early.probabilities.current.home);
  assert.equal(queryCount,3,'Repeated evidence and visual requests reuse the bounded replay cache');
  assert.equal((await fetch(`${base}/missing/state?atSeconds=0`)).status,404);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 await db.query('RESET ROLE');
 const insight=(await db.query(`INSERT INTO insights(match_id,through_sequence,kind,audience,language,model_version,body)
  VALUES($1,2,'talking_point','analyst','en','test','Two pressure observations in one sequence') RETURNING id`,[id])).rows[0].id;
 await db.query(`INSERT INTO insight_verifications(insight_id,match_id,through_sequence,verifier_version,verdict,report)
  VALUES($1,$2,2,'test','accepted','{}')`,[insight,id]);
 await db.query('SET LOCAL ROLE matchlens_app');
 assert.equal((await db.query('SELECT * FROM replay_producer_feed WHERE match_id=$1',[id])).rowCount,0);
 await db.query('RESET ROLE');
 await db.query('SAVEPOINT future_evidence');
 await assert.rejects(db.query('INSERT INTO insight_evidence VALUES($1,$2,2,3)',[insight,id]),{code:'23514'});
 await db.query('ROLLBACK TO SAVEPOINT future_evidence');
 await db.query('INSERT INTO insight_evidence VALUES($1,$2,2,1)',[insight,id]);
 await db.query('SET LOCAL ROLE matchlens_app');
 assert.equal((await db.query('SELECT * FROM replay_producer_feed WHERE match_id=$1 AND through_sequence<=1',[id])).rowCount,0);
 assert.equal((await db.query('SELECT * FROM replay_producer_feed WHERE match_id=$1 AND through_sequence<=2',[id])).rowCount,1);
 await db.query('RESET ROLE');
 await db.query(`INSERT INTO insight_verifications(insight_id,match_id,through_sequence,verifier_version,verdict,report)
  VALUES($1,$2,2,'test','rewrite','{}')`,[insight,id]);
 await db.query('SET LOCAL ROLE matchlens_app');
 assert.equal((await db.query('SELECT * FROM replay_producer_feed WHERE match_id=$1',[id])).rowCount,0);
 console.log('Passed: pressing deduplication/gap/possession/period, replay cutoff, private access, producer evidence/verification/rewrite. Match-state HTTP cutoffs and validation passed. Fixtures rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
