import {initialObservation,observe,predict,type EvidenceEvent,type Model,type Chances} from '../probability/core.js';
import {model} from '../probability/inference.js';
// Fixed before reference evaluation; never fitted to hidden showcase labels.
export const turningPointMethod={version:'probability-shift-v1',threshold:.08,definition:'A shot or red card changing any final-result probability by at least 8 percentage points at the same match clock.'};
export type TurningPoint={sequence:number;atSeconds:number;period:number;kind:'goal'|'red_card'|'shot';teamId:string|null;outcome:string|null;before:Chances;after:Chances;largestShift:number;shiftedOutcome:keyof Chances;evidenceSequences:number[]};
export function detectTurningPoints(source:EvidenceEvent[],homeId:string,throughSequence:number,parameters:Model=model):TurningPoint[]{
 const observation=initialObservation(),points:TurningPoint[]=[];
 for(const event of source.filter(e=>e.sequence<=throughSequence).sort((a,b)=>a.sequence-b.sequence)){
  const eligible=event.type==='shot'||event.type==='red_card';
  // Compare identical clocks so time passing cannot create a jump.
  const baseline={...observation,time:event.clock_seconds,period:event.period,periodClock:Number(event.details.periodClockSeconds??event.clock_seconds)};
  const before=eligible?predict(baseline,parameters):null;
  observe(observation,event,homeId);
  if(!before)continue;
  const after=predict(observation,parameters),outcomes=['home','draw','away'] as const;
  const shiftedOutcome=outcomes.reduce((best,key)=>Math.abs(after[key]-before[key])>Math.abs(after[best]-before[best])?key:best);
  const largestShift=Math.abs(after[shiftedOutcome]-before[shiftedOutcome]);
  if(largestShift+1e-12<turningPointMethod.threshold)continue;
  points.push({sequence:event.sequence,atSeconds:event.clock_seconds,period:event.period,kind:event.type==='red_card'?'red_card':event.outcome==='goal'?'goal':'shot',teamId:event.team_id,outcome:event.outcome,before,after,largestShift,shiftedOutcome,evidenceSequences:[event.sequence]});
 }
 return points;
}
