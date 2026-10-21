import {useEffect,useRef,useState} from 'react';
import {advanceClock,type Cursor} from './motion';
import {get,type Match,type Player,type State,type VisualReplay} from './types';
// Deliberately separate from evidence/state responses. This cache is for drawing only.
const visualCache=new Map<string,{visual:VisualReplay;players:Player[]}>();
export function useReplay(match:Match|undefined,retry:number){
 const cursor=useRef<Cursor>({time:0}),timeline=useRef<HTMLInputElement>(null);
 const playingRef=useRef(false),speedRef=useRef(1),generation=useRef(0),request=useRef<AbortController|null>(null),lastKey=useRef('');
 const [playing,setPlaying]=useState(false),[speed,setSpeedState]=useState(1),[time,setTime]=useState(0);
 const [state,setState]=useState<State|null>(null),[visual,setVisual]=useState<VisualReplay|null>(null),[players,setPlayers]=useState<Player[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(true);
 const pause=()=>{playingRef.current=false;setPlaying(false);};
 const resetRequest=()=>{generation.current++;request.current?.abort();request.current=null;lastKey.current='';setState(null);};
 const seek=(seconds:number)=>{pause();resetRequest();cursor.current={time:Math.max(0,Math.min(match?.duration_seconds??0,seconds))};};
 const jump=(sequence:number,seconds?:number)=>{pause();resetRequest();cursor.current={time:seconds??cursor.current.time,sequence:Math.max(0,sequence)};setTime(cursor.current.time);};
 const toggle=()=>{if(playingRef.current){pause();return;}if(cursor.current.time>=(match?.duration_seconds??0))seek(0);
  cursor.current={time:cursor.current.time};playingRef.current=true;setPlaying(true);};
 const setSpeed=(value:number)=>{speedRef.current=value;setSpeedState(value);};
 useEffect(()=>{
  if(!match)return;
  const controller=new AbortController();let handle=0,previous=0,lastUi=-Infinity;
  pause();resetRequest();cursor.current={time:0};setTime(0);setVisual(null);setPlayers([]);setError('');setBusy(true);
  const preload=async()=>{
   let data=visualCache.get(match.id);
   if(!data){const [visual,lineup]=await Promise.all([get<VisualReplay>(`/matches/${match.id}/visual-replay`,controller.signal),get<{lineups:Player[]}>(`/matches/${match.id}/lineups`,controller.signal)]);
    data={visual,players:lineup.lineups};if(!controller.signal.aborted)visualCache.set(match.id,data);}
   if(!controller.signal.aborted){setVisual(data.visual);setPlayers(data.players);}
  };
  void preload().catch(e=>{if(!controller.signal.aborted){setError(e.message);pause();}});
  const refresh=()=>{
   if(request.current)return;
   const current=cursor.current,key=current.sequence===undefined?`atSeconds=${Math.floor(current.time)}`:`throughSequence=${current.sequence}`;
   if(lastKey.current===key)return;
   const version=generation.current,c=new AbortController();request.current=c;lastKey.current=key;setBusy(true);
   void get<State>(`/matches/${match.id}/state?${key}&includeFrame=false`,c.signal).then(data=>{
    if(c.signal.aborted||controller.signal.aborted||version!==generation.current)return;
    if(cursor.current.sequence!==undefined){cursor.current={time:data.atSeconds,sequence:data.throughSequence};setTime(data.atSeconds);}
    // An old response may lag forward playback, but can never cross a rewind.
    if(data.atSeconds<=cursor.current.time)setState(data);
   }).catch(e=>{if(!c.signal.aborted&&!controller.signal.aborted){setError(e.message);pause();}})
    .finally(()=>{if(request.current===c){request.current=null;setBusy(false);}});
  };
  const tick=(timestamp:number)=>{
   const dt=previous?(timestamp-previous)/1000:0;previous=timestamp;
   if(playingRef.current&&!document.hidden){cursor.current={time:advanceClock(cursor.current.time,dt,speedRef.current,match.duration_seconds)};
    if(cursor.current.time>=match.duration_seconds)pause();}
   if(timeline.current&&Number(timeline.current.value)!==cursor.current.time)timeline.current.value=String(cursor.current.time);
   if(timestamp-lastUi>=100){lastUi=timestamp;setTime(cursor.current.time);refresh();}
   handle=requestAnimationFrame(tick);
  };
  const visibility=()=>{previous=0;};document.addEventListener('visibilitychange',visibility);
  handle=requestAnimationFrame(tick);
  return()=>{controller.abort();request.current?.abort();request.current=null;generation.current++;cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',visibility);};
 },[match,retry]);
 return {cursor,timeline,playing,speed,time,state,visual,players,error,busy,seek,jump,toggle,setSpeed};
}
