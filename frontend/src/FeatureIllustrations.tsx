import {useRef,type RefObject} from 'react';
import {gsap,useGSAP} from './StudioMotion';
type Tween=ReturnType<typeof gsap.to>;
type Motion={track:(tween:Tween)=>void;forget:(tween:Tween)=>void;alive:()=>boolean};
// Decorative motion only. Suspend outside the viewport and in background tabs.
function useIllustrationMotion(root:RefObject<HTMLDivElement|null>,build:(motion:Motion)=>void){
 useGSAP(()=>{
  const mm=gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)',()=>{
   const element=root.current;if(!element)return;
   let visible=false,alive=true;const tweens=new Set<Tween>();
   const sync=()=>tweens.forEach(t=>t.paused(!visible||document.hidden));
   const motion:Motion={track:t=>{tweens.add(t);t.paused(!visible||document.hidden);},forget:t=>{tweens.delete(t);},alive:()=>alive};
   build(motion);
   const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.05});observer.observe(element);
   document.addEventListener('visibilitychange',sync);
   return()=>{alive=false;observer.disconnect();document.removeEventListener('visibilitychange',sync);tweens.forEach(t=>t.kill());};
  });
  return()=>mm.revert();
 },{scope:root});
}
export function ReplayIllustration(){
 const root=useRef<HTMLDivElement>(null);
 useIllustrationMotion(root,motion=>{
  root.current?.querySelectorAll<HTMLElement>('i').forEach(player=>{
   const wander=()=>{
    if(!motion.alive())return;
    const tween=gsap.to(player,{left:`${gsap.utils.random(9,86)}%`,top:`${gsap.utils.random(15,78)}%`,duration:gsap.utils.random(2.8,5.2),ease:'sine.inOut',paused:true,onComplete:()=>{motion.forget(tween);wander();}});
    motion.track(tween);
   };wander();
  });
 });
 return <div ref={root} className="feature-drawing pitch-drawing" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>;
}
const initialWaves=[[75,60,65,35,45,20,30,12,20],[25,30,20,55,45,65,55,78,70]];
const pathFor=(ys:number[])=>ys.map((y,i)=>`${i?'L':'M'}${i*300/(ys.length-1)},${y.toFixed(2)}`).join(' ');
export function ProbabilityIllustration(){
 const root=useRef<HTMLDivElement>(null);
 useIllustrationMotion(root,motion=>{
  root.current?.querySelectorAll<SVGPathElement>('path').forEach((path,index)=>{
   let previous=[...initialWaves[index]];
   const shift=()=>{
    if(!motion.alive())return;
    const next=previous.map(y=>gsap.utils.clamp(12,83,y+gsap.utils.random(-25,25))),state={progress:0};
    const tween=gsap.to(state,{progress:1,duration:gsap.utils.random(2.1,3.6),ease:'sine.inOut',paused:true,
     onUpdate:()=>path.setAttribute('d',pathFor(previous.map((y,i)=>y+(next[i]-y)*state.progress))),
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
