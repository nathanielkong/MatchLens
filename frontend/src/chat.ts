export type ChatTurn={conversationId?:string;result:{matchId:string;audience:string;throughSequence:number}};
export function visibleChat<T extends ChatTurn>(turns:T[],matchId:string,audience:string,sequence:number):T[]{
 return turns.filter(t=>t.result.matchId===matchId&&t.result.audience===audience&&t.result.throughSequence<=sequence);
}
export function chatHistory(turns:ChatTurn[],matchId:string,audience:string,sequence:number):string[]{
 return visibleChat(turns,matchId,audience,sequence).flatMap(t=>t.conversationId?[t.conversationId]:[]).slice(-3);
}
export function appendChat<T extends ChatTurn>(turns:T[],next:T,reset=false):T[]{
 // Asking after a rewind creates a new branch; later answers stay out of it.
 const branch=visibleChat(turns,next.result.matchId,next.result.audience,next.result.throughSequence);
 return [...branch.map(t=>reset?{...t,conversationId:undefined}:t),next].slice(-8);
}
export function tabChatStorage():Storage|null{try{return globalThis.sessionStorage??null;}catch{return null;}}
export function readChat<T extends ChatTurn>(storage:Pick<Storage,'getItem'>|null,key:string):T[]{
 try{const raw=storage?.getItem(key);if(!raw||raw.length>180000)return [];const data=JSON.parse(raw);if(!Array.isArray(data)||data.length>8)return [];
  return data.filter(t=>t&&typeof t==='object'&&t.result&&typeof t.result.matchId==='string'&&['casual','analyst'].includes(t.result.audience)&&Number.isInteger(t.result.throughSequence)&&t.result.throughSequence>=1&&Number.isInteger(t.result.atSeconds)&&typeof t.result.verification?.accepted==='boolean'&&typeof t.result.question==='string'&&Array.isArray(t.result.claims)&&t.result.claims.length<=8&&t.result.claims.every((c:Record<string,unknown>)=>c&&typeof c.text==='string'&&typeof c.id==='string'&&Array.isArray(c.evidenceSequences)&&c.evidenceSequences.every(n=>Number.isInteger(n)&&Number(n)<=t.result.throughSequence)));
 }catch{return [];}
}
export function saveChat(storage:Pick<Storage,'setItem'>|null,key:string,turns:ChatTurn[]){try{const text=JSON.stringify(turns.slice(-8));if(text.length<=180000)storage?.setItem(key,text);}catch{/* Storage may be disabled or full. */}}
