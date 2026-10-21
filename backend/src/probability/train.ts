import {writeFile,mkdir} from 'node:fs/promises';
import {connect} from '../db/connection.js';
import {initialObservation,observe,predict,type EvidenceEvent,type Model,type Observation} from './core.js';
const db=connect();
type Match={id:string;split:string;home_team_id:string;duration_seconds:number;home:number;away:number;weather:string};
try{
 const matches=(await db.query<Match>(`select m.id,d.split,m.home_team_id,m.duration_seconds,t.final_home_score as home,t.final_away_score as away, coalesce(m.metadata->>'weather','clear') weather from matches m join datasets d on d.id=m.dataset_id join simulation_private.match_truth t on t.match_id=m.id where d.active and d.split in ('train','validation','evaluation') order by m.id`)).rows;
 console.log(`Connected: ${matches.length} matches. Reading only shots, cards and period boundaries.`);
 const rows=(await db.query<EvidenceEvent&{match_id:string}>(`select e.match_id,e.sequence,e.clock_seconds,e.period,e.type,e.team_id,e.outcome,e.home_score,e.away_score,jsonb_build_object('xg',e.details->'xg','periodClockSeconds',e.details->'periodClockSeconds') details from events e join matches m on m.id=e.match_id join datasets d on d.id=m.dataset_id where d.active and d.split in ('train','validation','evaluation') and e.type in ('shot','red_card','kickoff','halftime','fulltime') order by e.match_id,e.sequence`)).rows;
 const byId=new Map<string,EvidenceEvent[]>();for(const e of rows){const list=byId.get(e.match_id)??[];list.push(e);byId.set(e.match_id,list);}
 console.log(`Read ${rows.length} relevant events. Fitting locally.`);
 const train=matches.filter(m=>m.split==='train'),mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
 const base:Model={version:'simulation-poisson-v1',homeGoals:mean(train.map(m=>m.home)),awayGoals:mean(train.map(m=>m.away)),meanDuration:mean(train.map(m=>m.duration_seconds)),firstAdded:mean(train.map(m=>byId.get(m.id)!.find(e=>e.type==='halftime')!.clock_seconds-2700)),secondAdded:0,priorSeconds:5400,redEffect:.2,temperature:1};
 base.secondAdded=base.meanDuration-5400-base.firstAdded;
 const cutoffs=[0,900,1800,2700,3600,4500,5400];
 type Row={matchId:string;split:string;time:number;label:number;observation:Observation};
 const examples:Row[]=matches.flatMap(m=>cutoffs.map(time=>{const s=initialObservation();for(const e of byId.get(m.id)??[]){if(e.clock_seconds>time)break;observe(s,e,m.home_team_id);}s.periodClock+=time-s.time;s.time=time;return {matchId:m.id,split:m.split,time,label:m.home>m.away?0:m.home===m.away?1:2,observation:s};}));
 const prior=[mean(train.map(m=>Number(m.home>m.away))),mean(train.map(m=>Number(m.home===m.away))),mean(train.map(m=>Number(m.home<m.away)))];
 function metrics(data:Row[],model:Model|null){let brier=0,logLoss=0,accuracy=0;const bins=Array.from({length:10},()=>({count:0,confidence:0,correct:0}));for(const r of data){const p=model?Object.values(predict(r.observation,model)):prior;for(let i=0;i<3;i++)brier+=(p[i]-Number(r.label===i))**2;logLoss-=Math.log(Math.max(1e-12,p[r.label]));const best=p.indexOf(Math.max(...p));accuracy+=Number(best===r.label);const bin=bins[Math.min(9,Math.floor(p[best]*10))];bin.count++;bin.confidence+=p[best];bin.correct+=Number(best===r.label);}return {brier:brier/data.length,logLoss:logLoss/data.length,accuracy:accuracy/data.length,ece:bins.reduce((sum,b)=>sum+Math.abs(b.confidence-b.correct),0)/data.length,bins:bins.map((b,i)=>({from:i/10,count:b.count,confidence:b.count?b.confidence/b.count:0,accuracy:b.count?b.correct/b.count:0}))};}
 const validation=examples.filter(e=>e.split==='validation');let best=Infinity,chosen=base;
 // Validation selects shrinkage/card adjustment; its labels never enter model inputs.
 for(const priorSeconds of [900,2700,5400,10800,21600])for(const redEffect of [0,.15,.35]){const model={...base,priorSeconds,redEffect};const loss=metrics(validation,model).logLoss;if(loss<best){best=loss;chosen=model;}}
 let bestT=Infinity;for(const temperature of [.7,.85,1,1.15,1.3,1.6]){const model={...chosen,temperature};const loss=metrics(validation,model).logLoss;if(loss<bestT){bestT=loss;chosen=model;}}
 const evaluation=examples.filter(e=>e.split==='evaluation');const report={model:chosen,createdAt:new Date().toISOString(),trainingMatches:1000,validationMatches:200,evaluationMatches:300,snapshotsPerMatch:cutoffs.length,cutoffs,selection:'Validation log loss; evaluation held out from fitting and model selection.',metrics:{validation:metrics(validation,chosen),evaluation:metrics(evaluation,chosen),constantPrior:metrics(evaluation,null),staticPoisson:metrics(evaluation,{...base,priorSeconds:1e12,redEffect:0,temperature:1})},byMinute:cutoffs.map(t=>({minute:t/60,...metrics(evaluation.filter(e=>e.time===t),chosen)})),limitations:['Same synthetic generator and eight fictional teams across splits; no real-world validity.','Independent Poisson remaining goals; synthetic xG and red-card multipliers are approximations.','Snapshots from a match are correlated; no confidence intervals are claimed.','No odds, financial advice or real-football calibration.','Fulltime is excluded from evaluation to avoid trivially correct terminal predictions.']};
 await writeFile(new URL('./model.json',import.meta.url),JSON.stringify(chosen,null,2)+'\n');
 await mkdir(new URL('../../../docs',import.meta.url),{recursive:true});
 await writeFile(new URL('../../../docs/probability-evaluation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 await mkdir(new URL('../../../frontend/public',import.meta.url),{recursive:true});
 await writeFile(new URL('../../../frontend/public/probability-evaluation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({model:chosen,evaluation:report.metrics.evaluation,constantPrior:report.metrics.constantPrior},null,2));
}finally{await db.end();}
