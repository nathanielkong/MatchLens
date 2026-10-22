import type {Match,State} from './types';
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const short=(name:string)=>name.replace(/^MatchLens /,'');
export function TurningPointsPanel({state,match,onSeek,preview}:{state:State|null|undefined;match:Match;onSeek:(sequence:number)=>void;preview:boolean}){
 const points=state?.turningPoints?.points??[],names={home:short(match.home_team),draw:'Draw',away:short(match.away_team)};
 return <section className="panel turning-panel" aria-label="Detected turning points">
  <div className="turning-heading"><div><p className="eyebrow">WHEN THE OUTLOOK CHANGES</p><h3>The moments that shift it.</h3><p>Shots and dismissals that move a result estimate by at least 8 percentage points.</p></div><span className="turning-count">{points.length.toString().padStart(2,'0')} <small>detected so far</small></span></div>
  {points.length?<div className="turning-list">{points.slice(-6).reverse().map(point=><article key={point.sequence}>
   <button className="turning-jump" onClick={()=>onSeek(point.sequence)} aria-label={`Replay ${point.kind.replace('_',' ')} at ${clock(point.atSeconds)}`}><span>{clock(point.atSeconds)}</span>↗</button>
   <div><h4>{point.kind==='goal'?'A goal changes the outlook':point.kind==='red_card'?'A dismissal shifts the balance':'A shot moves the estimate'}</h4><p>{names[point.shiftedOutcome]} {point.shiftedOutcome==='draw'?'probability':'win probability'} · {(point.before[point.shiftedOutcome]*100).toFixed(1)}% → {(point.after[point.shiftedOutcome]*100).toFixed(1)}%</p><details><summary>Model evidence · Event {point.sequence}</summary><p>Same clock, before and after this event. {(['home','draw','away'] as const).map(key=>`${names[key]}: ${(point.before[key]*100).toFixed(1)}% → ${(point.after[key]*100).toFixed(1)}%`).join(' · ')}. The shift includes the observed score, shot xG or red card update; it does not establish a tactical cause.</p></details></div>
   <strong className="turning-delta">{(point.largestShift*100).toFixed(1)}<small>percentage points</small></strong>
  </article>)}</div>:<p className="turning-empty">{preview?'Turning-point analysis is available in the connected match library.':!state?'Loading match evidence…':'No significant shifts yet.'}</p>}
  <details className="room-details"><summary>About detected shifts</summary><p>{points.length>6?`Showing the latest 6 of ${points.length} detected moments. `:''}Model-based candidates, not confirmed tactical turning points. Time passing and the full-time whistle are excluded. Future events are hidden when you rewind. <a href="/turning-point-evaluation.json" target="_blank" rel="noreferrer">Reference evaluation ↗</a></p></details>
 </section>;
}
