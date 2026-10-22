import {useEffect,useState} from 'react';
type Check={attempt:1|2;stage:'routing'|'draft'|'review';outcome:'passed'|'rejected'|'unsupported'|'unavailable';factIds:string[]};
type Review={id:string;match_id:string;through_sequence:number;at_seconds:number;audience:string;task:string;outcome:string;elapsed_ms:number;cached:boolean;checks:Check[]};
const titles:Record<string,string>={summary:'Summary',question:'Question',talking_point:'Talking points',recap:'Recap'};
const outcomes:Record<string,string>={passed:'Passed',revised:'Revised & passed',withheld:'Withheld',unsupported:'No supporting facts',unavailable:'Unavailable'};
const facts:Record<string,string>={score:'Score',chances:'Shots',passing:'Passing',pressing:'Pressing',discipline:'Cards','latest-goal':'Latest goal','turning-point':'Probability shift',tactics:'Tactics',changes:'Changes',substitutions:'Substitutions',goals:'Goals',formations:'Formations',probabilities:'Result estimates',periods:'Half comparisons',players:'Players'};
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
export function ReviewDetails({matchId,sequence,audience,preview,onSeek}:{matchId:string;sequence:number;audience:string;preview:boolean;onSeek:(n:number)=>void}){
 const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const [history,setHistory]=useState<{key:string;items:Review[]}|null>(null),key=matchId+':'+audience;
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('matchlens-reviews-updated',refresh);return()=>window.removeEventListener('matchlens-reviews-updated',refresh);},[]);
 useEffect(()=>{
  if(!open||preview)return;
  const controller=new AbortController(),timer=setTimeout(()=>{
   setLoading(true);setError(false);
   fetch(`/api/matches/${encodeURIComponent(matchId)}/reviews?throughSequence=${sequence}&audience=${audience}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(body=>{if(!controller.signal.aborted)setHistory({key,items:body.reviews});}).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },350);
  return()=>{clearTimeout(timer);controller.abort();};
 },[open,preview,matchId,sequence,audience,key,revision]);
 // Filtering again during render prevents a late response exposing a later cutoff.
 const visible=history?.key===key?history.items.filter(r=>r.match_id===matchId&&r.audience===audience&&r.through_sequence<=sequence):[];
 return <details className="room-details review-details" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Review details</summary>
  <p>Recorded facts only. An automated check can still miss errors.</p>
  {open&&<div className="review-history" aria-label="AI review history">
   {preview?<p>Available with connected matches.</p>:error?<p role="status">Review history unavailable. Reopen to retry.</p>:<>
    <p className="review-history-label">Recent checks · {audience==='casual'?'Casual':'Analyst'} {loading&&<span role="status">· Loading…</span>}</p>
    {visible.length?visible.map(review=><details key={review.id} className="review-entry"><summary><span>{titles[review.task]??'AI result'} <time>{clock(review.at_seconds)}</time></span><span className={'review-outcome '+review.outcome}>{outcomes[review.outcome]??'Unavailable'}</span></summary>
     <div className="review-entry-body"><p>{review.cached?'Reused checked result':`${(review.elapsed_ms/1000).toFixed(1)}s`} · <button onClick={()=>onSeek(review.through_sequence)}>Replay moment ↗</button></p>
      <ol className="review-checks">{review.checks.map((check,i)=><li key={i}><span>{check.attempt===2?'Rewrite · ':''}{{routing:'Fact selection',draft:'Evidence checks',review:'Model review'}[check.stage]}</span><strong>{{passed:'Passed',rejected:'Rejected',unsupported:'No facts',unavailable:'Incomplete'}[check.outcome]}</strong>{check.factIds.length>0&&<small>{check.factIds.map(id=>facts[id]??'Evidence').join(' · ')}</small>}</li>)}</ol>
     </div></details>):<p>{loading?'Loading checks…':'No reviews recorded at this moment yet.'}</p>}
    {visible.length>0&&<p className="review-history-note">Latest 20 checks through this moment. Failed drafts stay hidden.</p>}
   </>}
  </div>}
 </details>;
}
