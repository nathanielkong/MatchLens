import test from 'node:test';import assert from 'node:assert/strict';
import {appendChat,chatHistory,visibleChat} from '../src/chat.ts';
const turn=(throughSequence:number,conversationId=`turn-${throughSequence}`,matchId='match',audience='casual')=>({conversationId,result:{matchId,audience,throughSequence}});
test('visible chat and sent history omit future, other-match and other-audience answers',()=>{
 const turns=[turn(1),turn(2),turn(3),turn(4),turn(5,'other','other'),turn(5,'analyst','match','analyst')];
 assert.deepEqual(visibleChat(turns,'match','casual',2).map(t=>t.conversationId),['turn-1','turn-2']);assert.deepEqual(chatHistory(turns,'match','casual',4),['turn-2','turn-3','turn-4']);assert.deepEqual(chatHistory(turns,'match','casual',0),[]);
});
test('asking after rewind branches the chat and discards future context rather than resurrecting it',()=>{
 const next=appendChat([turn(1),turn(3),turn(8)],turn(3,'new-branch'));assert.deepEqual(next.map(t=>t.conversationId),['turn-1','turn-3','new-branch']);assert.ok(!chatHistory(next,'match','casual',10).includes('turn-8'));
});
test('expired backend context leaves readable turns but cannot be sent again; transcript has a bound',()=>{
 const reset=appendChat([turn(1)],turn(2),true);assert.equal(reset[0].conversationId,undefined);assert.deepEqual(chatHistory(reset,'match','casual',2),['turn-2']);
 let turns=[turn(1)];for(let i=2;i<=12;i++)turns=appendChat(turns,turn(i));assert.equal(turns.length,8);
});
