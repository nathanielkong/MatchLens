import {useEffect,useRef,useState} from 'react';
import type {State} from './types';
type Insight={question?:string;refusal?:string;matchId:string;throughSequence:number;atSeconds:number;audience:'casual'|'analyst';label:string;
 claims:{id:string;text:string;whyItMatters?:string;sourceText?:string;evidenceSequences:number[];prefix:{fromSequence:number;throughSequence:number}}[];
 verification:{accepted:boolean;method:string;trace?:{role:string;status:string}[]}};
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const errors:Record<string,string>={AI_DISABLED:'AI is switched off in the backend.',AI_DAILY_LIMIT:'Today’s AI allowance has been reached. Cached results remain available.',AI_RATE_LIMIT:'Please wait a minute before requesting another answer.',AI_BUSY:'An insight is already being generated. Please wait.',AI_VERIFICATION_FAILED:'The answer did not pass verification and has been withheld.',AI_AZURE_AUTH_OR_AGENT_ACCESS:'The backend needs Azure sign-in or access to the configured agent.',AI_NO_EVIDENCE:'Play a little further to collect match evidence.'};
export function InsightsPanel({matchId,state,onSeek,onPause,preview}:{matchId:string;state:State|null|undefined;onSeek:(sequence:number)=>void;onPause:()=>void;preview:boolean}){
 const [audience,setAudience]=useState<'casual'|'analyst'>('casual'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState<{result:Insight;cached:boolean}|null>(null);
 const [ready,setReady]=useState(false);const requestId=useRef(0);
 const sequence=state?.throughSequence??0;
 useEffect(()=>{if(preview)return;const c=new AbortController();fetch('/api/ai/status',{signal:c.signal}).then(r=>r.json()).then(s=>setReady(s.configured&&s.enabled)).catch(()=>undefined);return()=>c.abort();},[preview]);
 useEffect(()=>{requestId.current++;setAnswer(null);setError('');setBusy(false);setQuestion('');},[matchId,audience]);
 async function generate(ask=false){
  if(busy||!sequence||(ask&&question.trim().length<5))return;
  onPause();const id=++requestId.current;setBusy(true);setError('');setAnswer(null);
  try{
   const response=await fetch(`/api/matches/${encodeURIComponent(matchId)}/${ask?'questions':'insights'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({throughSequence:sequence,audience,...(ask?{question:question.trim()}:{})}),signal:AbortSignal.timeout(260000)});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'AI_UNAVAILABLE');
   if(id===requestId.current)setAnswer(body);
  }catch(e){if(id===requestId.current)setError(errors[e instanceof Error?e.message:'']??'The summary is unavailable. No unverified answer was shown.');}
  finally{if(id===requestId.current)setBusy(false);}
 }
 // Never display an insight from the future after the user rewinds.
 const visible=answer&&answer.result.throughSequence<=sequence?answer:null;
 return <section className="panel insights-panel" aria-label="Evidence summary">
  <div className="panel-heading"><div><p className="eyebrow muted">03 / EVIDENCE TO AIR</p><h3>A story you can check.</h3><span>A narrative agent explains. A separate verifier checks the evidence.</span></div>
  <div className="segmented" aria-label="Summary audience"><button aria-pressed={audience==='casual'} onClick={()=>setAudience('casual')}>Casual</button><button aria-pressed={audience==='analyst'} onClick={()=>setAudience('analyst')}>Analyst</button></div></div>
  <div className="insights-content">
   {visible?<><p className="evidence-time">Evidence through {clock(visible.result.atSeconds)} · Event {visible.result.throughSequence} · {visible.cached?'Cached result':'AI-written'} · {visible.result.verification.accepted?'Reviewed':'Evidence unavailable'}</p>
    {visible.result.question&&<p className="asked-question">{visible.result.question}</p>}
    {visible.result.refusal&&<p role="status">{visible.result.refusal}</p>}
    <div className="insight-claims">{visible.result.claims.map(claim=><article key={claim.id}><p>{claim.text}</p>{claim.whyItMatters&&<p className="insight-why">{claim.whyItMatters}</p>}{claim.sourceText&&<details className="insight-source"><summary>Inspect calculated evidence</summary><p>{claim.sourceText}</p></details>}<div className="insight-citations"><span>Calculated from events {claim.prefix.fromSequence}–{claim.prefix.throughSequence}</span>{claim.evidenceSequences.map(n=><button key={n} onClick={()=>onSeek(n)}>Event {n} ↗</button>)}</div></article>)}</div>
   </>:<p className="insight-empty">{preview?'AI summaries use the connected match library. The public sample remains available without model calls.':busy?'Writing the story, then reviewing every claim…':'Pause at a moment, choose your audience, and bring the evidence into focus.'}</p>}
   {error&&<p className="insight-error" role="alert">{error}</p>}
   <div className="insights-actions"><button className="primary-link" disabled={preview||!ready||busy||!sequence} onClick={()=>generate()}>{busy?'Checking evidence…':'Generate summary'} <span aria-hidden="true">↗</span></button><small>{preview?'Sample preview':!ready?'AI connection is not enabled.':'Runs only when requested · Model usage is billed'}</small></div>
   <form className="match-question" onSubmit={e=>{e.preventDefault();void generate(true);}}>
    <label htmlFor="match-question">Ask about this moment</label>
    <p>Try “Who is leading?” or “How does passing compare?” Answers use evidence through the selected minute.</p>
    <div><input id="match-question" value={question} onChange={e=>setQuestion(e.target.value)} minLength={5} maxLength={300} placeholder="What do the shots tell us so far?" disabled={preview||busy} required/><button type="submit" disabled={preview||!ready||busy||!sequence||question.trim().length<5}>Ask MatchLens ↗</button></div>
    <small>Score, shots, passing, pressing, red cards, latest goal and detected shifts · Each question is independent.</small>
   </form>
   {visible?.result.verification.trace&&<div className="agent-trace" aria-label="Agent workflow">{visible.result.verification.trace.map((step,i)=><span key={i}><b>{step.role}</b> {step.status}</span>)}</div>}<p className="method-note">Fictional match data. Schema, evidence-ID and numeric checks run alongside a separate model review. A model verifier can miss errors; inspect the original evidence. Answers cover the available fact catalogue. Model-based turning points are evaluated against event anchors. Tactical causes, forecasts and producer exports are not available.</p>
  </div>
 </section>;
}
