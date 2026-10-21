import model from './model.json' with {type:'json'};
import {initialObservation,observe,predict,type EvidenceEvent} from './core.ts';
export {model};
export function probabilityHistory(events:EvidenceEvent[],homeId:string,atSeconds:number){
 const s=initialObservation(),history=[{time:0,sequence:0,...predict(s,model)}];let checkpoint=60;
 for(const e of events){
  observe(s,e,homeId);
  if(e.clock_seconds>=checkpoint||e.type==='red_card'||e.type==='shot'&&e.outcome==='goal'||e.type==='fulltime'){
   history.push({time:e.clock_seconds,sequence:e.sequence,...predict(s,model)});checkpoint=e.clock_seconds+60;
  }
 }
 const last=events.at(-1);s.periodClock+=Math.max(0,atSeconds-s.time);s.time=atSeconds;
 const current={time:atSeconds,sequence:last?.sequence??0,...predict(s,model)};
 if(history.at(-1)?.time===atSeconds&&history.at(-1)?.sequence===current.sequence)history[history.length-1]=current;else history.push(current);
 return {modelVersion:model.version,simulationEstimate:true,current,history};
}
