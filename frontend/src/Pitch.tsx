import {memo,useEffect,useRef,type MutableRefObject} from 'react';
import {ballAt,ballKeyframes,globalPoint,positionsAt,type Cursor,type Frame,type VisualEvent} from './motion';
type Player={player_id:string;shirt_number:number;name:string};
type Match={home_team_id:string;home_color:string;away_color:string};
export const Pitch=memo(function Pitch({frames,events,match,players,cursor}:{frames:Frame[];events:VisualEvent[];match:Match;players:Player[];cursor:MutableRefObject<Cursor>}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
  const balls=ballKeyframes(frames,events),changes=events.filter(e=>e.type==='substitution'||e.type==='red_card');
  const passes=events.filter(e=>e.type==='pass'),shirts=new Map(players.map(p=>[p.player_id,p.shirt_number]));
  let handle=0,width=1,height=1,previous=-Infinity;
  let trail:{x:number;y:number;time:number}[]=[];
  const resize=()=>{const rect=el.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
   width=rect.width;height=rect.height;el.width=Math.round(width*dpr);el.height=Math.round(height*dpr);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const line=(points:number[],color='#c8e7d260',size=.32)=>{ctx.strokeStyle=color;ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);ctx.stroke();};
  const circle=(x:number,y:number,r:number,fill?:string,stroke?:string)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.32;ctx.stroke();}};
  const draw=()=>{
   const dpr=window.devicePixelRatio||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
   const scale=Math.min(width/117,height/80);ctx.translate((width-117*scale)/2,(height-80*scale)/2);ctx.scale(scale,scale);ctx.translate(6,6);
   ctx.fillStyle='#123c32';ctx.fillRect(-6,-6,117,80);ctx.fillStyle='#ffffff06';for(let i=0;i<10;i+=2)ctx.fillRect(i*10.5,0,10.5,68);
   ctx.strokeStyle='#c8e7d260';ctx.lineWidth=.32;ctx.strokeRect(0,0,105,68);line([52.5,0,52.5,68]);circle(52.5,34,9.15,undefined,'#c8e7d260');circle(52.5,34,.45,'#c8e7d260');
   for(const x of [0,105]){const direction=x===0?1:-1;for(const [w,h] of [[16.5,40.32],[5.5,18.32],[-2,7.32]])line([x,34-h/2,x+w*direction,34-h/2,x+w*direction,34+h/2,x,34+h/2]);circle(x+11*direction,34,.45,'#c8e7d260');}
   const current=cursor.current,t=current.time;
   if(t<previous||t-previous>2)trail=[];
   const ball=ballAt(current,balls);
   if(ball&&t!==previous)trail.push({...ball,time:t});previous=t;trail=trail.filter(p=>t-p.time<=1.5);
   for(let i=1;i<trail.length;i++){const p=trail[i-1],q=trail[i];line([p.x*1.05,p.y*.68,q.x*1.05,q.y*.68],`rgba(255,255,255,${Math.max(0,.42*(1-(t-q.time)/1.5))})`,.6);}
   for(const e of passes){if(e.clock_seconds>t||t-e.clock_seconds>1.5||(e.clock_seconds===t&&e.sequence>(current.sequence??Infinity)))continue;
    const a=globalPoint(e.x,e.y,e),b=globalPoint(e.end_x,e.end_y,e);if(a&&b){ctx.setLineDash([1.2,.9]);line([a.x*1.05,a.y*.68,b.x*1.05,b.y*.68],`rgba(191,239,202,${.65*(1-(t-e.clock_seconds)/1.5)})`,.4);ctx.setLineDash([]);}}
   for(const p of positionsAt(current,frames,changes)){
    circle(p.x*1.05,p.y*.68,1.8,p.teamId===match.home_team_id?match.home_color:match.away_color,'#eef5f2');
    ctx.fillStyle='#fff';ctx.font='700 1.65px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(shirts.get(p.playerId)??''),p.x*1.05,p.y*.68+.05);
   }
   if(ball){circle(ball.x*1.05,ball.y*.68,1.3,'#fff','#10251d');circle(ball.x*1.05,ball.y*.68,.35,'#10251d');}
   handle=requestAnimationFrame(draw);
  };handle=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(handle);observer.disconnect();};
 },[frames,events,match,players,cursor]);
 return <canvas ref={canvas} className="pitch" width={1170} height={800} role="img" aria-label="Interpolated simulated positions. Player shirt numbers and ball; motion is an approximation, not continuous tracking."/>;
});
