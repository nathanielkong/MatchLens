import test from 'node:test';import assert from 'node:assert/strict';
import {conversationStore,type ConversationContext} from '../ai/conversation.js';
const scope={matchId:'match-a',audience:'casual' as const,throughSequence:10,owner:'client-a'};
const value:ConversationContext={question:'How did Robin play?',answer:'Robin scored.',throughSequence:10,factIds:['players'],playerIds:['robin'],eventSequences:[5,10]};
test('opaque conversation handles isolate clients, matches, audiences and future cutoffs',()=>{
 const store=conversationStore(),id=store.remember(scope,value);assert.match(id,/^[0-9a-f-]{36}$/);assert.equal(store.read([id],scope).context.length,1);
 for(const different of [{...scope,owner:'other'},{...scope,matchId:'other'},{...scope,audience:'analyst' as const},{...scope,throughSequence:9}])assert.deepEqual(store.read([id],different),{context:[],reset:true});
 assert.equal(store.read([id,id],scope).context.length,1);assert.deepEqual(store.read(['unknown'],scope),{context:[],reset:true});
});
test('context expires and memory is bounded without keeping entire prompts or answers',()=>{
 let now=0;const store=conversationStore({now:()=>now,ttlMs:100,maxTurns:2}),a=store.remember(scope,{...value,answer:'x'.repeat(5000),eventSequences:[1,10,99]});
 const context=store.read([a],scope).context[0];assert.equal(context.answer.length,900);assert.deepEqual(context.eventSequences,[1,10]);
 const b=store.remember(scope,value),c=store.remember(scope,value);assert.equal(store.read([a],scope).context.length,0);assert.equal(store.read([b,c],scope).context.length,2);
 now=101;assert.deepEqual(store.read([c],scope),{context:[],reset:true});
});
test('a new request gets only the three requested eligible turns and may advance its cutoff',()=>{
 const store=conversationStore(),ids=[1,2,3,4].map(n=>store.remember({...scope,throughSequence:n},{...value,question:`Question ${n}`,throughSequence:n}));
 assert.deepEqual(store.read(ids,{...scope,throughSequence:4}).context.map(t=>t.question),['Question 2','Question 3','Question 4']);
 assert.deepEqual(store.read(ids,{...scope,throughSequence:2}).context.map(t=>t.question),['Question 2']);
});
