import type {Frame,VisualEvent} from './motion';
export type Match={id:string;home_team_id:string;away_team_id:string;home_team:string;away_team:string;home_color:string;away_color:string;duration_seconds:number};
export type Player={player_id:string;team_id:string;name:string;shirt_number:number};
export type Event={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;player_id:string|null;outcome:string|null;details:Record<string,unknown>};
export type TeamStats={teamId:string;shots:number;shotsOnTarget:number;xg:number;passes:number;completedPasses:number;passAccuracy:number|null;possessionEstimate:number|null;pressingSequences:number;yellowCards:number;redCards:number};
export type ProbabilityPoint={time:number;sequence:number;home:number;draw:number;away:number};
export type Probabilities={modelVersion:string;simulationEstimate:boolean;current:ProbabilityPoint;history:ProbabilityPoint[]};
export type TurningPoint={sequence:number;atSeconds:number;kind:'goal'|'red_card'|'shot';teamId:string|null;before:{home:number;draw:number;away:number};after:{home:number;draw:number;away:number};largestShift:number;shiftedOutcome:'home'|'draw'|'away';evidenceSequences:number[]};
export type PeriodAnalysis={version:string;throughSequence:number;periods:{period:number;status:'not_started'|'in_progress'|'complete';observedSeconds:number;eventCount:number;teams:(TeamStats&{goals:number})[]}[];limitations:string};
export type State={analysis?:PeriodAnalysis;turningPoints?:{version:string;threshold:number;definition:string;points:TurningPoint[]};probabilities?:Probabilities;matchId:string;atSeconds:number;throughSequence:number;period:number;periodClockSeconds:number;phase:string;statistics:{score:{home:number;away:number};possessionTeamId:string|null;teams:TeamStats[]};events:Event[];keyEvents:Event[]};
export type VisualReplay={purpose:'visual-only';containsFutureSamples:true;frames:Frame[];events:VisualEvent[]};
export async function get<T>(path:string,signal?:AbortSignal):Promise<T>{
 if(new URLSearchParams(window.location.search).get('preview')==='sample'){const {sampleResponse}=await import('./sample');return sampleResponse(path) as T;}
 for(let attempt=0;;attempt++){
  const timeout=AbortSignal.timeout(8000);
  const res=await fetch(`/api${path}`,{signal:signal?AbortSignal.any([signal,timeout]):timeout});
  if([502,503].includes(res.status)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));continue;}
  if(!res.ok)throw new Error(`Unable to load match data (${res.status}). Please retry.`);
  return res.json();
 }
}
