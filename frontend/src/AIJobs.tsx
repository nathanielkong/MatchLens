import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
type Job={label:string;started:number};
type Jobs={active:Job|null;begin:(label:string)=>(()=>void)|null};
const Context=createContext<Jobs|null>(null);
export function AIJobs({children}:{children:ReactNode}){
 const [active,setActive]=useState<Job|null>(null),lock=useRef<symbol|null>(null);
 const begin=(label:string)=>{if(lock.current)return null;const id=Symbol(label);lock.current=id;setActive({label,started:Date.now()});return()=>{if(lock.current===id){lock.current=null;setActive(null);}};};
 return <Context.Provider value={{active,begin}}>{children}</Context.Provider>;
}
export function useAIJobs(){const value=useContext(Context);if(!value)throw new Error('AIJobs provider is required');return value;}
export function AIProgress(){
 const {active}=useAIJobs(),[elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!active)return;setElapsed(0);const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-active.started)/1000)),1000);return()=>clearInterval(timer);},[active]);
 return active?<p className="ai-progress" role="status"><span className="live-dot"/>{active.label} · Writing and checking{elapsed>=5?` · ${elapsed}s`:''}</p>:null;
}
