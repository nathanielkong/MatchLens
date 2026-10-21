import {writeFile} from 'node:fs/promises';
import {connect} from '../db/connection.js';
import {detectTurningPoints,turningPointMethod} from '../analytics/turning-points.js';
import {model} from '../probability/inference.js';
import type {EvidenceEvent} from '../probability/core.js';
import {anchorMetrics,type Anchor} from './metrics.js';
const app=connect('app'),admin=connect();
type Match={id:string;home_team_id:string;duration_seconds:number};
type Reference={match_id:string;event_sequence:number;kind:string;review_status:string};
try{
 // Runtime inputs use restricted credentials. Hidden references are only read by
 // this offline evaluator; they never enter detector arguments or HTTP responses.
 const matches=(await app.query<Match>('SELECT id,home_team_id,duration_seconds FROM replay_matches ORDER BY id')).rows;
 if(!matches.length)throw new Error('No showcase matches available');
 const coverage=(await admin.query<{match_id:string;objective_anchors:number;tactical_candidates:number}>('SELECT match_id,objective_anchors,tactical_candidates FROM simulation_private.turning_point_reviews WHERE reference_version=$1',['anchors-v1'])).rows;
 if(matches.some(m=>!coverage.some(r=>r.match_id===m.id)))throw new Error('Reference review coverage is incomplete; evaluation withheld');
 const refs=(await admin.query<Reference>(`SELECT t.match_id,t.event_sequence,t.kind,t.review_status FROM simulation_private.turning_points t JOIN replay_matches m ON m.id=t.match_id WHERE reference_version=$1`,['anchors-v1'])).rows;
 for(const match of matches){const review=coverage.find(r=>r.match_id===match.id)!;
  const labelled=refs.filter(r=>r.match_id===match.id);
  if(labelled.filter(r=>r.review_status==='objective_anchor').length!==review.objective_anchors||labelled.filter(r=>r.review_status==='candidate').length!==review.tactical_candidates)throw new Error('Reference rows disagree with review coverage; evaluation withheld');
 }
 const rows=(await app.query<EvidenceEvent&{match_id:string}>(`SELECT match_id,sequence,clock_seconds,period,type,team_id,outcome,home_score,away_score,jsonb_build_object('xg',details->'xg','periodClockSeconds',details->'periodClockSeconds') AS details FROM replay_events WHERE type IN ('shot','red_card','kickoff','halftime','fulltime') ORDER BY match_id,sequence`)).rows;
 const cutoffs=[0,900,1800,2700,3600,4500,5400,'fulltime'] as const;
 const summary=cutoffs.map(cutoff=>{
  const predictions:Anchor[]=[],references:Anchor[]=[],baseline:Anchor[]=[];
  let zeroAnchorMatches=0,emptyMatchesWithPredictions=0;const perMatch:ReturnType<typeof anchorMetrics>[]=[];
  matches.forEach((match,index)=>{
   const source=rows.filter(e=>e.match_id===match.id),events=source.filter(e=>e.clock_seconds<=(cutoff==='fulltime'?match.duration_seconds:cutoff));
   const sequence=events.at(-1)?.sequence??0;
   const points=detectTurningPoints(events,match.home_team_id,sequence);
   const truth=refs.filter(r=>r.match_id===match.id&&r.event_sequence<=sequence&&r.review_status!=='candidate'&&['goal','red_card'].includes(r.kind)).map(r=>({sequence:r.event_sequence,kind:r.kind}));
   const naive=events.filter(e=>e.type==='red_card'||e.type==='shot'&&e.outcome==='goal').map(e=>({sequence:e.sequence,kind:e.type==='red_card'?'red_card':'goal'}));
   perMatch.push(anchorMetrics(points,truth));
   if(!truth.length){zeroAnchorMatches++;if(points.length)emptyMatchesWithPredictions++;}
   // Namespaced synthetic sequence IDs avoid collisions between matches in micro metrics.
   const namespace=(items:Anchor[])=>items.map(p=>({...p,sequence:index*1000000+p.sequence}));
   predictions.push(...namespace(points));references.push(...namespace(truth));baseline.push(...namespace(naive));
  });
  return {cutoff, ...anchorMetrics(predictions,references),zeroAnchorMatches,emptyMatchesWithPredictions,
   macroRecall:perMatch.some(m=>m.recall!==null)?perMatch.filter(m=>m.recall!==null).reduce((sum,m)=>sum+m.recall!,0)/perMatch.filter(m=>m.recall!==null).length:null,
   byKind:Object.fromEntries(['goal','red_card','shot'].map(kind=>[kind,anchorMetrics(predictions.filter(p=>p.kind===kind),references.filter(r=>r.kind===kind))])),
   eventAnchorBaseline:anchorMetrics(baseline,references)};
 });
 const report={detector:turningPointMethod,probabilityModel:model.version,referenceVersion:'anchors-v1',matches:matches.length,
  eligibleReferences:refs.filter(r=>r.review_status!=='candidate'&&['goal','red_card'].includes(r.kind)).length,
  excludedTacticalCandidates:refs.filter(r=>r.review_status==='candidate').length,
  protocol:{thresholdChosenBeforeEvaluation:true,thresholdTunedOnReferences:false,matching:'Exact event sequence and kind, one-to-one within each match; references filtered at the same cutoff.',scope:'All showcase matches, including matches with zero anchors. Each cutoff is scored separately; repeated prefixes are not independent samples.',referenceLimit:'Goal/card anchors are derived from the same simulated event records, not independent human judgements of importance. A non-goal shot can be a plausible model shift but counts as unmatched in this limited anchor evaluation.',baselineLimit:'The all-goals/cards baseline matches the reference construction by definition; it is a coverage sanity check, not a competitive AI baseline.',notEvaluated:['Tactical causality','Human turning-point agreement','AI prose correctness','Real-football generalisation']},results:summary};
 const json=JSON.stringify(report,null,2)+'\n';
 await writeFile(new URL('../../../frontend/public/turning-point-evaluation.json',import.meta.url),json);
 await writeFile(new URL('../../../docs/turning-point-evaluation.json',import.meta.url),json);
 console.log(JSON.stringify({matches:report.matches,eligibleReferences:report.eligibleReferences,fulltime:summary.at(-1)},null,2));
}finally{await app.end();await admin.end();}
