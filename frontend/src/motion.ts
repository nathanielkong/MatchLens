// Visual-only reconstruction. Never use these positions as analytical evidence.
export type Point={x:number;y:number};
export type Position=Point&{playerId:string;teamId:string};
export type Frame={through_sequence:number;clock_seconds:number;period:number;ball:Point;positions:Position[]};
export type VisualEvent={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;player_id:string|null;
 x:number|null;y:number|null;end_x:number|null;end_y:number|null;outcome?:string|null;details:Record<string,unknown>};
export type Cursor={time:number;sequence?:number};
export type BallKeyframe=Point&{clock_seconds:number;period:number;through_sequence:number;priority:number;restart?:boolean};
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
 const points:BallKeyframe[]=frames.map(f=>({...f.ball,clock_seconds:f.clock_seconds,period:f.period,through_sequence:f.through_sequence,priority:0}));
 for(const e of events){
  if(['kickoff','throw_in','goal_kick','corner','free_kick'].includes(e.type)){
   const p=globalPoint(e.x,e.y,e);if(p)points.push({...p,clock_seconds:e.clock_seconds,period:e.period,through_sequence:e.sequence,priority:2,restart:true});continue;
  }
  if(!['pass','shot','carry'].includes(e.type))continue;
  const start=globalPoint(e.x,e.y,e),end=globalPoint(e.end_x,e.end_y,e);
  const duration=ballTravelSeconds(e);
  if(start&&duration>0)points.push({...start,clock_seconds:Math.max(0,e.clock_seconds-duration),period:e.period,through_sequence:e.sequence,priority:1});
  if(end)points.push({...end,clock_seconds:e.clock_seconds,period:e.period,through_sequence:e.sequence,priority:2});
 }
 // Action endpoints take priority over a post-action sample (which may already reflect a save or restart).
 return points.sort((a,b)=>a.clock_seconds-b.clock_seconds||a.priority-b.priority||a.through_sequence-b.through_sequence)
  .filter((p,i,all)=>i===all.length-1||p.clock_seconds!==all[i+1].clock_seconds);
}
export function ballAt(cursor:Cursor,points:BallKeyframe[]):Point|null{
 // The ball keyframes are a visual timeline, not an event/sequence evidence index.
 let lo=0,hi=points.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].clock_seconds<=cursor.time)lo=mid+1;else hi=mid;}
 const a=points[lo-1],b=points[lo];if(!a)return null;
 const k=b&&!b.restart&&a.period===b.period&&b.clock_seconds>a.clock_seconds?Math.min(1,(cursor.time-a.clock_seconds)/(b.clock_seconds-a.clock_seconds)):0;
 return mix(a,b??a,k);
}
export function advanceClock(time:number,elapsedSeconds:number,speed:number,duration:number){
 return Math.max(0,Math.min(duration,time+Math.max(0,elapsedSeconds)*speed));
}

// Visual anchors reconcile the generator's lead-pass endpoints with its separate
// formation samples. They do not change recorded events or feed any statistics.
export function playerKeyframes(frames:Frame[],events:VisualEvent[]){
 const paths=new Map<string,BallKeyframe[]>();
 const put=(id:string,p:Point,t:number,period:number,seq:number,priority:number)=>{const list=paths.get(id)??[];list.push({...p,clock_seconds:t,period,through_sequence:seq,priority});paths.set(id,list);};
 for(const f of frames)for(const p of f.positions)put(p.playerId,p,f.clock_seconds,f.period,f.through_sequence,0);
 for(const e of events){
  if(!['pass','carry','shot'].includes(e.type))continue;
  const start=globalPoint(e.x,e.y,e),end=globalPoint(e.end_x,e.end_y,e),release=Math.max(0,e.clock_seconds-ballTravelSeconds(e));
  if(start&&e.player_id)put(e.player_id,start,release,e.period,e.sequence,1);
  if(end&&e.type==='carry'&&e.player_id)put(e.player_id,end,e.clock_seconds,e.period,e.sequence,1);
  if(end&&e.type==='pass'&&e.outcome==='complete'&&typeof e.details.recipientId==='string')put(e.details.recipientId,end,e.clock_seconds,e.period,e.sequence,1);
 }
 for(const [id,points] of paths)paths.set(id,points.sort((a,b)=>a.clock_seconds-b.clock_seconds||a.period-b.period||a.priority-b.priority||a.through_sequence-b.through_sequence).filter((p,i,all)=>i===all.length-1||p.clock_seconds!==all[i+1].clock_seconds||p.period!==all[i+1].period));
 return paths;
}
type PlayerPaths=Map<string,BallKeyframe[]>;
// Keyframe maps are immutable after construction. Index each half once rather
// than filtering every player's entire match on every animation frame.
const periodIndexes=new WeakMap<PlayerPaths,Map<number,PlayerPaths>>();
function pathsForPeriod(paths:PlayerPaths,period:number){
 let index=periodIndexes.get(paths);
 if(!index){index=new Map();for(const [id,points] of paths)for(const point of points){
  let players=index.get(point.period);if(!players){players=new Map();index.set(point.period,players);}
  let samples=players.get(id);if(!samples){samples=[];players.set(id,samples);}samples.push(point);
 }periodIndexes.set(paths,index);}
 return index.get(period);
}
export function anchoredPositionsAt(cursor:Cursor,frames:Frame[],changes:VisualEvent[],paths:PlayerPaths){
 const currentFrame=frames[upperBound(frames,cursor)-1];
 if(!currentFrame)return [];
 const currentPaths=pathsForPeriod(paths,currentFrame.period);
 return positionsAt(cursor,frames,changes).map(p=>{
  const points=currentPaths?.get(p.playerId);if(!points)return p;
  const value=ballAt(cursor,points);
  return value?{...p,...value}:p;
 });
}
