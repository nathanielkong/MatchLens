import {randomUUID} from 'node:crypto';
import type {Audience} from './evidence.js';
export type ConversationContext={question:string;answer:string;throughSequence:number;factIds:string[];playerIds:string[];eventSequences:number[];window?:{from:number;to:number}};
type Scope={matchId:string;audience:Audience;throughSequence:number;owner:string};
type Turn=ConversationContext&Scope&{expiresAt:number};
// Short-lived, bounded process memory. Only opaque IDs reach the browser;
// questions and answer excerpts are never added to the database audit log.
export function conversationStore(options:{now?:()=>number;ttlMs?:number;maxTurns?:number}={}){
 const turns=new Map<string,Turn>(),now=options.now??Date.now,ttl=options.ttlMs??8*60*60*1000,max=options.maxTurns??500;
 return {
  read(ids:string[],scope:Scope){
   const context:ConversationContext[]=[];let reset=false;
   for(const id of [...new Set(ids)].slice(-3)){
    const t=turns.get(id);
    if(!t||t.expiresAt<=now()||t.owner!==scope.owner||t.matchId!==scope.matchId||t.audience!==scope.audience||t.throughSequence>scope.throughSequence){reset=true;continue;}
    const {question,answer,throughSequence,factIds,playerIds,eventSequences,window}=t;
    context.push({question,answer,throughSequence,factIds,playerIds,eventSequences,window});
   }
   return {context,reset};
  },
  remember(scope:Scope,value:ConversationContext){
   for(const [id,t] of turns)if(t.expiresAt<=now())turns.delete(id);
   const id=randomUUID();turns.set(id,{...value,...scope,question:value.question.slice(0,600),answer:value.answer.slice(0,900),factIds:value.factIds.slice(0,8),playerIds:value.playerIds.slice(0,4),eventSequences:value.eventSequences.filter(n=>n<=scope.throughSequence).slice(-8),expiresAt:now()+ttl});
   while(turns.size>max)turns.delete(turns.keys().next().value!);
   return id;
  }
 };
}
