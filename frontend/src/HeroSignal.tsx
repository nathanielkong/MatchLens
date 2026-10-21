import {useEffect,useRef} from 'react';
import {ProbabilityIllustration} from './FeatureIllustrations';
export function HeroSignal(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const element=root.current!;const sync=(visible:boolean)=>element.classList.toggle('signal-running',visible&&!document.hidden);let visible=false;
 const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync(visible);});observer.observe(element);
 const visibility=()=>sync(visible);document.addEventListener('visibilitychange',visibility);
 return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};},[]);
 return <div className="hero-signal" ref={root} aria-label="Illustration of match signals becoming evidence and a story">
  <div className="signal-top"><span><i/> MATCH INTELLIGENCE</span><span>ILLUSTRATIVE REPLAY / 01</span></div>
  <div className="signal-stage" aria-hidden="true"><div className="signal-grid"/><div className="signal-orbit orbit-a"/><div className="signal-orbit orbit-b"/>
   <svg className="signal-pitch" viewBox="0 0 400 240" fill="none"><rect x="20" y="20" width="360" height="200" rx="4"/><path d="M200 20v200M20 70h65v100H20m360-100h-65v100h65"/><circle cx="200" cy="120" r="38"/><path className="signal-route" d="M70 163 128 88 203 125 287 63 339 112"/>
   {[[70,163],[128,88],[203,125],[287,63],[339,112]].map(([x,y],i)=><g key={i} className={`signal-player signal-player-${i}`}><circle cx={x} cy={y} r="7"/><circle cx={x} cy={y} r="12"/></g>)}
   </svg><div className="signal-focus"><span>m<span>↗</span></span><small>A DIFFERENT ANGLE.</small></div>
   <span className="signal-tag tag-a"><i/> MOMENT CAPTURED</span><span className="signal-tag tag-b">↗ EVIDENCE ATTACHED</span>
  </div>
  <div className="signal-story"><div><span className="micro-label">FROM THE PITCH TO THE STUDIO</span><h3>Find the shift.</h3><p>Then show why it matters.</p></div><div className="signal-wave"><ProbabilityIllustration/></div></div>
  <div className="signal-footer"><span>01 / OBSERVE</span><span>02 / UNDERSTAND</span><span>03 / EXPLAIN ↗</span></div>
 </div>;
}
export function RollingStat({to}:{to:number}){
 const root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{const element=root.current!,strip=element.querySelector<HTMLElement>('.stat-reel')!;
  const final=`translateY(${-100*to/(to+1)}%)`;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){strip.style.transform=final;return;}
  strip.style.transform='translateY(0)';let animation:Animation|undefined;
  const observer=new IntersectionObserver(([entry])=>{if(!entry.isIntersecting)return;
   animation=strip.animate([{transform:'translateY(0)'},{transform:final}],{duration:to*120+500,easing:`steps(${to}, end)`,fill:'forwards'});
   observer.disconnect();
  },{threshold:.6});observer.observe(element);
  return()=>{observer.disconnect();animation?.cancel();};
 },[to]);
 return <span ref={root} className="stat-counter" aria-label={String(to)}><span className="stat-reel" aria-hidden="true">{Array.from({length:to+1},(_,n)=><span key={n}>{n.toString().padStart(2,'0')}</span>)}</span></span>;
}
