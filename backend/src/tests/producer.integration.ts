import assert from 'node:assert/strict';import {connect} from '../db/connection.js';
const pool=connect(),db=await pool.connect();
try{await db.query('BEGIN');const e=(await db.query('SELECT * FROM replay_events ORDER BY match_id,sequence OFFSET 5 LIMIT 1')).rows[0];
 const doc={matchId:e.match_id,throughSequence:e.sequence,atSeconds:e.clock_seconds,audience:'casual',label:'Test recap',synthetic:true,publicationKind:'catchup',claims:[{id:'score',text:'Fixture only',sourceText:'Fixture source',evidenceSequences:[e.sequence],prefix:{fromSequence:1,throughSequence:e.sequence}}],verification:{accepted:true,version:'test',method:'Fixture; rolled back'}};
 await db.query('SET LOCAL ROLE matchlens_app');
 const publish=async(d:unknown)=>String((await db.query('SELECT publish_producer_document($1,$2) AS id',[JSON.stringify(d),'catchup'])).rows[0].id);
 const id=await publish(doc);assert.equal(await publish(doc),id);
 assert.equal((await db.query('SELECT 1 FROM replay_producer_feed WHERE id=$1 AND through_sequence<=$2',[id,e.sequence])).rowCount,1);
 assert.equal((await db.query('SELECT 1 FROM replay_producer_feed WHERE id=$1 AND through_sequence<=$2',[id,e.sequence-1])).rowCount,0);
 const reject=async(fn:()=>Promise<unknown>,pattern:RegExp)=>{await db.query('SAVEPOINT rejection');await assert.rejects(fn,pattern);await db.query('ROLLBACK TO SAVEPOINT rejection');};
 await reject(()=>publish({...doc,verification:{...doc.verification,accepted:false}}),/INVALID_PRODUCER_DOCUMENT/);
 await reject(()=>publish({...doc,claims:[{...doc.claims[0],evidenceSequences:[e.sequence+1]}]}),/INVALID_PRODUCER_EVIDENCE/);
 await reject(()=>publish({...doc,claims:[{...doc.claims[0],sourceText:undefined}]}),/INVALID_PRODUCER_EVIDENCE/);
 await reject(()=>db.query('SELECT publish_producer_document($1,$2)',[JSON.stringify({...doc,publicationKind:'fulltime'}),'fulltime']),/INVALID_PRODUCER_BOUNDARY/);
 await reject(()=>db.query('INSERT INTO insights DEFAULT VALUES'),/permission denied/);
 await reject(()=>db.query('SELECT * FROM simulation_private.turning_points'),/permission denied/);
 console.log('Producer publication, deduplication, cutoff filtering, rejected/future evidence and role isolation passed. Fixtures rolled back; no model calls.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
