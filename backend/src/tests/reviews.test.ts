import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedWorkflow} from '../ai/reviews.js';
import {AIError} from '../ai/project.js';
import {evidencePacket} from '../ai/evidence.js';
const packet=evidencePacket({id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'},[{sequence:1,clock_seconds:10,period:1,type:'kickoff',team_id:'h',player_id:null,possession_id:1,outcome:null,home_score:0,away_score:0,details:{}}],1,'casual');
const draft=JSON.stringify({claims:[{factId:'score',text:'Home and Away are level at 0–0.',whyItMatters:'Neither leads at this moment.'}]}),pass='{"accepted":true,"unsupportedClaimIds":[],"reason":"ok"}',reject='{"accepted":false,"unsupportedClaimIds":["score"],"reason":"private rejected feedback"}';
function harness(replies:(string|Error)[],cached=false){
 const rows:unknown[][]=[],prompts:string[]=[];
 const db={query:async(_sql:string,args:unknown[])=>{rows.push(args);return {rows:[]};}};
 const agent={run:async<T>(prompt:string,_client:string,check:(raw:string)=>T)=>{prompts.push(prompt);const reply=replies.shift();if(reply instanceof Error)throw reply;if(!reply)throw new Error('Unexpected inference');return {result:check(reply),cached};}};
 return {db:db as never,agent,rows,prompts};
}
test('review records are scoped, bounded metadata; supported tasks pass only after review',async()=>{
 for(const task of ['summary','talking_point','recap'] as const){
  const h=harness([draft,pass]);const result=await reviewedWorkflow(h.db,h.agent,packet,'private-client',undefined,task);
  assert.equal(h.rows.length,1);const row=h.rows[0];assert.equal(row[1],'fixture');assert.equal(row[2],1);assert.equal(row[3],'casual');assert.equal(row[4],task);assert.equal(row[5],'passed');assert.equal(row[7],false);assert.equal(row[0],result.reviewId);
  const checks=JSON.parse(row[8] as string);assert.deepEqual(checks.map((c:{stage:string})=>c.stage),['draft','review']);assert.deepEqual(checks[1].factIds,['score']);
  assert.ok(!JSON.stringify(row).includes('Neither leads'));assert.ok(!JSON.stringify(row).includes('private-client'));
 }
});
test('rewrite and repeated rejection have distinct outcomes and never persist rejected prose',async()=>{
 const revised=harness([draft,reject,draft,pass]);await reviewedWorkflow(revised.db,revised.agent,packet,'test');
 assert.equal(revised.rows[0][5],'revised');assert.equal(JSON.parse(revised.rows[0][8] as string).at(-1).attempt,2);
 const failed=harness([draft,reject,draft,reject]);await assert.rejects(reviewedWorkflow(failed.db,failed.agent,packet,'test'),{code:'AI_VERIFICATION_FAILED'});
 assert.equal(failed.rows[0][5],'withheld');assert.equal(failed.prompts.length,4);assert.ok(!JSON.stringify(failed.rows).includes('private rejected feedback'));
});
test('invalid numbers are withheld before a model reviewer can accept them',async()=>{
 const h=harness([draft.replace('0–0','9–0'),draft.replace('0–0','9–0')]);await assert.rejects(reviewedWorkflow(h.db,h.agent,packet,'test'),{code:'AI_VERIFICATION_FAILED'});
 assert.equal(h.prompts.length,2);assert.equal(h.rows[0][5],'withheld');assert.deepEqual(JSON.parse(h.rows[0][8] as string),[{attempt:1,stage:'draft',outcome:'rejected',factIds:[]},{attempt:2,stage:'draft',outcome:'rejected',factIds:[]}]);
});
test('unsupported questions differ from failures and the user question is not saved',async()=>{
 const h=harness(['{"factIds":[]}']);const answer=await reviewedWorkflow(h.db,h.agent,packet,'test','Who will win?');
 assert.equal(answer.result.verification.accepted,false);assert.equal(h.rows[0][4],'question');assert.equal(h.rows[0][5],'unsupported');assert.equal(h.prompts.length,1);assert.ok(!JSON.stringify(h.rows).includes('Who will win'));
});
test('blocked, malformed and provider failures never become passed reviews or expose raw errors',async()=>{
 for(const error of [new AIError('AI_DAILY_LIMIT',429),new AIError('AI_REQUEST_FAILED',503,new Error('credential-secret'))]){
  const h=harness([draft,error]);await assert.rejects(reviewedWorkflow(h.db,h.agent,packet,'test'),{code:error.code});assert.equal(h.rows[0][5],'unavailable');assert.equal(JSON.parse(h.rows[0][8] as string).at(-1).outcome,'unavailable');assert.ok(!JSON.stringify(h.rows).includes('credential-secret'));
 }
 const bad=harness([draft,'{"accepted":false,"unsupportedClaimIds":["invented-secret-id"],"reason":"bad"}']);await assert.rejects(reviewedWorkflow(bad.db,bad.agent,packet,'test'),{code:'AI_VERIFICATION_FAILED'});assert.equal(bad.rows[0][5],'withheld');assert.ok(!JSON.stringify(bad.rows).includes('invented-secret-id'));
});
test('cache reuse is labelled; audit storage failure withholds a successful answer',async()=>{
 const h=harness([draft,pass],true);await reviewedWorkflow(h.db,h.agent,packet,'test');assert.equal(h.rows[0][7],true);
 const broken=harness([draft,pass]);await assert.rejects(reviewedWorkflow({query:async()=>{throw new Error('database-secret');}} as never,broken.agent,packet,'test'),{code:'AI_REVIEW_LOG_UNAVAILABLE'});
});
