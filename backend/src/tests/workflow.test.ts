import test from 'node:test';
import assert from 'node:assert/strict';
import {AIError} from '../ai/project.js';
import {checkDraft,checkVerdict,runInsightWorkflow} from '../ai/workflow.js';
import {evidencePacket} from '../ai/evidence.js';
const packet=evidencePacket({id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'},[{sequence:1,clock_seconds:10,period:1,type:'kickoff',team_id:'h',player_id:null,possession_id:1,outcome:null,home_score:0,away_score:0,details:{}}],1,'casual');
const draft=JSON.stringify({claims:[{factId:'score',text:'Home and Away are level at 0–0.',whyItMatters:'Neither team leads at this replay moment.'}]});
function fake(replies:string[]){const prompts:string[]=[];return {prompts,run:async<T>(input:string,_client:string,verify:(text:string)=>T)=>{prompts.push(input);const reply=replies.shift();if(!reply)throw new Error('Unexpected paid request');return {result:verify(reply),cached:false};}};}
const approved='{"accepted":true,"unsupportedClaimIds":[],"reason":"Supported by score evidence."}';
const rejected='{"accepted":false,"unsupportedClaimIds":["score"],"reason":"Unsupported causal statement."}';
test('narrative numeric/ID guards and contradictory verdicts fail closed',()=>{
 assert.throws(()=>checkDraft(draft.replace('0–0','9–0'),packet),{code:'AI_VERIFICATION_FAILED'});
 assert.throws(()=>checkDraft(draft.replace('"score"','"future-result"'),packet),{code:'AI_VERIFICATION_FAILED'});
 assert.throws(()=>checkVerdict('{"accepted":true,"unsupportedClaimIds":["score"],"reason":"bad"}'),{code:'AI_VERIFICATION_FAILED'});
});
test('orchestrator publishes only after separate narrative and verifier passes, retaining original evidence',async()=>{
 const agent=fake([draft,approved]);const answer=await runInsightWorkflow(agent,packet,'client');
 assert.equal(agent.prompts.length,2);assert.match(agent.prompts[0],/narrative agent/);assert.match(agent.prompts[1],/independent verifier/);
 assert.equal(answer.result.claims[0].sourceText,packet.facts[0].text);assert.equal(answer.result.verification.trace.length,4);
 assert.equal(answer.result.throughSequence,1);
});
test('a rejected claim is rewritten once and reverified; repeated rejection never exposes a draft',async()=>{
 const agent=fake([draft,rejected,draft,approved]);const answer=await runInsightWorkflow(agent,packet,'client');
 assert.equal(agent.prompts.length,4);assert.match(agent.prompts[2],/previous draft was rejected/);assert.equal(answer.result.verification.rewrites,1);
 const failed=fake([draft,rejected,draft,rejected]);await assert.rejects(runInsightWorkflow(failed,packet,'client'),{code:'AI_VERIFICATION_FAILED'});assert.equal(failed.prompts.length,4);
});
test('budget exhaustion in verification withholds the otherwise valid narrative',async()=>{
 const agent=fake([draft]);agent.run=async<T>(input:string,_c:string,verify:(s:string)=>T)=>{agent.prompts.push(input);if(agent.prompts.length===2)throw new AIError('AI_DAILY_LIMIT',429);return {result:verify(draft),cached:false};};
 await assert.rejects(runInsightWorkflow(agent,packet,'client'),{code:'AI_DAILY_LIMIT'});
});
test('JSONB key reordering cannot change the verifier prompt or add a paid review on cache reuse',async()=>{
 const first=fake([draft,approved]);await runInsightWorkflow(first,packet,'ip');
 const prompts:string[]=[],identities:string[]=[];
 const cachedAgent={run:async<T>(input:string,client:string,verify:(text:string)=>T,contract:string)=>{
  prompts.push(input);identities.push(client);
  if(contract.includes(':draft:')){const claim=JSON.parse(draft).claims[0];return {result:{claims:[{whyItMatters:claim.whyItMatters,text:claim.text,factId:claim.factId}]} as T,cached:true};}
  return {result:verify(approved),cached:true};
 }};
 const answer=await runInsightWorkflow(cachedAgent,packet,'ip');assert.equal(answer.cached,true);assert.equal(prompts[1],first.prompts[1]);assert.notEqual(identities[0],identities[1]);
});

test('rewritten results are not marked wholly cached when the earlier attempt needed inference',async()=>{
 const agent=fake([draft,rejected,draft,approved]),original=agent.run;
 agent.run=async<T>(input:string,client:string,verify:(text:string)=>T)=>{const result=await original(input,client,verify);return {...result,cached:agent.prompts.length>2};};
 const answer=await runInsightWorkflow(agent,packet,'test');assert.equal(answer.cached,false);assert.equal(answer.result.verification.rewrites,1);
});

test('equivalent decimal formatting is allowed, but changed numbers still fail the numeric guard',()=>{
 const p={...packet,facts:[{...packet.facts[0],id:'chances',text:'Synthetic xG 0.250.'}]};
 assert.ok(checkDraft('{"claims":[{"factId":"chances","text":"Synthetic xG is 0.25.","whyItMatters":""}]}',p));
 assert.throws(()=>checkDraft('{"claims":[{"factId":"chances","text":"Synthetic xG is 0.26.","whyItMatters":""}]}',p),{code:'AI_VERIFICATION_FAILED'});
});
