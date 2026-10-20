import type {Frame,VisualEvent} from './motion';
export type Match={id:string;home_team_id:string;away_team_id:string;home_team:string;away_team:string;home_color:string;away_color:string;duration_seconds:number};
export type Player={player_id:string;team_id:string;name:string;shirt_number:number};
export type Event={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;player_id:string|null;outcome:string|null;details:Record<string,unknown>};
export type TeamStats={teamId:string;shots:number;shotsOnTarget:number;xg:number;passes:number;completedPasses:number;passAccuracy:number|null;possessionEstimate:number|null;pressingSequences:number;yellowCards:number;redCards:number};
export type State={matchId:string;atSeconds:number;throughSequence:number;period:number;periodClockSeconds:number;phase:string;statistics:{score:{home:number;away:number};possessionTeamId:string|null;teams:TeamStats[]};events:Event[];keyEvents:Event[]};
export type VisualReplay={purpose:'visual-only';containsFutureSamples:true;frames:Frame[];events:VisualEvent[]};
export async function get<T>(path:string,signal?:AbortSignal):Promise<T>{
 for(let attempt=0;;attempt++){
  const res=await fetch(`/api${path}`,{signal});
  if([502,503].includes(res.status)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));continue;}
  if(!res.ok)throw new Error(`Unable to load match data (${res.status}). Please retry.`);
  return res.json();
 }
}
