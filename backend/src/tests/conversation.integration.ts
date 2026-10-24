import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../db/connection.js';
import {postgresConversationStore} from '../ai/conversation-db.js';
const pool=connect(),db=await pool.connect();
try{
 await db.query('BEGIN');
 const event=(await db.query('SELECT match_id,sequence FROM replay_events ORDER BY match_id,sequence OFFSET 3 LIMIT 1')).rows[0];
 const scope={matchId:event.match_id,audience:'casual',throughSequence:event.sequence,owner:randomUUID()};
 const context={question:'What is recorded?',answer:'A bounded fixture.',throughSequence:event.sequence,factIds:['score'],playerIds:[],eventSequences:[event.sequence]};
 await db.query('SET LOCAL ROLE matchlens_app');
 const id=await postgresConversationStore(db as never).remember(scope,context);
 const restarted=postgresConversationStore(db as never);
 assert.deepEqual((await restarted.read([id],scope)).context,[context]);
 for(const changed of [{owner:'other'},{audience:'analyst'},{throughSequence:1},{matchId:'other'}])assert.deepEqual(await restarted.read([id],{...scope,...changed}),{context:[],reset:true});
 const rejects=async(action:()=>Promise<unknown>)=>{await db.query('SAVEPOINT rejection');await assert.rejects(action);await db.query('ROLLBACK TO SAVEPOINT rejection');};
 await rejects(()=>db.query('SELECT * FROM ai_runtime.conversations'));
 await rejects(()=>db.query('SELECT ai_conversation_save($1,$2,$3,$4,$5,$6)',[randomUUID(),'a'.repeat(64),scope.matchId,'casual',scope.throughSequence,JSON.stringify({...context,eventSequences:[scope.throughSequence+1]})]));
 await db.query('RESET ROLE');
 await db.query("UPDATE ai_runtime.conversations SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 await db.query('SET LOCAL ROLE matchlens_app');
 assert.deepEqual(await restarted.read([id],scope),{context:[],reset:true});
 console.log('Live PostgreSQL chat persistence, store replacement, owner/audience/cutoff isolation, expiry and role permissions passed. Fixtures rolled back; no model calls.');
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
