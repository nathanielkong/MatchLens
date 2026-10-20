// Visual-only reconstruction. Never use these positions as analytical evidence.
export type Point={x:number;y:number};
export type Position=Point&{playerId:string;teamId:string};
export type Frame={through_sequence:number;clock_seconds:number;period:number;ball:Point;positions:Position[]};
export type VisualEvent={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;player_id:string|null;
 x:number|null;y:number|null;end_x:number|null;end_y:number|null;details:Record<string,unknown>};
export type Cursor={time:number;sequence?:number};
export type BallKeyframe=Point&{clock_seconds:number;period:number;through_sequence:number;priority:number};
export function upperBound<T extends {clock_seconds:number;through_sequence:number}>(items:T[],cursor:Cursor){
 let lo=0,hi=items.length;
 while(lo<hi){const mid=(lo+hi)>>>1,item=items[mid];
  if(item.clock_seconds<cursor.time||(item.clock_seconds===cursor.time&&item.through_sequence<=(cursor.sequence??Infinity)))lo=mid+1;else hi=mid;
 }
 return lo;
}
const mix=(a:Point,b:Point,k:number):Point=>({x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k});
export function positionsAt(cursor:Cursor,frames:Frame[],changes:VisualEvent[]=[]){
 const index=upperBound(frames,cursor)-1;if(index<0)return [];
 const a=frames[index],b=frames[index+1];
 const k=b&&a.period===b.period&&b.clock_seconds>a.clock_seconds?Math.min(1,Math.max(0,(cursor.time-a.clock_seconds)/(b.clock_seconds-a.clock_seconds))):0;
 const next=new Map(b?.positions.map(p=>[p.playerId,p]));
 const positions=new Map(a.positions.map(p=>[p.playerId,{...p,...mix(p,next.get(p.playerId)??p,k)}]));
 for(const e of changes){
  if(e.sequence<=a.through_sequence||e.clock_seconds>cursor.time||(e.clock_seconds===cursor.time&&e.sequence>(cursor.sequence??Infinity)))continue;
  if(e.type==='red_card'&&e.player_id)positions.delete(e.player_id);
  if(e.type==='substitution'){
   const out=String(e.details.outPlayerId),incoming=String(e.details.inPlayerId),old=positions.get(out);
   positions.delete(out);
   if(old){const target=next.get(incoming);const fraction=target&&b&&b.period===a.period&&b.clock_seconds>e.clock_seconds?
     Math.min(1,Math.max(0,(cursor.time-e.clock_seconds)/(b.clock_seconds-e.clock_seconds))):0;
    positions.set(incoming,{...old,playerId:incoming,...mix(old,target??old,fraction)});
   }
  }
 }
 return [...positions.values()];
}
export function globalPoint(x:number|null,y:number|null,event:VisualEvent):Point|null{
 if(x===null||y===null)return null;
 return event.details.attackDirection===-1?{x:100-x,y:100-y}:{x,y};
}
// Action time includes waiting/deciding. Reserve only the final distance/speed
// portion for pass/shot flight, ending at the recorded event timestamp.
export function ballTravelSeconds(e:VisualEvent):number{
 const action=Number(e.details.durationSeconds??0);
 if(!['pass','shot'].includes(e.type))return action;
 const speed=Number(e.type==='shot'?e.details.shotSpeedKmh:e.details.ballSpeedKmh);
 const a=globalPoint(e.x,e.y,e),b=globalPoint(e.end_x,e.end_y,e);
 if(!a||!b||!Number.isFinite(speed)||speed<=0)return action;
 const distance=Math.hypot((b.x-a.x)*1.05,(b.y-a.y)*.68);
 const flight=Math.max(.05,distance/(speed/3.6));
 return action>0?Math.min(action,flight):flight;
}
export function ballKeyframes(frames:Frame[],events:VisualEvent[]):BallKeyframe[]{
 const points:BallKeyframe[]=frames.map(f=>({...f.ball,clock_seconds:f.clock_seconds,period:f.period,through_sequence:f.through_sequence,priority:2}));
 for(const e of events){
  if(!['pass','shot','carry'].includes(e.type))continue;
  const start=globalPoint(e.x,e.y,e),end=globalPoint(e.end_x,e.end_y,e);
  const duration=ballTravelSeconds(e);
  if(start&&duration>0)points.push({...start,clock_seconds:Math.max(0,e.clock_seconds-duration),period:e.period,through_sequence:e.sequence,priority:0});
  if(end)points.push({...end,clock_seconds:e.clock_seconds,period:e.period,through_sequence:e.sequence,priority:1});
 }
 // A sampled ball location wins when several observations share a timestamp.
 return points.sort((a,b)=>a.clock_seconds-b.clock_seconds||a.priority-b.priority||a.through_sequence-b.through_sequence)
  .filter((p,i,all)=>i===all.length-1||p.clock_seconds!==all[i+1].clock_seconds);
}
export function ballAt(cursor:Cursor,points:BallKeyframe[]):Point|null{
 // The ball keyframes are a visual timeline, not an event/sequence evidence index.
 let lo=0,hi=points.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].clock_seconds<=cursor.time)lo=mid+1;else hi=mid;}
 const a=points[lo-1],b=points[lo];if(!a)return null;
 const k=b&&a.period===b.period&&b.clock_seconds>a.clock_seconds?Math.min(1,(cursor.time-a.clock_seconds)/(b.clock_seconds-a.clock_seconds)):0;
 return mix(a,b??a,k);
}
export function advanceClock(time:number,elapsedSeconds:number,speed:number,duration:number){
 return Math.max(0,Math.min(duration,time+Math.max(0,elapsedSeconds)*speed));
}
