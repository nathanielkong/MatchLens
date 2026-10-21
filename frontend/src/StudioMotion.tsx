import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ReactLenis,useLenis,type LenisRef} from 'lenis/react';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {useGSAP} from '@gsap/react';
import 'lenis/dist/lenis.css';
export {gsap,ScrollTrigger,useGSAP};
gsap.registerPlugin(ScrollTrigger,useGSAP);
export function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);
  media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return reduced;
}
function ScrollSync(){useLenis(()=>ScrollTrigger.update());return null;}
export function StudioMotion({children}:{children:ReactNode}){
 const ref=useRef<LenisRef>(null),reduced=useReducedMotion();
 useEffect(()=>{
  if(reduced)return;
  const tick=(time:number)=>ref.current?.lenis?.raf(time*1000);
  gsap.ticker.add(tick);gsap.ticker.lagSmoothing(0);
  return()=>{gsap.ticker.remove(tick);gsap.ticker.lagSmoothing(500,33);};
 },[reduced]);
 return <ReactLenis root ref={ref} options={{autoRaf:false,smoothWheel:!reduced,anchors:!reduced,duration:.9}}><ScrollSync/>{children}</ReactLenis>;
}
