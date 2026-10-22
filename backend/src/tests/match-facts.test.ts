import test from 'node:test';import assert from 'node:assert/strict';
import {evidencePacket} from '../ai/evidence.js';
import {runInsightWorkflow} from '../ai/workflow.js';
import type {ReplayEvent} from '../analytics/statistics.js';
const match={id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'MatchLens Home',away_team:'MatchLens Away'};
const players=[{id:'old',teamId:'h',name:'Old Striker',shirt:9,starter:true},{id:'new',teamId:'h',name:'New Striker',shirt:18,starter:false},{id:'mid',teamId:'h',name:'Pass Maker',shirt:8,starter:true},{id:'later',teamId:'h',name:'Future Sub',shirt:19,starter:false}];
const context={players,homeFormation:'4-3-3',awayFormation:'4-2-3-1'};
const event=(sequence:number,type:string,player_id:string|null,details:Record<string,unknown>={},outcome:string|null=null):ReplayEvent=>({sequence,clock_seconds:sequence*60,period:1,type,player_id,team_id:'h',possession_id:1,home_score:sequence>=6?1:0,away_score:0,outcome,details:{periodClockSeconds:sequence*60,...details}});
const events=[event(1,'kickoff','old'),event(2,'pass','old',{},'complete'),event(3,'substitution','old',{inPlayerId:'new',outPlayerId:'old',reason:'fresh_legs'}),event(4,'tactic_change','mid',{tactic:'attack',formation:'4-3-3'}),event(5,'pass','new',{},'complete'),event(6,'shot','new',{xg:.2,assistPlayerId:'mid'},'goal'),event(7,'tactic_change','mid',{tactic:'balanced',formation:'4-3-3'}),event(8,'substitution','new',{inPlayerId:'later',outPlayerId:'new'})];
const fact=(cutoff:number,id:string,question?:string)=>evidencePacket(match,events,cutoff,'casual',{...context,question}).facts.find(f=>f.id===id)!;
test('tactical instructions and substitutes obey exact sequence cutoffs, even when later data is supplied',()=>{
 assert.equal(fact(2,'tactics'),undefined);assert.equal(fact(2,'substitutions'),undefined);assert.match(fact(2,'changes').text,/0 substitutions/);
 assert.match(fact(6,'tactics').text,/instruction to attack/);assert.ok(!fact(6,'tactics').text.includes('balanced'));
 const subs=fact(6,'substitutions');assert.match(subs.text,/New Striker on for Old Striker/);assert.match(subs.text,/1 shots, 1 goals, 0 recorded assists, 1 completed passes/);assert.ok(!subs.text.includes('Future Sub'));
 assert.ok(subs.evidenceSequences.every(n=>n<=6));
 const prefix=evidencePacket(match,events.slice(0,6),6,'casual',context);assert.deepEqual(prefix,evidencePacket(match,events,6,'casual',context));
});
test('starting formations stay separate from tactical changes, not invented formation switches',()=>{
 const f=fact(6,'formations');assert.match(f.text,/Home 4-3-3; Away 4-2-3-1/);assert.match(f.text,/keeps these formations fixed/);
 assert.deepEqual(fact(2,'formations').text,f.text);
});
test('named player evidence counts only observed goals, assists and post-entry actions',()=>{
 assert.match(fact(6,'goals').text,/New Striker scored, assist by Pass Maker/);
 assert.match(fact(6,'players','How has New Striker played?').text,/entered at elapsed 3:00; 1 shots, 1 goals/);
 assert.match(fact(2,'players','How has New Striker played?').text,/has not entered; 0 shots, 0 goals/);
 assert.match(fact(6,'players','What has Pass Maker contributed?').text,/1 recorded assists/);
 assert.ok(!fact(6,'players','How has New Striker played?').text.includes('Future Sub'));
});
test('period and probability facts do not reveal the unseen second half or later result',()=>{
 assert.match(fact(6,'periods').text,/Second half: not started/);assert.match(fact(6,'probabilities').text,/synthetic-model estimates/);
 const packet=evidencePacket(match,events,6,'casual',context);assert.ok(packet.facts.every(f=>f.prefix.throughSequence===6&&f.evidenceSequences.every(n=>n<=6)));
});
test('summary and talking points support richer, distinct evidence coverage',async()=>{
 const packet=evidencePacket(match,events,6,'casual',context),ids=['score','chances','goals','tactical-context','substitutions'];
 const claims=ids.map(factId=>({factId,text:packet.facts.find(f=>f.id===factId)!.text.slice(0,310),whyItMatters:''}));
 const prompts:string[]=[];const agent={run:async<T>(prompt:string,_client:string,check:(s:string)=>T)=>{prompts.push(prompt);return {result:check(JSON.stringify(prompts.length===1?{claims}:{accepted:true,unsupportedClaimIds:[],reason:'Supported'})),cached:false};}};
 const answer=await runInsightWorkflow(agent,packet,'test');assert.equal(answer.result.claims.length,5);assert.equal(answer.result.presentation,'paragraph');assert.match(prompts[0],/connected match-summary paragraph sequence/);assert.match(prompts[0],/220–350/);
 const short={run:async<T>(_p:string,_c:string,check:(s:string)=>T)=>({result:check(JSON.stringify({claims:claims.slice(0,2)})),cached:false})};
 await assert.rejects(runInsightWorkflow(short,packet,'test'),{code:'AI_VERIFICATION_FAILED'});
 const points=await runInsightWorkflow({run:async<T>(_p:string,_c:string,check:(s:string)=>T,contract:string)=>({result:check(JSON.stringify(contract.includes(':draft:')?{claims}:{accepted:true,unsupportedClaimIds:[],reason:'Supported'})),cached:false})},packet,'test',undefined,'talking_point');assert.equal(points.result.claims.length,5);
});

test('an under-covered summary gets one bounded repair and must still pass the model review',async()=>{
 const packet=evidencePacket(match,events,6,'casual',context),ids=['score','chances','goals','tactical-context','substitutions'];
 const claims=ids.map(factId=>({factId,text:packet.facts.find(f=>f.id===factId)!.text.slice(0,310),whyItMatters:''}));
 const replies=[JSON.stringify({claims:claims.slice(0,2)}),JSON.stringify({claims}),JSON.stringify({accepted:true,unsupportedClaimIds:[],reason:'Supported'})],prompts:string[]=[];
 const agent={run:async<T>(prompt:string,_client:string,check:(raw:string)=>T)=>{prompts.push(prompt);return {result:check(replies.shift()!),cached:false};}};
 const answer=await runInsightWorkflow(agent,packet,'test');assert.equal(prompts.length,3);assert.match(prompts[1],/previous draft failed deterministic validation/);assert.equal(answer.result.verification.rewrites,1);assert.equal(answer.result.verification.accepted,true);
});
