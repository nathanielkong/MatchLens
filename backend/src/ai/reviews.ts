import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {AIError,type ProjectAgentClient} from './project.js';
import type {EvidencePacket} from './evidence.js';
import {runInsightWorkflow} from './workflow.js';
import {runQuestionWorkflow} from './questions.js';

export type ReviewCheck={attempt:1|2;stage:'routing'|'draft'|'review';outcome:'passed'|'rejected'|'unsupported'|'unavailable';factIds:string[]};
export type ReviewSink=(check:ReviewCheck)=>void;
export type ReviewTask='summary'|'question'|'talking_point'|'recap';
// Save metadata only: never rejected prose, user questions, prompts or provider errors.
export async function reviewedWorkflow(db:Pick<Pool,'query'>,agent:Pick<ProjectAgentClient,'run'>,packet:EvidencePacket,clientId:string,question?:string,purpose:'summary'|'talking_point'|'recap'='summary'){
 const checks:ReviewCheck[]=[],started=performance.now(),id=randomUUID();
 const record:ReviewSink=check=>checks.push({...check,factIds:check.factIds.filter(id=>packet.facts.some(f=>f.id===id))});
 const save=async(outcome:string,cached:boolean)=>{
  try{await db.query('SELECT ai_record_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,packet.matchId,packet.throughSequence,packet.audience,question?'question':purpose,outcome,Math.min(600000,Math.max(0,Math.round(performance.now()-started))),cached,JSON.stringify(checks)]);}
  catch{throw new AIError('AI_REVIEW_LOG_UNAVAILABLE');}
 };
 let answer;
 try{answer=question?await runQuestionWorkflow(agent,packet,clientId,question,record):await runInsightWorkflow(agent,packet,clientId,undefined,purpose,record);}
 catch(error){await save(error instanceof AIError&&error.code==='AI_VERIFICATION_FAILED'?'withheld':'unavailable',false);throw error;}
 await save(answer.result.verification.accepted?(checks.some(c=>c.attempt===2)?'revised':'passed'):'unsupported',answer.cached);
 return {...answer,reviewId:id};
}
