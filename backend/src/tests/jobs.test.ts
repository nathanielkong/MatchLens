import test from 'node:test';import assert from 'node:assert/strict';
import {workflowGate} from '../ai/jobs.js';
test('a complete AI workflow keeps one slot until completion and releases on failure',async()=>{
 const gate=workflowGate();let release!:()=>void;const waiting=gate(()=>new Promise<void>(r=>{release=r;}));
 await assert.rejects(gate(async()=>1),{code:'AI_BUSY'});release();await waiting;
 await assert.rejects(gate(async()=>{throw new Error('failed');}));assert.equal(await gate(async()=>2),2);
});
