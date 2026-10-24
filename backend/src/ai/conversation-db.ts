import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {ConversationContext} from './conversation.js';
type Scope={matchId:string;audience:string;throughSequence:number;owner:string};
const owner=(value:string)=>createHash('sha256').update(value).digest('hex');
export function postgresConversationStore(db:Pick<Pool,'query'>){return {
 async read(ids:string[],scope:Scope){
  if(!ids.length)return {context:[] as ConversationContext[],reset:false};
  const unique=[...new Set(ids)].slice(-3),{rows}=await db.query('SELECT * FROM ai_conversation_read($1,$2,$3,$4,$5)',[unique,owner(scope.owner),scope.matchId,scope.audience,scope.throughSequence]);
  const context=unique.flatMap(id=>{const row=rows.find(r=>r.id===id);return row?[row.context as ConversationContext]:[];});
  return {context,reset:context.length!==unique.length};
 },
 async remember(scope:Scope,value:ConversationContext){
  const id=randomUUID(),context={...value,question:value.question.slice(0,600),answer:value.answer.slice(0,900),factIds:value.factIds.slice(0,8),playerIds:value.playerIds.slice(0,4),eventSequences:value.eventSequences.filter(n=>n<=scope.throughSequence).slice(-8)};
  await db.query('SELECT ai_conversation_save($1,$2,$3,$4,$5,$6)',[id,owner(scope.owner),scope.matchId,scope.audience,scope.throughSequence,JSON.stringify(context)]);return id;
 }
};}
