import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStatistics,type ReplayEvent} from '../analytics/statistics.js';
const event=(sequence:number,type:string,team:string,outcome:string|null=null,details:Record<string,unknown>={}):ReplayEvent=>({sequence,type,team_id:team,outcome,details,clock_seconds:sequence*5,period:1,player_id:null,possession_id:1,home_score:0,away_score:0});
test('known evidence yields passing, shot, possession and distinct pressing statistics',()=>{
 const events=[event(1,'pass','home','complete',{durationSeconds:4,possessionTeamId:'home'}),
  event(2,'pass','home','incomplete',{durationSeconds:6,possessionTeamId:'home'}),
  event(3,'shot','away','saved',{xg:.15,durationSeconds:5,possessionTeamId:'away'}),
  event(4,'shot','away','blocked',{xg:.25,durationSeconds:5,possessionTeamId:'away'}),
  event(5,'foul','home','committed',{durationSeconds:5,possessionTeamId:'away'}),
  event(6,'yellow_card','home'),event(7,'red_card','home')];
 const result=calculateStatistics(events,['home','away'],[{team_id:'home',start_sequence:1,last_sequence:4,raw_pressure_records:8}]);
 const [h,a]=result.teams;
 assert.equal(h.passes,2);assert.equal(h.passAccuracy,50);assert.equal(a.passAccuracy,null);
 assert.equal(a.shots,2);assert.equal(a.shotsOnTarget,1);assert.equal(a.xg,.4);
 assert.equal(h.actionSeconds,10);assert.equal(a.actionSeconds,15);assert.equal(h.possessionEstimate,40);
 assert.equal(h.pressingSequences,1);assert.equal(h.pressureObservations,8);assert.equal(h.yellowCards,1);assert.equal(h.redCards,1);
});
test('empty prefix has no invented score, possession or pass accuracy; future goal cannot affect earlier statistics',()=>{
 const goal={...event(2,'shot','home','goal',{xg:.2}),home_score:1};
 const prefix=[event(1,'kickoff','home')];
 const before=calculateStatistics(prefix,['home','away'],[]);
 assert.deepEqual(before.score,{home:0,away:0});assert.equal(before.teams[0].shots,0);
 assert.equal(before.teams[0].possessionEstimate,null);assert.equal(before.teams[0].passAccuracy,null);
 assert.equal(calculateStatistics([...prefix,goal],['home','away'],[]).score.home,1);
 assert.deepEqual(calculateStatistics([],['home','away'],[]).score,{home:0,away:0});
});
