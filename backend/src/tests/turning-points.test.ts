import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTurningPoints,turningPointMethod} from '../analytics/turning-points.js';
import {initialObservation,predict,observe,type EvidenceEvent} from '../probability/core.js';
import {model} from '../probability/inference.js';
import {anchorMetrics} from '../turning-points/metrics.js';
import {evidencePacket} from '../ai/evidence.js';
const event=(sequence:number,time:number,type:string,extra:Partial<EvidenceEvent>={}):EvidenceEvent=>({sequence,clock_seconds:time,period:1,type,team_id:'h',outcome:null,home_score:0,away_score:0,details:{periodClockSeconds:time},...extra});
const goal=event(2,900,'shot',{outcome:'goal',home_score:1,details:{periodClockSeconds:900,xg:.3}});
test('same-clock jump matches the probability model and excludes clock drift',()=>{
 const points=detectTurningPoints([event(1,0,'kickoff'),goal],'h',2);assert.equal(points.length,1);
 const before={...initialObservation(),time:900,periodClock:900},after={...before};observe(after,goal,'h');
 assert.deepEqual(points[0].before,predict(before,model));assert.deepEqual(points[0].after,predict(after,model));
 assert.equal(points[0].kind,'goal');assert.ok(points[0].largestShift>=turningPointMethod.threshold);assert.deepEqual(points[0].evidenceSequences,[2]);
 assert.equal(detectTurningPoints([event(1,0,'kickoff'),event(2,5300,'pass'),event(3,5600,'fulltime')],'h',3).length,0);
});
test('prefix results never change after future events, same-clock events obey sequence and inputs are not mutated',()=>{
 const source=[event(1,0,'kickoff'),goal,event(3,900,'shot',{team_id:'a',outcome:'goal',home_score:1,away_score:1,details:{periodClockSeconds:900,xg:.5}}),event(4,3000,'red_card',{team_id:'h',home_score:1,away_score:1})];
 const original=JSON.stringify(source),full=detectTurningPoints(source,'h',4);
 for(let cutoff=0;cutoff<=4;cutoff++)assert.deepEqual(detectTurningPoints(source,'h',cutoff),full.filter(p=>p.sequence<=cutoff));
 assert.equal(JSON.stringify(source),original);assert.deepEqual(detectTurningPoints(source,'h',1),[]);
});
test('second-half baseline uses the period clock and red cards can be detected without score changes',()=>{
 const kickoff=event(1,2900,'kickoff',{period:2,details:{periodClockSeconds:0}}),card=event(2,3500,'red_card',{period:2,details:{periodClockSeconds:600}}),parameters={...model,redEffect:2};
 const points=detectTurningPoints([kickoff,card],'h',2,parameters);assert.equal(points.length,1);assert.equal(points[0].kind,'red_card');
 const before={...initialObservation(),time:3500,period:2,periodClock:600};assert.deepEqual(points[0].before,predict(before,parameters));assert.ok(points[0].after.home<points[0].before.home);
});
test('reference scoring is one-to-one by event and kind; empty cases are retained',()=>{
 const refs=[{sequence:2,kind:'goal'},{sequence:4,kind:'red_card'}];
 const result=anchorMetrics([{sequence:2,kind:'goal'},{sequence:2,kind:'goal'},{sequence:4,kind:'shot'}],refs);
 assert.equal(result.truePositives,1);assert.equal(result.falsePositives,2);assert.equal(result.falseNegatives,1);assert.equal(result.recall,.5);
 assert.equal(anchorMetrics([],[]).f1,null);assert.equal(anchorMetrics([{sequence:1,kind:'shot'}],[]).falsePositives,1);
});
test('AI packet includes only observed turning-point evidence and the original event citation',()=>{
 const match={id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'};
 const source=[event(1,0,'kickoff'),goal].map(e=>({...e,player_id:null,possession_id:1}));
 assert.equal(evidencePacket(match,source,1,'casual').facts.some(f=>f.id==='turning-point'),false);
 const shift=evidencePacket(match,source,2,'casual').facts.find(f=>f.id==='turning-point')!;
 assert.ok(shift);assert.deepEqual(shift.evidenceSequences,[2]);assert.match(shift.text,/not proof of tactical causality/);assert.equal(shift.prefix.throughSequence,2);
});
