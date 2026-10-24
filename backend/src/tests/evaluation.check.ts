// Fresh fixed seeds; no training, threshold tuning, database or report files.
import assert from 'node:assert/strict';
import {generate,scenarios} from '../synthetic/generator.js';
import {initialObservation,observe,predict,type EvidenceEvent} from '../probability/core.js';
import {model} from '../probability/inference.js';
import {detectTurningPoints} from '../analytics/turning-points.js';
import {random} from '../synthetic/random.js';
const scores:number[]=[],baselineScores:number[]=[];const byMinute=new Map<number,number[]>();
const coverage={goals:0,detectedGoals:0,reds:0,detectedReds:0};
for(let i=0;i<64;i++){
 const m=generate(9000000+i,scenarios[i%scenarios.length],i%8,(i+3)%8,{tracking:false,regime:i>=32?'stress':'standard'});
 const events:EvidenceEvent[]=m.events.map(e=>({sequence:e.sequence,clock_seconds:e.clock,period:e.period,type:e.type,team_id:e.teamId,outcome:e.outcome,home_score:e.homeScore,away_score:e.awayScore,details:e.details}));
 const final=events.at(-1)!,label=final.home_score>final.away_score?0:final.home_score===final.away_score?1:2;
 const error=(p:number[])=>p.reduce((s,v,k)=>s+(v-Number(k===label))**2,0);let total=0,baseline=0;
 for(const time of [0,900,1800,2700,3600,4500,5400]){
  const s=initialObservation();for(const e of events){if(e.clock_seconds>time)break;observe(s,e,`team-${i%8+1}`);}s.periodClock+=time-s.time;s.time=time;
  const p=Object.values(predict(s,model));assert.ok(p.every(v=>Number.isFinite(v)&&v>=0));assert.ok(Math.abs(p.reduce((a,b)=>a+b)-1)<1e-9);
  const loss=error(p);total+=loss;baseline+=error(Object.values(predict(s,{...model,priorSeconds:1e12,redEffect:0,temperature:1})));
  const list=byMinute.get(time)??[];list.push(loss);byMinute.set(time,list);
 }
 scores.push(total/7);baselineScores.push(baseline/7);
 const detected=new Set(detectTurningPoints(events,`team-${i%8+1}`,final.sequence).map(p=>p.sequence));
 for(const e of events)if(e.type==='shot'&&e.outcome==='goal'){coverage.goals++;coverage.detectedGoals+=Number(detected.has(e.sequence));}else if(e.type==='red_card'){coverage.reds++;coverage.detectedReds+=Number(detected.has(e.sequence));}
}
const mean=(x:number[])=>x.reduce((a,b)=>a+b,0)/x.length,rng=random(77001);
const bootstrap=Array.from({length:500},()=>{const indices=scores.map(()=>Math.floor(rng()*scores.length));return {loss:mean(indices.map(i=>scores[i])),difference:mean(indices.map(i=>scores[i]-baselineScores[i]))};});
const interval=(values:number[])=>{values.sort((a,b)=>a-b);return [values[12],values[487]];};
console.log(JSON.stringify({protocol:'64 fresh fixed matches; 32 standard, 32 stress; frozen model and 8-point threshold. Seven correlated snapshots per match. Paired bootstrap resamples whole matches; not real-football validation.',modelVersion:model.version,modelBrier:mean(scores),staticPoissonBrier:mean(baselineScores),matchBootstrap95:interval(bootstrap.map(v=>v.loss)),modelMinusBaseline95:interval(bootstrap.map(v=>v.difference)),byRegime:['standard','stress'].map((regime,i)=>({regime,matches:32,modelBrier:mean(scores.slice(i*32,(i+1)*32)),staticPoissonBrier:mean(baselineScores.slice(i*32,(i+1)*32))})),byMinute:[...byMinute].map(([seconds,v])=>({minute:seconds/60,brier:mean(v)})),eventAnchorCoverage:coverage,limitation:'Goal/card anchors are coverage checks. No independent human importance labels or AI prose grades.'},null,2));
