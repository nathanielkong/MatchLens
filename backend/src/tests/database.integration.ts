import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
 console.log('Passed: pressing deduplication/gap/possession/period, replay cutoff, private access, producer evidence/verification/rewrite. Fixtures rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
