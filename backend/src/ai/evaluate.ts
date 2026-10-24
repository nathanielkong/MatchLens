import {connect} from '../db/connection.js';
import {loadEvidencePacket} from './service.js';
import {ProjectAgentClient,projectConfig} from './project.js';
import {postgresBudget} from './budget.js';
import {runQuestionWorkflow} from './questions.js';
import {evaluationCases} from './evaluation-cases.js';
// Opt-in live inference uses the existing accounting and review path. It prints
// aggregate diagnostics only, never writes a report or changes model parameters.
if(!process.argv.includes('--live'))console.log(JSON.stringify({live:false,cases:evaluationCases.length,usage:'Use --live --limit=3 with a running database. Existing request limits apply. Human review is still required.'}));
else{
 const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]??3);if(!Number.isInteger(limit)||limit<1||limit>evaluationCases.length)throw new Error(`Choose a limit from 1 to ${evaluationCases.length}.`);
 const db=connect('app');try{
  const id='showcase-v2.0.0-1',events=(await db.query('SELECT sequence,clock_seconds,type FROM replay_events WHERE match_id=$1 ORDER BY sequence',[id])).rows;
  const cutoffs={start:1,early:events.filter(e=>e.clock_seconds<=900).at(-1)!.sequence,halftime:events.find(e=>e.type==='halftime')!.sequence,late:events.filter(e=>e.clock_seconds<=4800).at(-1)!.sequence,fulltime:events.at(-1)!.sequence};
  const agent=new ProjectAgentClient(projectConfig(),postgresBudget(db));
  let completed=0,failed=0;
  for(const [name,stage,question,expected] of evaluationCases.slice(0,limit)){
   if(completed>0)await new Promise(resolve=>setTimeout(resolve,61000));
   const {packet}=await loadEvidencePacket(db,id,cutoffs[stage],'casual',question),start=performance.now();
   try{const answer=await runQuestionWorkflow(agent,packet,'quality-eval',question);const ids=answer.result.claims.map(c=>c.id),accepted=answer.result.verification.accepted,coverage=expected.length?accepted&&expected.every(f=>ids.includes(f)):!accepted;if(!coverage)failed++;console.log(JSON.stringify({name,accepted,coverage,milliseconds:Math.round(performance.now()-start),cached:answer.cached}));}
   catch{failed++;console.log(JSON.stringify({name,completed:false}));}
   completed++;
  }
  console.log(JSON.stringify({completed,failed,humanReviewRequired:true}));if(failed)process.exitCode=1;
 }finally{await db.end();}
}
