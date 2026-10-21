import test from 'node:test';
import assert from 'node:assert/strict';
import {initialObservation,predict} from '../probability/core.js';
import {model,probabilityHistory} from '../probability/inference.js';
import type {EvidenceEvent} from '../probability/core.js';
const goal=(sequence:number,time:number):EvidenceEvent=>({sequence,clock_seconds:time,period:1,type:'shot',team_id:'h',outcome:'goal',home_score:1,away_score:0,details:{xg:.2,periodClockSeconds:time}});
test('result chances stay finite, nonnegative and normalized, including extreme score/card/time inputs',()=>{
 for(const time of [0,2700,5400,5900,7200])for(const difference of [-8,0,8])for(const cards of [0,3]){
  const s={...initialObservation(),time,period:time<2800?1:2,periodClock:time<2800?time:time-2800,homeScore:Math.max(0,difference),awayScore:Math.max(0,-difference),homeReds:cards};
  const p=predict(s,model),values=Object.values(p);assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(Math.abs(values.reduce((a,b)=>a+b)-1)<1e-10);
 }
});
test('observed goal raises that team chance; only the fulltime event resolves the result',()=>{
 const before=predict({...initialObservation(),time:4000,period:2,periodClock:1200},model);
 const after=predict({...initialObservation(),time:4000,period:2,periodClock:1200,homeScore:1},model);
 assert.ok(after.home>before.home);
 assert.deepEqual(predict({...initialObservation(),ended:true,homeScore:1},model),{home:1,draw:0,away:0});
 assert.ok(predict({...initialObservation(),time:7000,period:2,periodClock:4000},model).draw<1);
});
test('probability history is cutoff-safe and reproducible; a rewind cannot retain future points',()=>{
 const events=[goal(1,100),{...goal(2,200),home_score:2}];
 const first=probabilityHistory(events.slice(0,1),'h',150),rewind=probabilityHistory(events.filter(e=>e.clock_seconds<=150),'h',150);
 assert.deepEqual(first,rewind);assert.ok(first.history.every(p=>p.time<=150&&p.sequence<=1));
 assert.notEqual(probabilityHistory(events,'h',250).current.home,first.current.home);
 assert.deepEqual(probabilityHistory([],'h',0).current,{time:0,sequence:0,...predict(initialObservation(),model)});
});
