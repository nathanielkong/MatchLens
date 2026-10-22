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
