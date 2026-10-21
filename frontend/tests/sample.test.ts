import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleResponse} from '../src/sample.ts';
test('offline preview stays within the public sample rather than claiming a full match',()=>{
 const library=sampleResponse('/matches') as {matches:{id:string;duration_seconds:number}[]};
 assert.equal(library.matches.length,1);assert.equal(library.matches[0].duration_seconds,345);
 const visual=sampleResponse(`/matches/${library.matches[0].id}/visual-replay`) as {containsFutureSamples:boolean;frames:unknown[]};
 assert.equal(visual.containsFutureSamples,true);assert.equal(visual.frames.length,2);
});
test('offline preview retains the same evidence cutoff when scrubbing and event-stepping',()=>{
 const id='showcase-v2.0.0-1';
 const before=sampleResponse(`/matches/${id}/state?atSeconds=319`) as {throughSequence:number;statistics:{score:{home:number;away:number}};events:{clock_seconds:number}[]};
 assert.deepEqual(before.statistics.score,{home:0,away:0});assert.ok(before.events.every(e=>e.clock_seconds<=319));
 const goal=sampleResponse(`/matches/${id}/state?throughSequence=98`) as typeof before;
 assert.equal(goal.statistics.score.home,1);assert.equal(goal.throughSequence,98);
 const end=sampleResponse(`/matches/${id}/state?atSeconds=6000`) as {phase:string;atSeconds:number};
 assert.equal(end.phase,'sample_complete');assert.equal(end.atSeconds,345);
});
