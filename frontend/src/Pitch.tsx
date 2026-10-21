import {memo,useEffect,useRef,type MutableRefObject} from 'react';
import {ballAt,ballKeyframes,globalPoint,anchoredPositionsAt,playerKeyframes,ballTravelSeconds,type Cursor,type Frame,type VisualEvent} from './motion';
type Player={player_id:string;shirt_number:number;name:string};
type Match={home_team_id:string;home_color:string;away_color:string};
export const Pitch=memo(function Pitch({frames,events,match,players,cursor}:{frames:Frame[];events:VisualEvent[];match:Match;players:Player[];cursor:MutableRefObject<Cursor>}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
  const paths=playerKeyframes(frames,events),balls=ballKeyframes(frames,events),changes=events.filter(e=>e.type==='substitution'||e.type==='red_card');
  const passes=events.filter(e=>e.type==='pass').map(event=>({event,start:event.clock_seconds-ballTravelSeconds(event),a:globalPoint(event.x,event.y,event),b:globalPoint(event.end_x,event.end_y,event)})),maxFlight=Math.max(0,...passes.map(p=>p.event.clock_seconds-p.start)),shirts=new Map(players.map(p=>[p.player_id,p.shirt_number]));
  let handle=0,width=1,height=1,previous=-Infinity,dirty=true,visible=false,paintedTime=NaN,paintedSequence:number|undefined;
  let trail:{x:number;y:number;time:number}[]=[];
  const resize=()=>{const rect=el.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
   width=rect.width;height=rect.height;el.width=Math.round(width*dpr);el.height=Math.round(height*dpr);dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const line=(points:number[],color='#c4c9e83d',size=.32)=>{ctx.strokeStyle=color;ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);ctx.stroke();};
  const circle=(x:number,y:number,r:number,fill?:string,stroke?:string)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.32;ctx.stroke();}};
  const draw=()=>{
   handle=0;if(!visible||document.hidden)return;
   handle=requestAnimationFrame(draw);
   const current=cursor.current,t=current.time;
   if(!dirty&&t===paintedTime&&current.sequence===paintedSequence)return;
   dirty=false;paintedTime=t;paintedSequence=current.sequence;
   const dpr=Math.min(window.devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
   const scale=Math.min(width/117,height/80);ctx.translate((width-117*scale)/2,(height-80*scale)/2);ctx.scale(scale,scale);ctx.translate(6,6);
   const field=ctx.createLinearGradient(0,0,105,68);field.addColorStop(0,'#29334c');field.addColorStop(1,'#202b43');ctx.fillStyle=field;ctx.fillRect(-6,-6,117,80);
   ctx.fillStyle='#ffffff02';for(let i=0;i<7;i++)ctx.fillRect(i*15,0,7.5,68);
   ctx.strokeStyle='#c4c9e83d';ctx.lineWidth=.32;ctx.strokeRect(0,0,105,68);line([52.5,0,52.5,68]);circle(52.5,34,9.15,undefined,'#c4c9e83d');circle(52.5,34,.45,'#c4c9e83d');
   for(const x of [0,105]){const direction=x===0?1:-1;for(const [w,h] of [[16.5,40.32],[5.5,18.32],[-2,7.32]])line([x,34-h/2,x+w*direction,34-h/2,x+w*direction,34+h/2,x,34+h/2]);circle(x+11*direction,34,.45,'#c4c9e83d');}
   if(t<previous||t-previous>2)trail=[];
   const ball=ballAt(current,balls);
   if(ball&&t!==previous)trail.push({...ball,time:t});previous=t;trail=trail.filter(p=>t-p.time<=1.5);
   for(let i=1;i<trail.length;i++){const p=trail[i-1],q=trail[i];line([p.x*1.05,p.y*.68,q.x*1.05,q.y*.68],`rgba(255,255,255,${Math.max(0,.42*(1-(t-q.time)/1.5))})`,.6);}
   // Consider only pass flights close to the current clock. Geometry is prepared once.
   let lo=0,hi=passes.length;
   while(lo<hi){const m=(lo+hi)>>>1;if(passes[m].event.clock_seconds<t-1.5)lo=m+1;else hi=m;}
   let activePass:VisualEvent|undefined;
   for(let i=lo;i<passes.length&&passes[i].event.clock_seconds<=t+maxFlight;i++){
    const {event:e,start,a,b}=passes[i];
    if(start>t||(e.clock_seconds===t&&e.sequence>(current.sequence??Infinity)))continue;
    if(t<=e.clock_seconds+1.2&&!activePass)activePass=e;
    if(a&&b){ctx.setLineDash([1.2,.9]);line([a.x*1.05,a.y*.68,b.x*1.05,b.y*.68],e.outcome==='incomplete'?`rgba(239,172,111,${.65*Math.min(1,1-(t-e.clock_seconds)/1.5)})`:`rgba(201,193,248,${.5*Math.min(1,1-(t-e.clock_seconds)/1.5)})`,.4);ctx.setLineDash([]);}
   }
   const receiverId=activePass?.outcome==='complete'?String(activePass.details.recipientId):null;
   const visiblePlayers=anchoredPositionsAt(current,frames,changes,paths).sort((a,b)=>Number(a.playerId===receiverId)-Number(b.playerId===receiverId));
   const playerRadius=Math.max(2.05,6.8/scale);
   for(const p of visiblePlayers){
    if(p.playerId===receiverId)circle(p.x*1.05,p.y*.68,playerRadius+.7,undefined,'#e8dcffcc');
    ctx.shadowColor='#0b10284d';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    circle(p.x*1.05,p.y*.68,playerRadius,p.teamId===match.home_team_id?'#c1b5f3':'#efbc91','#ffffff99');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle='#25263b';ctx.font=`600 ${Math.max(1.85,8.5/scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(shirts.get(p.playerId)??''),p.x*1.05,p.y*.68+.05);
   }
   if(activePass){ctx.font='500 1.3px system-ui';ctx.fillStyle=activePass.outcome==='incomplete'?'#e4b68d':'#c4b8e8';ctx.textAlign='left';ctx.fillText(t<activePass.clock_seconds?'PASS IN FLIGHT':activePass.outcome==='incomplete'?'INCOMPLETE PASS':'PASS COMPLETE',.5,-2.4);}
   if(ball){circle(ball.x*1.05,ball.y*.68,1.05,'#fff','#171d32');circle(ball.x*1.05,ball.y*.68,.28,'#171d32');}
  };
  const sync=()=>{if(visible&&!document.hidden){dirty=true;if(!handle)handle=requestAnimationFrame(draw);}else{cancelAnimationFrame(handle);handle=0;}};
  const viewport=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});viewport.observe(el);
  document.addEventListener('visibilitychange',sync);
  return()=>{cancelAnimationFrame(handle);observer.disconnect();viewport.disconnect();document.removeEventListener('visibilitychange',sync);};
 },[frames,events,match,players,cursor]);
 return <canvas ref={canvas} className="pitch" width={1170} height={800} role="img" aria-label="Interpolated simulated positions. Player shirt numbers and ball; motion is an approximation, not continuous tracking."/>;
});
