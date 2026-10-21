import test from 'node:test';import assert from 'node:assert/strict';
import {parseProducerDocument,recapMarkdown} from '../producer/documents.js';
import {runInsightWorkflow} from '../ai/workflow.js';import {evidencePacket} from '../ai/evidence.js';
const packet=evidencePacket({id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'},[{sequence:1,clock_seconds:10,period:1,type:'kickoff',team_id:'h',player_id:null,possession_id:1,outcome:null,home_score:0,away_score:0,details:{}}],1,'casual');
const document={matchId:'fixture',throughSequence:1,atSeconds:10,audience:'casual' as const,label:'Replay recap',synthetic:true as const,publicationKind:'catchup' as const,claims:[{...packet.facts[0],text:'The score is 0–0.',sourceText:packet.facts[0].text}],verification:{accepted:true as const,version:'test',method:'Test review'}};
test('producer documents reject unreviewed, legacy and future evidence',()=>{
 assert.ok(parseProducerDocument(JSON.stringify(document)));assert.equal(parseProducerDocument('legacy fixture'),null);
 assert.equal(parseProducerDocument(JSON.stringify({...document,verification:{...document.verification,accepted:false}})),null);
 assert.equal(parseProducerDocument(JSON.stringify({...document,claims:[{...document.claims[0],evidenceSequences:[2]}]})),null);
});
test('recap export retains source facts, cutoff and review limitations while escaping Markdown',()=>{
 const text=recapMarkdown({...document,claims:[{...document.claims[0],text:'[link](https://example.com) <script>'}]});
 assert.match(text,/Evidence through 0:10/);assert.match(text,/Source: Home/);assert.match(text,/Automated verification can miss errors/);assert.ok(text.includes('\\[link\\]'));assert.ok(text.includes('\\<script\\>'));
});
test('producer recap requires the score and uses a separate cache contract',async()=>{
 const contracts:string[]=[],prompts:string[]=[];
 const agent={run:async<T>(prompt:string,_id:string,verify:(raw:string)=>T,contract:string)=>{contracts.push(contract);prompts.push(prompt);return {result:verify(contract.includes(':draft:')?JSON.stringify({claims:[{factId:'score',text:'Home and Away are level at 0–0.',whyItMatters:'Neither side leads.'}]}):JSON.stringify({accepted:true,unsupportedClaimIds:[],reason:'Supported'})),cached:false};}};
 await runInsightWorkflow(agent,packet,'client',undefined,'recap');assert.ok(contracts.every(c=>c.includes(':recap:')));assert.match(prompts[0],/include the score fact/);
});
test('a recap draft without the score is withheld before publication or review',async()=>{
 let calls=0;const extended={...packet,facts:[...packet.facts,{...packet.facts[0],id:'passing'}]};
 const agent={run:async<T>(_p:string,_id:string,verify:(raw:string)=>T)=>{calls++;return {result:verify(JSON.stringify({claims:[{factId:'passing',text:'The sides are level.',whyItMatters:'Neither leads.'}]})),cached:false};}};
 await assert.rejects(runInsightWorkflow(agent,extended,'client',undefined,'recap'),{code:'AI_VERIFICATION_FAILED'});assert.equal(calls,1);
});
test('half-time and full-time recap facts follow recorded boundaries',()=>{
 const match={id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'};
 const e={sequence:1,clock_seconds:2800,period:1,team_id:null,player_id:null,possession_id:1,outcome:null,home_score:0,away_score:0,details:{}};
 assert.match(evidencePacket(match,[{...e,type:'halftime'}],1,'casual').facts[0].text,/half-time score; the final result remains unknown/);
 assert.match(evidencePacket(match,[{...e,type:'fulltime'}],1,'casual').facts[0].text,/recorded full-time result/);
});
