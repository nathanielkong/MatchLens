import assert from 'node:assert/strict';
import type {generate,Event} from './generator.js';
import {abilities} from './catalog.js';
export const VALIDATOR_VERSION='2.0.0';
export function validateMatch(m:ReturnType<typeof generate>) {
 const active=new Set(m.roster.flatMap(r=>r.slice(0,11).map(p=>p.id))),removed=new Set<string>();
 const byId=new Map(m.roster.flat().map(p=>[p.id,p]));
 let clock=0,possession=0,home=0,away=0,expectedPeriod=1;
 const types:Record<string,number>={};
 for(const [i,e] of m.events.entries()) {
  assert.equal(e.sequence,i+1);assert.ok(e.clock>=clock&&e.clock<=m.duration);assert.ok(e.possession>=possession);
  assert.equal(e.period,expectedPeriod);if(e.type==='halftime')expectedPeriod=2;
  if(e.playerId){assert.ok(active.has(e.playerId),`Inactive actor ${e.playerId}`);assert.equal(byId.get(e.playerId)!.teamId,e.teamId);}
  for(const n of [e.x,e.y,e.endX,e.endY])if(n!==null)assert.ok(Number.isFinite(n)&&n>=0&&n<=100);
  if(e.type==='substitution') {
   const out=String(e.details.outPlayerId),inc=String(e.details.inPlayerId);
   assert.ok(active.has(out)&&!active.has(inc)&&!removed.has(inc));assert.equal(byId.get(out)!.teamId,byId.get(inc)!.teamId);
   assert.equal(byId.get(out)!.position,byId.get(inc)!.position);active.delete(out);removed.add(out);active.add(inc);
  }
  if(e.type==='red_card'){active.delete(e.playerId!);removed.add(e.playerId!);}
  if(e.type==='pass'){assert.ok(active.has(String(e.details.recipientId)));assert.equal(byId.get(String(e.details.recipientId))!.teamId,e.teamId);assert.ok(Number(e.details.durationSeconds)>0);}
  for(const key of ['relatedEventSequence','pressureEventSequence','shotSequence','keyPassSequence','assistEventSequence']) {
   const seq=e.details[key];if(seq){assert.ok(Number.isInteger(seq)&&Number(seq)<e.sequence);}
  }
  if(e.details.pressureEventSequence){const p=m.events[Number(e.details.pressureEventSequence)-1];assert.equal(p.type,'pressure');}
  if(e.type==='shot') {
   assert.ok(Number(e.details.xg)>0&&Number(e.details.xg)<1);
   assert.equal(byId.get(String(e.details.goalkeeperId))!.position,'GK');
   if(e.outcome==='goal')e.teamId===m.home.id?home++:away++;
   if(e.details.keyPassSequence){const p=m.events[Number(e.details.keyPassSequence)-1];assert.equal(p.type,'pass');assert.equal(p.outcome,'complete');assert.equal(p.possession,e.possession);assert.equal(p.details.recipientId,e.playerId);}
  }
  if(e.type==='save'){assert.equal(byId.get(e.playerId!)!.position,'GK');assert.equal(m.events[Number(e.details.shotSequence)-1].outcome,'saved');}
  if(e.type==='block')assert.equal(m.events[Number(e.details.shotSequence)-1].outcome,'blocked');
  assert.equal(e.homeScore,home);assert.equal(e.awayScore,away);
  clock=e.clock;possession=e.possession;types[e.type]=(types[e.type]??0)+1;
 }
 assert.deepEqual(m.score,[home,away]);assert.equal(m.events.at(-1)!.type,'fulltime');assert.equal(clock,m.duration);
 assert.equal(types.halftime,1);assert.equal(types.fulltime,1);
 assert.equal(types.kickoff,2+home+away);
 const activeAtFrame=new Set(m.roster.flatMap(r=>r.slice(0,11).map(p=>p.id)));let applied=0;const lastDistance=new Map<string,number>();
 for(const f of m.frames){
  while(applied<f.sequence){const e=m.events[applied++];if(e.type==='substitution'){activeAtFrame.delete(String(e.details.outPlayerId));activeAtFrame.add(String(e.details.inPlayerId));}if(e.type==='red_card')activeAtFrame.delete(e.playerId!);}
  assert.equal(f.clock,m.events[f.sequence-1].clock);assert.equal(f.positions.length,activeAtFrame.size);
  assert.equal(new Set(f.positions.map(p=>p.playerId)).size,f.positions.length);
  for(const p of f.positions){assert.ok(Number.isFinite(p.distanceMetres)&&p.distanceMetres>=(lastDistance.get(p.playerId)??0));lastDistance.set(p.playerId,p.distanceMetres);assert.ok(activeAtFrame.has(p.playerId));assert.ok(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert.ok(p.speedMps>=0&&p.speedMps<=abilities.get(p.playerId)!.pace+.002);}
 }
 return {events:m.events.length,goals:home+away,types,frames:m.frames.length};
}
