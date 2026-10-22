import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../db/connection.js';
const pool=connect(),db=await pool.connect();
try{
 await db.query('BEGIN');
 const events=(await db.query('SELECT match_id,sequence FROM replay_events ORDER BY match_id,sequence LIMIT 3')).rows;
 const first=events[0],later=events[2],ids:string[]=[];
 await db.query('SET LOCAL ROLE matchlens_app');
 const checks=[{attempt:1,stage:'draft',outcome:'passed',factIds:['score']},{attempt:1,stage:'review',outcome:'passed',factIds:['score']}];
 const record=async(seq:number,audience='casual',outcome='passed',steps:unknown=checks,match=first.match_id)=>{const id=randomUUID();await db.query('SELECT ai_record_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,match,seq,audience,'summary',outcome,100,false,JSON.stringify(steps)]);ids.push(id);return id;};
 const earlyId=await record(first.sequence),laterId=await record(later.sequence),analystId=await record(later.sequence,'analyst');
 const history=async(seq:number,audience='casual')=>(await db.query('SELECT * FROM ai_review_history($1,$2,$3)',[first.match_id,seq,audience])).rows;
 assert.ok((await history(later.sequence)).some(r=>r.id===laterId));
 const rewind=await history(first.sequence);assert.ok(rewind.some(r=>r.id===earlyId));assert.ok(rewind.every(r=>r.through_sequence<=first.sequence&&r.audience==='casual'));assert.ok(!rewind.some(r=>r.id===laterId||r.id===analystId));
 assert.deepEqual(await history(0),[]);
 const expanded=checks.map(c=>({...c,factIds:['score','chances','tactics','substitutions','players','formations','phases','change-windows','player-details','goalkeepers','time-window','lineups']}));await record(first.sequence,'casual','passed',expanded);
 const tactical=checks.map(c=>({...c,factIds:['tactical-context','substitution-impact']}));await record(first.sequence,'casual','passed',tactical);
 const rejected=[{attempt:1,stage:'review',outcome:'rejected',factIds:['score']}];await record(first.sequence,'casual','withheld',rejected);
 const reject=async(fn:()=>Promise<unknown>,pattern:RegExp)=>{await db.query('SAVEPOINT rejected');await assert.rejects(fn,pattern);await db.query('ROLLBACK TO SAVEPOINT rejected');};
 await reject(()=>record(99999),/INVALID_REVIEW_CUTOFF/);
 await reject(()=>record(first.sequence,'casual','passed',rejected),/INVALID_REVIEW_VERDICT/);
 await reject(()=>record(first.sequence,'casual','revised',checks),/INVALID_REVIEW_VERDICT/);
 await reject(()=>record(first.sequence,'casual','passed',[{...checks[0],text:'rejected prose'}]),/INVALID_REVIEW_CHECKS/);
 await reject(()=>record(first.sequence,'casual','withheld',[{...checks[0],factIds:['hidden-label']}]),/INVALID_REVIEW_CHECKS/);
 await reject(()=>db.query('SELECT * FROM ai_runtime.reviews'),/permission denied/);
 await reject(()=>db.query('SELECT * FROM ai_runtime.requests'),/permission denied/);
 await reject(()=>db.query('SELECT * FROM simulation_private.match_truth'),/permission denied/);
 await db.query('RESET ROLE');
 // Start a local test API using this transaction. No model calls; tests leave no rows.
 const express=(await import('express')).default,{aiRoutes}=await import('../ai/routes.js'),app=express();app.use('/api',aiRoutes(db as never));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/matches/${first.match_id}/reviews`;
  for(const query of ['','?throughSequence=-1','?throughSequence=1&audience=other','?throughSequence=1&extra=x'])assert.equal((await fetch(url+query)).status,400);
  const response=await fetch(url+`?throughSequence=${first.sequence}`);assert.equal(response.status,200);const body=await response.json();assert.ok(body.reviews.every((r:{through_sequence:number;audience:string})=>r.through_sequence<=first.sequence&&r.audience==='casual'));
  assert.equal((await fetch(url.replace(first.match_id,'missing')+'?throughSequence=1')).status,404);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 console.log('Review history: persisted outcomes, cutoff rewinds, audience isolation, metadata-only validation, HTTP validation and restricted app permissions passed. Fixtures rolled back; no model calls.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
