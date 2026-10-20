import test from 'node:test';
import assert from 'node:assert/strict';
import {positionsAt,ballAt,ballKeyframes,ballTravelSeconds,advanceClock,type Frame,type VisualEvent} from '../src/motion.ts';
const frame=(t:number,seq:number,x:number,ids=['a'],period=1):Frame=>({clock_seconds:t,through_sequence:seq,period,ball:{x,y:50},positions:ids.map(playerId=>({playerId,teamId:'home',x,y:50}))});
const event=(type:string,time:number,seq:number,details:Record<string,unknown>={}):VisualEvent=>({type,clock_seconds:time,sequence:seq,period:1,team_id:'home',player_id:'a',x:10,y:20,end_x:40,end_y:60,details});
test('linear motion is clamped to samples; roster changes do not appear early',()=>{
 const frames=[frame(0,1,0),frame(10,3,100,['b'])];
 assert.deepEqual(positionsAt({time:-1},frames),[]);
 assert.equal(positionsAt({time:5},[frame(0,1,0),frame(10,3,100)])[0].x,50);
 assert.equal(positionsAt({time:5},frames)[0].playerId,'a');
 assert.equal(positionsAt({time:10},frames)[0].playerId,'b');
 assert.equal(positionsAt({time:100},frames)[0].x,100);
});
test('substitutions and dismissals apply at their event time and sequence',()=>{
 const frames=[frame(0,1,0),frame(10,5,100,['b'])],sub=event('substitution',5,3,{outPlayerId:'a',inPlayerId:'b'});
 assert.equal(positionsAt({time:4},frames,[sub])[0].playerId,'a');
 assert.equal(positionsAt({time:5,sequence:2},frames,[sub])[0].playerId,'a');
 assert.equal(positionsAt({time:5,sequence:3},frames,[sub])[0].playerId,'b');
 assert.equal(positionsAt({time:7.5},frames,[sub])[0].x,50);
 assert.equal(positionsAt({time:5},frames,[event('red_card',5,3)]).length,0);
});
test('duplicate timestamps resolve by sequence, with no cross-half glide',()=>{
 const frames=[frame(0,1,0),frame(10,2,20),frame(10,3,90,['a'],2),frame(20,4,100,['a'],2)];
 assert.equal(positionsAt({time:10,sequence:2},frames)[0].x,20);
 assert.equal(positionsAt({time:10},frames)[0].x,90);
 assert.equal(positionsAt({time:15},frames)[0].x,95);
 assert.equal(positionsAt({time:5},[frame(0,1,0),frame(10,3,90,['a'],2)])[0].x,0);
});
test('ball uses action endpoints, converts attack direction, and prefers exact sampled positions',()=>{
 const pass=event('pass',10,2,{durationSeconds:4,attackDirection:-1});
 const points=ballKeyframes([frame(0,1,0),frame(20,5,50)],[pass]);
 assert.deepEqual(ballAt({time:6},points),{x:90,y:80});
 assert.deepEqual(ballAt({time:8},points),{x:75,y:60});
 assert.deepEqual(ballAt({time:10},points),{x:60,y:40});
 assert.deepEqual(ballAt({time:10},ballKeyframes([frame(10,3,42)],[pass])),{x:42,y:50});
 assert.equal(ballAt({time:0},[]),null);
});
test('playback advances by elapsed time independently of refresh rate and stops at full time',()=>{
 let fast=0,slow=0;
 for(let i=0;i<60;i++)fast=advanceClock(fast,1/60,8,100);
 for(let i=0;i<20;i++)slow=advanceClock(slow,1/20,8,100);
 assert.ok(Math.abs(fast-8)<1e-10);assert.ok(Math.abs(fast-slow)<1e-10);
 assert.equal(advanceClock(99,1,8,100),100);
});

test('pass flight uses ball speed, holds before release, and keeps the event timestamp',()=>{
 const pass={...event('pass',10,2,{durationSeconds:8,ballSpeedKmh:37.8}),x:0,y:50,end_x:20,end_y:50};
 assert.ok(Math.abs(ballTravelSeconds(pass)-2)<1e-10); // 21 metres at 10.5 metres/second
 const points=ballKeyframes([frame(2,1,0),frame(10,2,20)],[pass]);
 assert.deepEqual(ballAt({time:7},points),{x:0,y:50});
 assert.deepEqual(ballAt({time:9},points),{x:10,y:50});
 assert.deepEqual(ballAt({time:10},points),{x:20,y:50});
});
test('shots fly faster than carries; inconsistent speed is capped by the available action time',()=>{
 const shot={...event('shot',10,2,{durationSeconds:6,shotSpeedKmh:75.6}),x:0,y:50,end_x:20,end_y:50};
 assert.ok(Math.abs(ballTravelSeconds(shot)-1)<1e-10);
 assert.equal(ballTravelSeconds({...shot,type:'carry'}),6);
 assert.equal(ballTravelSeconds({...shot,details:{durationSeconds:.5,shotSpeedKmh:75.6}}),.5);
 assert.equal(ballTravelSeconds({...shot,details:{durationSeconds:6,shotSpeedKmh:0}}),6);
});
