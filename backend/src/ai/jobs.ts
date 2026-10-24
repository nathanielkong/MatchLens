import {AIError} from './project.js';
// Hold the slot for the complete workflow, including evidence, routing, review
// and publication. Per-call database accounting remains the cross-process guard.
export function workflowGate(){
 let active=false;
 return async<T>(work:()=>Promise<T>)=>{if(active)throw new AIError('AI_BUSY',409);active=true;try{return await work();}finally{active=false;}};
}
