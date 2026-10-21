import {useEffect,useRef,useState} from 'react';
import type {State} from './types';
type Insight={matchId:string;throughSequence:number;atSeconds:number;audience:'casual'|'analyst';label:string;
 claims:{id:string;text:string;evidenceSequences:number[];prefix:{fromSequence:number;throughSequence:number}}[];
 verification:{accepted:boolean;method:string}};
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const errors:Record<string,string>={AI_DISABLED:'AI is switched off in the backend.',AI_DAILY_LIMIT:'Today’s AI allowance has been reached. Cached results remain available.',AI_RATE_LIMIT:'Please wait a minute before requesting another summary.',AI_BUSY:'An insight is already being generated. Please wait.',AI_VERIFICATION_FAILED:'The answer did not pass verification and has been withheld.',AI_AZURE_AUTH_OR_AGENT_ACCESS:'The backend needs Azure sign-in or access to the configured agent.',AI_NO_EVIDENCE:'Play a little further to collect match evidence.'};
export function InsightsPanel({matchId,state,onSeek,onPause,preview}:{matchId:string;state:State|null|undefined;onSeek:(sequence:number)=>void;onPause:()=>void;preview:boolean}){
 const [audience,setAudience]=useState<'casual'|'analyst'>('casual'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [answer,setAnswer]=useState<{result:Insight;cached:boolean}|null>(null);
 const [ready,setReady]=useState(false);const requestId=useRef(0);
 const sequence=state?.throughSequence??0;
 useEffect(()=>{if(preview)return;const c=new AbortController();fetch('/api/ai/status',{signal:c.signal}).then(r=>r.json()).then(s=>setReady(s.configured&&s.enabled)).catch(()=>undefined);return()=>c.abort();},[preview]);
 useEffect(()=>{requestId.current++;setAnswer(null);setError('');setBusy(false);},[matchId,audience]);
 async function generate(){
  if(busy||!sequence)return;
  onPause();const id=++requestId.current;setBusy(true);setError('');setAnswer(null);
  try{
   const response=await fetch(`/api/matches/${encodeURIComponent(matchId)}/insights`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({throughSequence:sequence,audience}),signal:AbortSignal.timeout(65000)});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'AI_UNAVAILABLE');
   if(id===requestId.current)setAnswer(body);
  }catch(e){if(id===requestId.current)setError(errors[e instanceof Error?e.message:'']??'The summary is unavailable. No unverified answer was shown.');}
  finally{if(id===requestId.current)setBusy(false);}
 }
 // Never display an insight from the future after the user rewinds.
 const visible=answer&&answer.result.throughSequence<=sequence?answer:null;
 return <section className="panel insights-panel" aria-label="Evidence summary">
  <div className="panel-heading"><div><p className="eyebrow muted">03 / EVIDENCE TO AIR</p><h3>A story you can check.</h3><span>AI selects talking points from verified match calculations.</span></div>
  <div className="segmented" aria-label="Summary audience"><button aria-pressed={audience==='casual'} onClick={()=>setAudience('casual')}>Casual</button><button aria-pressed={audience==='analyst'} onClick={()=>setAudience('analyst')}>Analyst</button></div></div>
  <div className="insights-content">
   {visible?<><p className="evidence-time">Evidence through {clock(visible.result.atSeconds)} · Event {visible.result.throughSequence} · {visible.cached?'Cached result':'AI-selected'} · Checked</p>
    <div className="insight-claims">{visible.result.claims.map(claim=><article key={claim.id}><p>{claim.text}</p><div className="insight-citations"><span>Calculated from events {claim.prefix.fromSequence}–{claim.prefix.throughSequence}</span>{claim.evidenceSequences.map(n=><button key={n} onClick={()=>onSeek(n)}>Event {n} ↗</button>)}</div></article>)}</div>
   </>:<p className="insight-empty">{preview?'AI summaries use the connected match library. The public sample remains available without model calls.':busy?'Selecting supported talking points and checking their evidence…':'Pause at a moment, choose your audience, and bring the evidence into focus.'}</p>}
   {error&&<p className="insight-error" role="alert">{error}</p>}
   <div className="insights-actions"><button className="primary-link" disabled={preview||!ready||busy||!sequence} onClick={generate}>{busy?'Checking evidence…':'Generate summary'} <span aria-hidden="true">↗</span></button><small>{preview?'Sample preview':!ready?'AI connection is not enabled.':'Runs only when requested · Model usage is billed'}</small></div>
   <p className="method-note">Fictional match data. The model chooses approved facts; the server checks the selection and publishes their original text. Free-form explanations, grounded Q&A and the full multi-agent workflow are still in development.</p>
  </div>
 </section>;
}
