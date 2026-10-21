import {useRef,type RefObject} from 'react';
import {gsap,useGSAP} from './StudioMotion';
type Tween=ReturnType<typeof gsap.to>;
type Motion={track:(tween:Tween)=>void;forget:(tween:Tween)=>void;alive:()=>boolean};
// Decorative motion only. Suspend outside the viewport and in background tabs.
function useIllustrationMotion(root:RefObject<HTMLDivElement|null>,build:(motion:Motion)=>(()=>void)|void){
 useGSAP(()=>{
  const mm=gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)',()=>{
   const element=root.current;if(!element)return;
   let visible=false,alive=true;const tweens=new Set<Tween>();
   const sync=()=>tweens.forEach(t=>t.paused(!visible||document.hidden));
   const motion:Motion={track:t=>{tweens.add(t);t.paused(!visible||document.hidden);},forget:t=>{tweens.delete(t);},alive:()=>alive};
   const cleanup=build(motion);
   const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.05});observer.observe(element);
   document.addEventListener('visibilitychange',sync);
   return()=>{alive=false;cleanup?.();observer.disconnect();document.removeEventListener('visibilitychange',sync);tweens.forEach(t=>t.kill());};
  });
  return()=>mm.revert();
 },{scope:root});
}
export function ReplayIllustration(){
 const root=useRef<HTMLDivElement>(null);
 useIllustrationMotion(root,motion=>{
  const element=root.current;if(!element)return;
  const players=[...element.querySelectorAll<HTMLElement>('i')],initial=[[.2,.25],[.3,.65],[.45,.45],[.65,.2],[.73,.6],[.85,.4]];
  let width=element.clientWidth,height=element.clientHeight;
  const moves=new Map<HTMLElement,Tween>(),wanderers=new Map<HTMLElement,()=>void>();
  // Positions change with compositor transforms. Layout coordinates stay fixed.
  players.forEach((player,i)=>gsap.set(player,{left:0,top:0,x:initial[i][0]*width,y:initial[i][1]*height,xPercent:-50,yPercent:-50}));
  const resize=new ResizeObserver(()=>{
   const nextWidth=element.clientWidth,nextHeight=element.clientHeight;
   if(width===nextWidth&&height===nextHeight)return;
   width=nextWidth;height=nextHeight;
   players.forEach((player,i)=>{const current=moves.get(player);if(current){current.kill();motion.forget(current);}gsap.set(player,{x:initial[i][0]*width,y:initial[i][1]*height});wanderers.get(player)?.();});
  });resize.observe(element);
  players.forEach(player=>{
   const wander=()=>{
    if(!motion.alive())return;
    const tween=gsap.to(player,{x:()=>gsap.utils.random(.09,.86)*width,y:()=>gsap.utils.random(.15,.78)*height,duration:gsap.utils.random(2.8,5.2),ease:'sine.inOut',paused:true,onComplete:()=>{motion.forget(tween);moves.delete(player);wander();}});
    moves.set(player,tween);motion.track(tween);
   };wanderers.set(player,wander);wander();
  });
  return()=>resize.disconnect();
 });
 return <div ref={root} className="feature-drawing pitch-drawing" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>;
}
const initialWaves=[[75,60,65,35,45,20,30,12,20],[25,30,20,55,45,65,55,78,70]];
const pathFor=(ys:number[])=>ys.map((y,i)=>`${i?'L':'M'}${i*300/(ys.length-1)},${y.toFixed(2)}`).join(' ');
export function ProbabilityIllustration(){
 const root=useRef<HTMLDivElement>(null);
 useIllustrationMotion(root,motion=>{
  root.current?.querySelectorAll<SVGPathElement>('path').forEach((path,index)=>{
   let previous=[...initialWaves[index]],lastDraw=0;
   const shift=()=>{
    if(!motion.alive())return;
    const next=previous.map(y=>gsap.utils.clamp(12,83,y+gsap.utils.random(-25,25))),state={progress:0};
    const tween=gsap.to(state,{progress:1,duration:gsap.utils.random(.65,1.05),ease:'sine.inOut',paused:true,
     onUpdate:()=>{const now=performance.now();if(now-lastDraw<1000/30&&state.progress<1)return;lastDraw=now;path.setAttribute('d',pathFor(previous.map((y,i)=>y+(next[i]-y)*state.progress)));},
     onComplete:()=>{previous=next;motion.forget(tween);shift();}});
    motion.track(tween);
   };shift();
  });
 });
 return <div ref={root} className="feature-drawing wave-drawing" aria-hidden="true"><svg viewBox="0 0 300 95"><path d={pathFor(initialWaves[0])}/><path d={pathFor(initialWaves[1])}/></svg></div>;
}
export function NarrativeIllustration(){
 const root=useRef<HTMLDivElement>(null);
 useIllustrationMotion(root,motion=>{
  const quote=root.current?.querySelector('span'),lines=root.current?.querySelectorAll('div');
  if(quote)motion.track(gsap.to(quote,{y:-9,rotation:-7,transformOrigin:'50% 65%',duration:2.5,ease:'sine.inOut',repeat:-1,yoyo:true,paused:true}));
  lines?.forEach((line,index)=>motion.track(gsap.to(line,{scaleX:[.81,.91,.7][index],opacity:.55,transformOrigin:'left center',duration:1.8+index*.35,delay:index*.25,ease:'sine.inOut',repeat:-1,yoyo:true,paused:true})));
 });
 return <div ref={root} className="feature-drawing story-drawing" aria-hidden="true"><span>“</span><div/><div/><div/></div>;
}
