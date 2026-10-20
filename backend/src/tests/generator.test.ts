import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,scenarios,random} from '../synthetic/generator.js';
import {teams,players,abilities} from '../synthetic/catalog.js';
import {validateMatch} from '../synthetic/validate.js';

test('generation is reproducible, with stable distinct player abilities',()=>{
 assert.deepEqual(generate(42,'balanced',0,1,{tracking:true}),generate(42,'balanced',0,1,{tracking:true}));
 assert.notDeepEqual(generate(42,'balanced').events,generate(43,'balanced').events);
 assert.equal(players.length,160);assert.notDeepEqual(abilities.get('team-1-p6'),abilities.get('team-1-p10'));
});
test('varied matches preserve clocks, score, actors, event evidence and tracking',()=>{
 const types:Record<string,number>={};
 for(let i=0;i<160;i++){
  const r=random(8000000+i),h=Math.floor(r()*teams.length),a=(h+1+Math.floor(r()*(teams.length-1)))%teams.length;
  const m=generate(8000000+i,scenarios[i%scenarios.length],h,a,{tracking:i<24,regime:i%3===0?'stress':'standard'});
  const q=validateMatch(m);for(const [t,n] of Object.entries(q.types))types[t]=(types[t]??0)+n;
 }
 assert.ok((types.red_card??0)<80,'Dismissal frequency must stay below the synthetic coverage ceiling');
 for(const type of ['save','corner','goal_kick','throw_in','pressure','tactic_change','substitution','red_card','yellow_card','recovery','block'])assert.ok(types[type]>0,type);
});
test('shot outcomes lead to appropriate linked goalkeeper actions and restarts',()=>{
 for(let i=0;i<24;i++){
  const m=generate(9200000+i,'open_game',0,1);
  for(const e of m.events.filter(e=>e.type==='shot')){
   const next=m.events[e.sequence];
   if(e.outcome==='goal')assert.equal(next.type,'kickoff');
   if(e.outcome==='off_target')assert.equal(next.type,'goal_kick');
   if(e.outcome==='saved')assert.equal(next.type,'save');
   if(e.outcome==='blocked')assert.equal(next.type,'block');
   assert.notEqual(e.teamId,next.teamId);
  }
 }
});
test('red cards remove the player, substitutions vary in time, periods include added time',()=>{
 const redMinutes=new Set<number>(),subMinutes=new Set<number>(),sides=new Set<string>();
 for(let i=0;i<32;i++){
  const m=generate(9300000+i,'red_card',0,1,{tracking:true});validateMatch(m);
  const red=m.events.find(e=>e.type==='red_card')!;redMinutes.add(Math.floor(red.clock/60));sides.add(red.teamId!);
  for(const e of m.events.filter(e=>e.type==='substitution'))subMinutes.add(Math.floor(e.clock/60));
  assert.ok(m.duration>5400);assert.ok(m.firstEnd>2700);
 }
 assert.ok(redMinutes.size>10);assert.ok(subMinutes.size>10);assert.equal(sides.size,2);
});

test('simultaneous final action and halftime retain first-half event ordering',()=>{
 const m=generate(42,'balanced');const half=m.events.findIndex(e=>e.type==='halftime');
 m.events[half-1].clock=m.firstEnd;validateMatch(m);
});
