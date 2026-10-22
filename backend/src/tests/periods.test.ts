import test from 'node:test';import assert from 'node:assert/strict';
import {periodAnalysis} from '../analytics/periods.js';import type {ReplayEvent} from '../analytics/statistics.js';
const e=(sequence:number,period:number,type:string,extra:Partial<ReplayEvent>={}):ReplayEvent=>({sequence,period,type,clock_seconds:period===1?sequence*5:2800+sequence*5,team_id:'h',player_id:null,possession_id:1,outcome:null,home_score:0,away_score:0,details:{periodClockSeconds:period===1?sequence*5:sequence*5},...extra});
const source=[e(1,1,'kickoff'),e(2,1,'shot',{outcome:'goal',home_score:1,details:{xg:.3,periodClockSeconds:10}}),e(3,1,'pressure'),e(4,1,'pressure'),e(5,1,'halftime',{clock_seconds:2800,home_score:1,details:{periodClockSeconds:2800}}),e(6,2,'kickoff',{clock_seconds:2800,home_score:1,details:{periodClockSeconds:0}}),e(7,2,'pressure'),e(8,2,'shot',{team_id:'a',outcome:'goal',home_score:1,away_score:1,details:{xg:.6,periodClockSeconds:40}}),e(9,2,'fulltime',{clock_seconds:5600,home_score:1,away_score:1,details:{periodClockSeconds:2800}})];
test('unseen halves stay unavailable and future goals cannot alter an earlier comparison',()=>{
 const before=JSON.stringify(source),early=periodAnalysis(source,['h','a'],4,25);
 assert.equal(early.periods[0].status,'in_progress');assert.equal(early.periods[1].status,'not_started');assert.deepEqual(early.periods[1].teams,[]);
 assert.equal(early.periods[0].teams[0].goals,1);assert.equal(early.periods[0].teams[0].pressingSequences,1);
 assert.deepEqual(early,periodAnalysis(source.slice(0,4),['h','a'],4,25));assert.equal(JSON.stringify(source),before);
});
test('goals and presses are counted within each half rather than carrying the cumulative score across',()=>{
 const result=periodAnalysis(source,['h','a'],9);
 assert.deepEqual(result.periods.map(p=>p.teams.map(t=>t.goals)),[[1,0],[0,1]]);
 assert.deepEqual(result.periods.map(p=>p.teams[0].pressingSequences),[1,1]);assert.ok(result.periods.every(p=>p.status==='complete'));
});
test('recorded half boundaries and period clocks preserve added time and partial exposure',()=>{
 const halftime=periodAnalysis(source,['h','a'],5,2800);assert.equal(halftime.periods[0].status,'complete');assert.equal(halftime.periods[0].observedSeconds,2800);assert.equal(halftime.periods[1].status,'not_started');
 const second=periodAnalysis(source,['h','a'],6,2810);assert.equal(second.periods[1].observedSeconds,10);assert.equal(second.periods[0].observedSeconds,2800);assert.equal(second.periods[1].status,'in_progress');
});
test('passing percentages are calculated from each period, not averaged or inherited',()=>{
 const events=[e(1,1,'pass',{outcome:'complete'}),e(2,1,'pass',{outcome:'incomplete'}),e(3,2,'pass',{outcome:'complete'})];
 const result=periodAnalysis(events,['h','a'],3);assert.equal(result.periods[0].teams[0].passAccuracy,50);assert.equal(result.periods[1].teams[0].passAccuracy,100);assert.equal(result.periods[1].teams[1].passAccuracy,null);
 assert.ok(periodAnalysis(events,['h','a'],0).periods.every(p=>p.status==='not_started'));
});
