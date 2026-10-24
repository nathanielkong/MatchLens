import assert from 'node:assert/strict';
// Explicitly opt in: these are real requests to the configured model and save
// reviewed producer drafts. Nothing is exported to a local report file.
if(!process.argv.includes('--live'))throw new Error('Pass --live to run billed AI feature checks against the running app.');
const base=process.env.TEST_API_URL??'http://127.0.0.1:3002/api';let cookie='';
async function read(path:string,init:RequestInit={}){
 const response=await fetch(base+path,{...init,headers:{...init.headers,...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(260000)});
 cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;
 const body=await response.json();assert.equal(response.status,200,`${path}: ${String(body.error??response.status)}`);return body;
}
const {matches}=await read('/matches'),match=matches[0];assert.ok(match);
const path=`/matches/${encodeURIComponent(match.id)}`;
const state=await read(path+`/state?atSeconds=${match.duration_seconds}&includeFrame=false`);
const half=state.keyEvents.find((e:{type:string})=>e.type==='halftime');assert.ok(half);
const {lineups}=await read(path+'/lineups');
const substitution=state.keyEvents.find((e:{type:string})=>e.type==='substitution');assert.ok(substitution);
const player=lineups.find((p:{player_id:string})=>p.player_id===substitution.details.inPlayerId);assert.ok(player);
let previous:string|undefined,started=0;
async function generate(name:string,route:string,body:Record<string,unknown>){
 // Preserve the normal per-client rate limit rather than creating new clients.
 const wait=Math.max(0,61000-(Date.now()-started));if(started&&wait)await new Promise(r=>setTimeout(r,wait));started=Date.now();
 const value=await read(path+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=value.result;
 assert.equal(result.verification.accepted,true,name);assert.equal(result.throughSequence,body.throughSequence,name);
 assert.ok(result.claims.every((c:{evidenceSequences:number[];sourceText:string})=>c.sourceText&&c.evidenceSequences.length&&c.evidenceSequences.every(n=>n<=result.throughSequence)),name);
 const text=result.claims.map((c:{text:string})=>c.text).join(' '),words=text.trim().split(/\s+/).length;
 console.log(JSON.stringify({name,accepted:true,claims:result.claims.length,words,cached:value.cached,milliseconds:Date.now()-started,...(process.argv.includes('--show-text')?{text}:{})}));
 return {...value,words};
}
const full={throughSequence:state.throughSequence,audience:'casual'};
const summary=await generate('full-time summary','/insights',full);assert.ok(summary.words>=180);assert.ok(summary.result.claims.length>=8);
const firstHalf=await generate('half-time analyst summary','/insights',{throughSequence:half.sequence,audience:'analyst'});assert.ok(firstHalf.words>=180);
const recap=await generate('full-time producer recap','/producer',{...full,output:'recap'});assert.ok(recap.words>=220);assert.equal(recap.result.publicationKind,'fulltime');assert.ok(recap.publishedId);
const exported=await read(path+`/recap-export?throughSequence=${state.throughSequence}&audience=casual&format=json`);assert.equal(exported.document.throughSequence,state.throughSequence);
const talking=await generate('producer talking points','/producer',{...full,output:'talking_point'});assert.ok(talking.result.claims.length>=4&&talking.result.claims.length<=6);assert.ok(talking.words>=100);assert.ok(talking.publishedId);
const answer=await generate('substitute contribution question','/questions',{...full,question:`How did ${player.name} perform after coming on?`});previous=answer.conversationId;assert.ok(previous);
const followup=await generate('contextual passing follow-up','/questions',{...full,question:'And their passing?',history:[previous]});assert.equal(followup.contextReset,false);assert.match(followup.result.resolvedQuestion,new RegExp(player.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
const feed=await read(path+`/producer-feed?throughSequence=${state.throughSequence}`);assert.ok(feed.insights.some((i:{id:string})=>String(i.id)===String(recap.publishedId)));
const rewind=await read(path+`/producer-feed?throughSequence=${half.sequence}`);assert.ok(rewind.insights.every((i:{through_sequence:number})=>i.through_sequence<=half.sequence));
console.log('Live summaries, recap publication/export, talking points, persisted follow-up context and cutoff-safe producer feed passed.');
