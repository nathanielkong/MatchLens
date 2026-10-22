import test from 'node:test';import assert from 'node:assert/strict';
import {matchDetails} from '../analytics/match-details.js';
import {questionWindow} from '../ai/detailed-facts.js';
import {evidencePacket} from '../ai/evidence.js';
import {runInsightWorkflow} from '../ai/workflow.js';
import type {ReplayEvent} from '../analytics/statistics.js';
const roster=[{id:'h9',teamId:'h',name:'Home Striker',shirt:9,starter:true,position:'FW'},{id:'h18',teamId:'h',name:'Home Sub',shirt:18,starter:false,position:'FW'},{id:'a1',teamId:'a',name:'Away Keeper',shirt:1,starter:true,position:'GK'}];
const ev=(sequence:number,clock_seconds:number,type:string,extra:Partial<ReplayEvent>={}):ReplayEvent=>({sequence,clock_seconds,period:1,type,team_id:'h',player_id:'h9',possession_id:1,outcome:null,home_score:0,away_score:0,details:{periodClockSeconds:clock_seconds},...extra});
const source=[ev(1,0,'kickoff'),ev(2,895,'pass',{outcome:'complete',details:{periodClockSeconds:895,recipientId:'h18',progressiveMetres:12}}),ev(3,900,'shot',{outcome:'saved',details:{periodClockSeconds:900,xg:.25,goalkeeperId:'a1'}}),ev(4,900,'save',{team_id:'a',player_id:'a1',outcome:'held',details:{periodClockSeconds:900}}),ev(5,2705,'halftime'),ev(6,2705,'kickoff',{period:2,details:{periodClockSeconds:0}}),ev(7,3600,'substitution',{period:2,details:{periodClockSeconds:895,outPlayerId:'h9',inPlayerId:'h18'}}),ev(8,3700,'shot',{period:2,player_id:'h18',outcome:'goal',home_score:1,details:{periodClockSeconds:995,xg:.5,assistPlayerId:'h9'}}),ev(9,5500,'fulltime',{period:2,home_score:1,details:{periodClockSeconds:2795}})];
const match={id:'test',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'};
test('rich details obey prefix boundaries and keep goals, saves and player entry contributions distinct',()=>{
 const original=JSON.stringify(source),early=matchDetails(source,['h','a'],roster,4);
 assert.deepEqual(early,matchDetails(source.slice(0,4),['h','a'],roster,4));assert.equal(JSON.stringify(source),original);
 assert.equal(early.players.find(p=>p.id==='h18')!.status,'bench');assert.equal(early.players.find(p=>p.id==='a1')!.savesHeld,1);assert.equal(early.teams[0].goals,0);
 const full=matchDetails(source,['h','a'],roster,9);assert.equal(full.eventCount,9);assert.equal(full.fulltime,true);assert.equal(full.players.find(p=>p.id==='h18')!.goals,1);assert.equal(full.players.find(p=>p.id==='h18')!.observedSeconds,1900);assert.equal(full.players.find(p=>p.id==='h9')!.leftAt,3600);
 assert.equal(full.passingLinks[0].completed,1);assert.equal(full.passingLinks[0].toName,'Home Sub');assert.equal(full.players.find(p=>p.id==='h9')!.progressivePasses,1);
 assert.ok(full.timeline.every(e=>e.sequence<=9));assert.ok(early.timeline.every(e=>e.sequence<=4));
});
test('phase bins preserve 15-minute boundaries, added time and completed-vs-partial periods',()=>{
 const d=matchDetails(source,['h','a'],roster,9);assert.equal(d.phases.length,6);assert.equal(d.phases[0].teams[0].passes,1);assert.equal(d.phases[1].teams[0].shots,1);assert.equal(d.phases[2].observedSeconds,905);assert.equal(d.phases[5].observedSeconds,995);assert.ok(d.phases.every(p=>p.complete));
 const early=matchDetails(source,['h','a'],roster,3);assert.equal(early.phases.length,2);assert.equal(early.phases[1].observedSeconds,0);assert.equal(early.phases[1].complete,false);
});
test('substitution before/after windows cannot use unseen events and expose unequal durations',()=>{
 const atSub=matchDetails(source,['h','a'],roster,7).comparisons[0];assert.equal(atSub.after.observedSeconds,0);assert.equal(atSub.after.teams[0].goals,0);assert.equal(atSub.after.partial,true);
 const later=matchDetails(source,['h','a'],roster,8).comparisons[0];assert.equal(later.after.observedSeconds,100);assert.equal(later.after.teams[0].goals,1);assert.equal(later.before.observedSeconds,300);assert.ok(later.evidenceSequences.every(n=>n<=8));
});
test('elapsed question windows clamp requested future time and count only the specified interval',()=>{
 assert.deepEqual(questionWindow('between 60 and 75 minutes',3900),{from:3600,to:3900,requestedTo:4500});assert.deepEqual(questionWindow('last 10 minutes',3700),{from:3100,to:3700,requestedTo:3700});assert.equal(questionWindow('from 80 to 90 minutes',3700),null);assert.equal(questionWindow('from 90 to 60',5500),null);
 const p=evidencePacket(match,source,8,'analyst',{players:roster,question:'What happened in the last 10 minutes?'}),window=p.facts.find(f=>f.id==='time-window')!;assert.match(window.text,/51:40–61:40/);assert.match(window.text,/Home: 1 goals, 1 shots/);assert.ok(window.evidenceSequences.every(n=>n<=8));assert.match(p.facts.find(f=>f.id==='coverage')!.text,/kickoff at 0:00/);
 const keeper=evidencePacket(match,source,4,'analyst',{players:[...roster,{id:'bench-keeper',teamId:'a',name:'Unused Keeper',shirt:12,starter:false,position:'GK'}]}).facts.find(f=>f.id==='goalkeepers')!;assert.match(keeper.text,/Away Keeper.*1 saves, 1 held/);assert.ok(!keeper.text.includes('Unused Keeper'));
});
test('late-match two-sentence output is repaired then withheld rather than published as a full summary',async()=>{
 const p=evidencePacket(match,source,9,'analyst',{players:roster});p.throughSequence=100;let requests=0;
 const agent={run:async<T>(_p:string,_id:string,check:(s:string)=>T)=>{requests++;return {result:check(JSON.stringify({claims:[{factId:'score',text:'Home won 1–0.',whyItMatters:''}]})),cached:false};}};
 await assert.rejects(runInsightWorkflow(agent,p,'test'),{code:'AI_VERIFICATION_FAILED'});assert.equal(requests,2);
});
