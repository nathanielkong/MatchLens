import {useEffect,useRef,useState} from 'react';
import {ReviewDetails} from './ReviewDetails';
import type {State} from './types';
type Insight={question?:string;refusal?:string;matchId:string;throughSequence:number;atSeconds:number;audience:'casual'|'analyst';label:string;
 claims:{id:string;text:string;whyItMatters?:string;sourceText?:string;evidenceSequences:number[];prefix:{fromSequence:number;throughSequence:number}}[];
 verification:{accepted:boolean;method:string}};
type Result={result:Insight;cached:boolean};
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const factNames:Record<string,string>={score:'Score',chances:'Chances',pressing:'Pressing',passing:'Passing',discipline:'Cards','latest-goal':'Latest goal','turning-point':'Probability shift',tactics:'Tactics',substitutions:'Substitutions',goals:'Goals',formations:'Formations',probabilities:'Result estimates',periods:'Half comparisons',players:'Player contributions',changes:'Recorded changes'};
const errors:Record<string,string>={AI_OUTPUT_LIMIT:'The answer reached its response limit and was withheld.',AI_DISABLED:'AI is switched off in the backend.',AI_DAILY_LIMIT:'Today’s AI allowance has been reached. Cached results remain available.',AI_RATE_LIMIT:'Please wait a minute before requesting another answer.',AI_BUSY:'An insight is already being generated. Please wait.',AI_VERIFICATION_FAILED:'The answer did not pass verification and has been withheld.',AI_AZURE_AUTH_OR_AGENT_ACCESS:'The backend needs Azure sign-in or access to the configured agent.',AI_NO_EVIDENCE:'Play a little further to collect match evidence.',AI_REVIEW_LOG_UNAVAILABLE:'The review could not be saved. Please try again.'};
function GroundedText({value,onSeek}:{value:Result;onSeek:(n:number)=>void}){
 const {result,cached}=value;
 return <div className="grounded-text"><p className="evidence-time">Through {clock(result.atSeconds)} elapsed · {cached?'Saved result':'AI-written'} · {result.verification.accepted?'Reviewed':'Evidence unavailable'}</p>
  {result.refusal?<p className="summary-paragraph" role="status">{result.refusal}</p>:<><p className="summary-paragraph">{result.claims.map(c=>[c.text,c.whyItMatters].filter(Boolean).join(' ')).join(' ')}</p>
   <details className="summary-sources"><summary>Sources · {result.claims.length} {result.claims.length===1?'fact':'facts'}</summary><ol>{result.claims.map(c=><li key={c.id}><strong>{factNames[c.id]??'Evidence'}</strong><p>{c.sourceText??c.text}</p><div className="insight-citations">{c.evidenceSequences.map(n=><button key={n} onClick={()=>onSeek(n)}>Event {n} ↗</button>)}</div></li>)}</ol></details></>}
 </div>;
}
export function InsightsPanel({matchId,state,onSeek,onPause,preview}:{matchId:string;state:State|null|undefined;onSeek:(sequence:number)=>void;onPause:()=>void;preview:boolean}){
 const [audience,setAudience]=useState<'casual'|'analyst'>('casual'),[busy,setBusy]=useState<'summary'|'question'|''>(''),[error,setError]=useState(''),[errorKind,setErrorKind]=useState('');
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<Result|null>(null),[summary,setSummary]=useState<Result|null>(null);
 const [ready,setReady]=useState(false),requestId=useRef(0),sequence=state?.throughSequence??0;
 useEffect(()=>{if(preview)return;const c=new AbortController();fetch('/api/ai/status',{signal:c.signal}).then(r=>r.json()).then(s=>setReady(s.configured&&s.enabled)).catch(()=>undefined);return()=>c.abort();},[preview]);
 useEffect(()=>{requestId.current++;setAnswer(null);setSummary(null);setError('');setBusy('');setQuestion('');},[matchId,audience]);
 async function generate(ask=false){
  if(busy||!sequence||(ask&&question.trim().length<5))return;
  onPause();const id=++requestId.current,kind=ask?'question':'summary';setBusy(kind);setError('');setErrorKind(kind);if(ask)setAnswer(null);else setSummary(null);
  try{
   const response=await fetch(`/api/matches/${encodeURIComponent(matchId)}/${ask?'questions':'insights'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({throughSequence:sequence,audience,...(ask?{question:question.trim()}:{})}),signal:AbortSignal.timeout(260000)});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'AI_UNAVAILABLE');
   if(id===requestId.current){if(ask)setAnswer(body);else setSummary(body);}
  }catch(e){if(id===requestId.current)setError(errors[e instanceof Error?e.message:'']??'The answer is unavailable. No unverified text was shown.');}
  finally{window.dispatchEvent(new Event('matchlens-reviews-updated'));if(id===requestId.current)setBusy('');}
 }
 // Both outputs must independently disappear when the user rewinds before them.
 const visible=(value:Result|null)=>value&&value.result.matchId===matchId&&value.result.audience===audience&&value.result.throughSequence<=sequence?value:null;
 const visibleSummary=visible(summary),visibleAnswer=visible(answer);
 return <section className="panel insights-panel" aria-label="Evidence summary">
  <div className="panel-heading"><div><p className="eyebrow muted">03 / EVIDENCE TO AIR</p><h3>The match so far.</h3></div>
  <div className="segmented" aria-label="Summary audience"><button aria-pressed={audience==='casual'} onClick={()=>setAudience('casual')}>Casual</button><button aria-pressed={audience==='analyst'} onClick={()=>setAudience('analyst')}>Analyst</button></div></div>
  <div className="insights-content">
   {visibleSummary?<GroundedText value={visibleSummary} onSeek={onSeek}/>:<p className="insight-empty">{preview?'Connect a match to use AI summaries.':busy==='summary'?'Writing and checking…':'Score, chances and key developments in one summary.'}</p>}
   {error&&errorKind==='summary'&&<p className="insight-error" role="alert">{error}</p>}
   <div className="insights-actions"><button className="primary-link" disabled={preview||!ready||!!busy||!sequence} onClick={()=>generate()}>{busy==='summary'?'Checking evidence…':'Generate summary'} <span aria-hidden="true">↗</span></button>{(preview||!ready)&&<small>{preview?'Sample preview':'AI unavailable'}</small>}</div>
   <form className="match-question" onSubmit={e=>{e.preventDefault();void generate(true);}}>
    <label htmlFor="match-question">Ask about this match</label>
    <div><input id="match-question" value={question} onChange={e=>setQuestion(e.target.value)} minLength={5} maxLength={300} placeholder="Who came on, and what did they contribute?" disabled={preview||!!busy} required/><button type="submit" disabled={preview||!ready||!!busy||!sequence||question.trim().length<5}>{busy==='question'?'Checking…':'Ask MatchLens ↗'}</button></div>
   </form>
   {visibleAnswer&&<div className="match-answer" aria-label="Match answer"><p className="asked-question">{visibleAnswer.result.question}</p><GroundedText value={visibleAnswer} onSeek={onSeek}/></div>}
   {error&&errorKind==='question'&&<p className="insight-error" role="alert">{error}</p>}
   <p className="insight-disclaimer">AI can make mistakes. Check the linked evidence.</p>
   <ReviewDetails matchId={matchId} sequence={sequence} audience={audience} preview={preview} onSeek={onSeek}/>
  </div>
 </section>;
}
