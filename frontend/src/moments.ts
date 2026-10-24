import type {Event,TurningPoint} from './types';
export type MatchMoment={sequence:number;atSeconds:number;kind:'goal'|'red_card'|'shot';shift?:TurningPoint};
// A recorded goal or dismissal stays visible even when it is below the model's
// fixed threshold. These two reasons for selection are never conflated.
export function matchMoments(events:Event[],points:TurningPoint[],throughSequence:number):MatchMoment[]{
 const result=new Map<number,MatchMoment>();
 for(const e of events)if(e.sequence<=throughSequence&&(e.type==='red_card'||e.type==='shot'&&e.outcome==='goal'))result.set(e.sequence,{sequence:e.sequence,atSeconds:e.clock_seconds,kind:e.type==='red_card'?'red_card':'goal'});
 for(const point of points)if(point.sequence<=throughSequence)result.set(point.sequence,{sequence:point.sequence,atSeconds:point.atSeconds,kind:point.kind,shift:point});
 return [...result.values()].sort((a,b)=>a.sequence-b.sequence);
}
