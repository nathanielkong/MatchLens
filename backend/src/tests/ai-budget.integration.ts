import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../db/connection.js';
const pool=connect(),db=await pool.connect();
try{
 await db.query('BEGIN');
 await db.query('SELECT pg_advisory_xact_lock(718045)');
 // Rolled back fixture isolates accounting tests from the user's live allowance.
 await db.query('DELETE FROM ai_runtime.requests');
 await db.query('UPDATE ai_runtime.policy SET enabled=true,requests_per_day=3,tokens_per_day=6000 WHERE id=true');
 await db.query('SET LOCAL ROLE matchlens_app');
 const reserve=async(id:string,key:string,client:string,tokens:number)=>db.query('SELECT ai_reserve($1,$2,$3,$4)',[id,key,client,tokens]);
 const rejects=async(fn:()=>Promise<unknown>,message:string)=>{await db.query('SAVEPOINT expected_failure');await assert.rejects(fn,new RegExp(message));await db.query('ROLLBACK TO SAVEPOINT expected_failure');};
 const first=randomUUID();await reserve(first,'test-first','ip1',1000);
 await rejects(()=>reserve(randomUUID(),'other','ip2',1000),'AI_BUSY');
 await db.query('SELECT ai_finish($1,300,$2)',[first,JSON.stringify({verified:true})]);
 assert.deepEqual((await db.query('SELECT ai_cached($1) AS result',['test-first'])).rows[0].result,{verified:true});
 const second=randomUUID();await reserve(second,'test-second','ip1',1000);await db.query('SELECT ai_finish($1,0,NULL)',[second]);
 await rejects(()=>reserve(randomUUID(),'third','ip1',1000),'AI_RATE_LIMIT');
 const third=randomUUID();await reserve(third,'test-third','ip2',1000);await db.query('SELECT ai_finish($1,0,NULL)',[third]);
 await rejects(()=>reserve(randomUUID(),'fourth','ip3',1000),'AI_DAILY_LIMIT');
 const usage=(await db.query('SELECT ai_usage() AS usage')).rows[0].usage;
 assert.equal(usage.requestsToday,3);assert.equal(usage.reservedTokensToday,3000);
 await rejects(()=>db.query('SELECT * FROM ai_runtime.requests'),'permission denied');
 await rejects(()=>db.query('SELECT * FROM simulation_private.match_truth'),'permission denied');
 await db.query('RESET ROLE');
 await db.query('DELETE FROM ai_runtime.requests');await db.query('UPDATE ai_runtime.policy SET enabled=false WHERE id=true');
 await db.query('SET LOCAL ROLE matchlens_app');await rejects(()=>reserve(randomUUID(),'disabled','ip',1),'AI_DISABLED');
 await db.query('RESET ROLE');await db.query('UPDATE ai_runtime.policy SET enabled=true,tokens_per_day=1000 WHERE id=true');
 await db.query('SET LOCAL ROLE matchlens_app');await rejects(()=>reserve(randomUUID(),'oversize','ip',1001),'AI_DAILY_LIMIT');
 console.log('Passed persistent AI reservations, concurrency gate, cache, per-client rate, global daily request/token ceilings, kill switch and role isolation. All fixture changes rolled back.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
