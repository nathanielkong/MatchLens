import test from 'node:test';import assert from 'node:assert/strict';import {matchMoments} from '../src/moments.ts';import type {Event,TurningPoint} from '../src/types.ts';
const e=(sequence:number,type:string,outcome:string|null=null)=>({sequence,clock_seconds:sequence*10,period:1,type,team_id:'h',player_id:null,outcome,details:{}} as Event);
test('small-probability goals and red cards remain visible without being called model shifts',()=>{
 const events=[e(1,'shot','goal'),e(2,'red_card'),e(3,'pass'),e(4,'shot','goal')];assert.deepEqual(matchMoments(events,[],2).map(m=>[m.sequence,m.kind,m.shift]),[[1,'goal',undefined],[2,'red_card',undefined]]);
 const point={sequence:1,atSeconds:10,kind:'goal'} as TurningPoint;assert.equal(matchMoments(events,[point],2).length,2);assert.equal(matchMoments(events,[point],2)[0].shift,point);
 assert.deepEqual(matchMoments(events,[point],0),[]);
});
