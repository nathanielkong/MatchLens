import test from 'node:test';
import assert from 'node:assert/strict';
import {AIError,ProjectAgentClient,projectConfig,projectStatus,azureAgentTransport,type AgentTransport} from '../ai/project.js';
import type {BudgetStore} from '../ai/budget.js';
import {evidencePacket,evidencePrompt,verifySelection} from '../ai/evidence.js';
import type {ReplayEvent} from '../analytics/statistics.js';
const env={FOUNDRY_PROJECT_ENDPOINT:'https://test.services.ai.azure.com/api/projects/test',FOUNDRY_AGENT_NAME:'test-agent',FOUNDRY_AGENT_VERSION:'2',FOUNDRY_MODEL_DEPLOYMENT_NAME:'openai/gpt-6-luna',AI_ENABLED:'true'};
test('actual Azure SDK sends the pinned agent_reference and never a model key, conversation or invocation tools',async()=>{
 let calls=0;
 const transport=azureAgentTransport(projectConfig(env),{credential:{getToken:async()=>({token:'test-azure-access-token',expiresOnTimestamp:Date.now()+60000})},fetch:(async(url,init)=>{
  calls++;assert.equal(String(url),'https://test.services.ai.azure.com/api/projects/test/openai/v1/responses');
  const body=JSON.parse(String(init?.body));assert.deepEqual(body.agent_reference,{name:'test-agent',version:'2',type:'agent_reference'});
  for(const forbidden of ['agent','tools','tool_choice','conversation','previous_response_id','model'])assert.equal(body[forbidden],undefined);
  assert.equal(body.max_output_tokens,800);assert.equal(body.store,false);
  return Response.json({id:'test-response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'CONNECTED',annotations:[]}]}],usage:{input_tokens:5,output_tokens:2}});
 }) as typeof fetch});
 assert.deepEqual(await transport.generate('Reply CONNECTED',800),{text:'CONNECTED',inputTokens:5,outputTokens:2});assert.equal(calls,1);
});
function fixture(){
 const cache=new Map<string,unknown>();let used=0,finished=0,reserved=0;
 const budget:BudgetStore={async cached(k){return cache.get(k)??null;},async reserve(_id,_k,_c,tokens){if(used>=2)throw new Error('AI_DAILY_LIMIT');used++;reserved=tokens;},async finish(_id,_tokens,result){finished++;if(result!==null)cache.set(lastKey,result);}};
 let lastKey='';const reserve=budget.reserve;budget.reserve=async(id,k,c,t)=>{lastKey=k;await reserve(id,k,c,t);};
 let calls=0;const transport:AgentTransport={async definition(){return {kind:'prompt',model:env.FOUNDRY_MODEL_DEPLOYMENT_NAME};},async generate(){calls++;return {text:'CONNECTED',inputTokens:5,outputTokens:2};}};
 return {budget,transport,get calls(){return calls;},get used(){return used;},get finished(){return finished;},get reserved(){return reserved;}};
}
test('project route validates pinned agent settings and does not accept keys/resource endpoints as project configuration',()=>{
 assert.equal(projectConfig(env).version,'2');assert.equal(projectStatus(env).credentialsVerified,false);
 for(const endpoint of ['https://test.openai.azure.com','http://test.services.ai.azure.com/api/projects/test','https://test.services.ai.azure.com/api/projects/test?key=secret','https://evil.test/api/projects/test'])assert.throws(()=>projectConfig({...env,FOUNDRY_PROJECT_ENDPOINT:endpoint}));
 assert.throws(()=>projectConfig({...env,FOUNDRY_AGENT_VERSION:'latest'}));
});
test('disabled or tool-enabled agents make no paid call and no reservation',async()=>{
 const f=fixture();const disabled=new ProjectAgentClient({...projectConfig(env),enabled:false},f.budget,f.transport);
 await assert.rejects(disabled.run('test','local',x=>x,'test'),{code:'AI_DISABLED'});
 f.transport.definition=async()=>({kind:'prompt',model:env.FOUNDRY_MODEL_DEPLOYMENT_NAME,tools:[{type:'web_search'}]});
 await assert.rejects(new ProjectAgentClient(projectConfig(env),f.budget,f.transport).run('test','local',x=>x,'test'),{code:'AI_UNSAFE_AGENT_CONFIG'});
 assert.equal(f.calls,0);assert.equal(f.used,0);
});
test('verified cache survives client replacement and is scoped to input/cutoff/contract; failures stay charged and are not cached',async()=>{
 const f=fixture();const client=new ProjectAgentClient(projectConfig(env),f.budget,f.transport);
 assert.equal((await client.run('prefix 10','local',x=>({text:x}),'v1')).cached,false);
 assert.equal((await new ProjectAgentClient(projectConfig(env),f.budget,f.transport).run('prefix 10','local',x=>({text:x}),'v1')).cached,true);
 assert.equal(f.calls,1);assert.ok(f.reserved>=projectConfig(env).maxOutputTokens+4096);
 await assert.rejects(client.run('prefix 20','local',()=>{throw new AIError('AI_VERIFICATION_FAILED',422);},'v1'),{code:'AI_VERIFICATION_FAILED'});
 assert.equal(f.finished,2);assert.equal(f.used,2);
 await assert.rejects(client.run('prefix 20','local',x=>x,'v1'),{code:'AI_DAILY_LIMIT'});assert.equal(f.calls,2);
});
test('transport failures are not retried or exposed and oversized inputs never reserve budget',async()=>{
 const f=fixture();let attempts=0;f.transport.generate=async()=>{attempts++;throw new Error('credential-containing-provider-error');};
 const client=new ProjectAgentClient(projectConfig(env),f.budget,f.transport);
 await assert.rejects(client.run('test','local',x=>x,'v1'),e=>e instanceof AIError&&e.code==='AI_REQUEST_FAILED'&&!e.message.includes('credential'));
 assert.equal(attempts,1);assert.equal(f.finished,1);
 await assert.rejects(client.run('x'.repeat(28001),'local',x=>x,'v1'),{code:'AI_INPUT_LIMIT'});assert.equal(f.used,1);
});
const match={id:'test',home_team_id:'h',away_team_id:'a',home_team:'Home fictional',away_team:'Away fictional'};
const event=(sequence:number,type:string,outcome:string|null=null):ReplayEvent=>({sequence,clock_seconds:sequence*5,period:1,type,team_id:'h',player_id:null,possession_id:1,outcome,home_score:outcome==='goal'?1:0,away_score:0,details:{xg:.2,scenario:'HIDDEN_SCENARIO'}});
test('evidence packet cannot include future goals, hidden metadata or visual positions; pressures are grouped',()=>{
 const source=[event(1,'kickoff'),event(2,'pressure'),event(3,'pressure'),event(4,'shot','goal')];
 const early=evidencePacket(match,source,3,'analyst');
 assert.equal(early.throughSequence,3);assert.ok(early.facts.every(f=>f.evidenceSequences.every(n=>n<=3)));
 assert.ok(!evidencePrompt(early).includes('HIDDEN_SCENARIO'));assert.ok(!early.facts.some(f=>f.id==='latest-goal'));
 assert.match(early.facts.find(f=>f.id==='pressing')!.text,/Home fictional 1/);
 assert.ok(evidencePacket(match,source,4,'casual').facts.some(f=>f.id==='latest-goal'));
});
test('verifier rejects invented IDs, model prose, duplicate claims and malformed JSON; accepted output uses exact computed facts',()=>{
 const packet=evidencePacket(match,[event(1,'kickoff'),event(2,'shot')],2,'casual');
 for(const text of ['not json','{"factIds":["invented"]}','{"factIds":["score","score"]}','{"factIds":["score"],"text":"A made-up future winner"}'])assert.throws(()=>verifySelection(text,packet),{code:'AI_VERIFICATION_FAILED'});
 const verified=verifySelection('{"factIds":["chances"]}',packet);
 assert.equal(verified.claims[0].text,packet.facts.find(f=>f.id==='chances')!.text);assert.equal(verified.verification.accepted,true);
});
test('long-form drafts get a bounded response allowance; routing and review keep the smaller limit',async()=>{
 const f=fixture(),limits:number[]=[];f.transport.generate=async(_input,limit)=>{limits.push(limit);return {text:'CONNECTED',inputTokens:5,outputTokens:2};};
 const client=new ProjectAgentClient(projectConfig(env),f.budget,f.transport);
 await client.run('long draft','test',x=>x,'narrative-verification-v2:summary:draft:0');assert.equal(limits[0],6000);assert.ok(f.reserved>=6000+4096);
 await client.run('short review','test',x=>x,'narrative-verification-v2:summary:verdict:0');assert.equal(limits[1],800);
 assert.throws(()=>projectConfig({...env,AI_LONG_OUTPUT_TOKENS:'8001'}));
});
test('incomplete token-limited responses are identified and never returned as a successful answer',async()=>{
 let calls=0;const transport=azureAgentTransport(projectConfig(env),{credential:{getToken:async()=>({token:'test-token',expiresOnTimestamp:Date.now()+60000})},fetch:(async()=>{calls++;return Response.json({id:'incomplete',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[],usage:{input_tokens:20,output_tokens:800}});}) as typeof fetch});
 await assert.rejects(transport.generate('draft',800),{code:'AI_OUTPUT_LIMIT'});assert.equal(calls,1);
});
