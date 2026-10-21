import {useEffect,useState,type ReactNode} from 'react';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {useGSAP} from '@gsap/react';
export {gsap,ScrollTrigger,useGSAP};
gsap.registerPlugin(ScrollTrigger,useGSAP);
export function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);
  media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return reduced;
}
// Native scrolling avoids adding another interpolation/ticker loop to trackpad input.
export function StudioMotion({children}:{children:ReactNode}){return <>{children}</>;}
