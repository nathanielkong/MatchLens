import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {postgresConversationStore} from '../ai/conversation-db.js';
test('real PostgreSQL conversation functions survive store replacement and enforce owner, audience, cutoff, expiry and table permissions',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE SCHEMA ai_runtime; CREATE ROLE matchlens_app; CREATE TABLE events(match_id text,sequence integer,PRIMARY KEY(match_id,sequence)); CREATE VIEW replay_events AS SELECT * FROM events; INSERT INTO events VALUES('match',1),('match',2),('match',3);");
  await db.exec(await readFile(new URL('../db/013-conversation-sessions.sql',import.meta.url),'utf8'));
  const store=postgresConversationStore(db as never),scope={matchId:'match',audience:'casual',throughSequence:2,owner:'session-one'},context={question:'Who scored?',answer:'Player One.',throughSequence:2,factIds:['goals'],playerIds:['one'],eventSequences:[2]};
  await db.exec('SET ROLE matchlens_app');
  const id=await store.remember(scope,context),restarted=postgresConversationStore(db as never);
  assert.deepEqual((await restarted.read([id],scope)).context,[context]);
  for(const changed of [{owner:'other'},{audience:'analyst'},{throughSequence:1},{matchId:'other'}])assert.deepEqual(await restarted.read([id],{...scope,...changed}),{context:[],reset:true});
  await assert.rejects(db.query('SELECT * FROM ai_runtime.conversations'));
  await assert.rejects(store.remember({...scope,throughSequence:99},{...context,throughSequence:99}));
  await assert.rejects(db.query('SELECT ai_conversation_save($1,$2,$3,$4,$5,$6)',['00000000-0000-0000-0000-000000000001','a'.repeat(64),'match','casual',2,JSON.stringify({...context,eventSequences:[3]})]));
  await db.exec('RESET ROLE');await db.exec("UPDATE ai_runtime.conversations SET expires_at=now()-interval '1 second'");await db.exec('SET ROLE matchlens_app');
  assert.deepEqual(await restarted.read([id],scope),{context:[],reset:true});
 }finally{await db.close();}
});
