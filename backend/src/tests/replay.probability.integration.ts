// Read-only audit of approved showcase matches against the running local API.
import assert from 'node:assert/strict';
const base=process.env.TEST_API_URL??'http://127.0.0.1:3002/api';
const read=async(path:string)=>{const response=await fetch(base+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path);return response.json();};
const {matches}=await read('/matches');let requests=1;const warm:number[]=[];
for(const match of matches){
 let priorPoints:unknown[]=[];let priorSequence=0;
 const early=await read(`/matches/${match.id}/state?atSeconds=0&includeFrame=false`);requests++;
 for(const time of [Math.floor(match.duration_seconds/2),match.duration_seconds]){
  const start=performance.now(),state=await read(`/matches/${match.id}/state?atSeconds=${time}&includeFrame=false`);warm.push(performance.now()-start);requests++;
  assert.ok(state.probabilities.history.every((p:{time:number;sequence:number})=>p.time<=state.atSeconds&&p.sequence<=state.throughSequence));
  assert.ok(Math.abs([state.probabilities.current.home,state.probabilities.current.draw,state.probabilities.current.away].reduce((a,b)=>a+b)-1)<1e-9);
  assert.ok(state.turningPoints.points.every((p:{sequence:number;atSeconds:number;largestShift:number})=>p.sequence<=state.throughSequence&&p.atSeconds<=time&&p.largestShift>=.08-1e-12));
  assert.deepEqual(state.turningPoints.points.filter((p:{sequence:number})=>p.sequence<=priorSequence),priorPoints);
  priorPoints=state.turningPoints.points;priorSequence=state.throughSequence;
  assert.ok(state.events.every((e:{clock_seconds:number})=>e.clock_seconds<=time));
  if(time===match.duration_seconds){const {home,away}=state.statistics.score;assert.equal(state.phase,'fulltime');assert.equal(state.probabilities.current.home,Number(home>away));assert.equal(state.probabilities.current.draw,Number(home===away));}
 }
 const rewind=await read(`/matches/${match.id}/state?atSeconds=0&includeFrame=false`);requests++;assert.deepEqual(rewind,early);
}
warm.sort((a,b)=>a-b);console.log(JSON.stringify({showcaseMatches:matches.length,requests,warmMedianMs:Math.round(warm[warm.length>>1]*10)/10,warmMaxMs:Math.round(warm.at(-1)!*10)/10,checks:'Normalized probabilities, no future history/events, fulltime resolution, turning-point threshold/prefix invariance and exact rewind reproducibility.'},null,2));
