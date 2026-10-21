import {useEffect,useRef} from 'react';
export function HeroSignal(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const element=root.current!;const sync=(visible:boolean)=>element.classList.toggle('signal-running',visible&&!document.hidden);let visible=false;
 const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync(visible);});observer.observe(element);
 const visibility=()=>sync(visible);document.addEventListener('visibilitychange',visibility);
 return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};},[]);
 return <div className="hero-signal" ref={root} role="img" aria-label="Animated MatchLens logo">
  <div className="signal-stage" aria-hidden="true">
   <div className="signal-orbit orbit-a"/><div className="signal-orbit orbit-b"/>
   <div className="signal-focus"><span>m<span>↗</span></span></div>
  </div>
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
