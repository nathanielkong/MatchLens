import {matchMoments} from './moments';
import type {Match,State} from './types';
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const short=(name:string)=>name.replace(/^MatchLens /,'');
export function TurningPointsPanel({state,match,onSeek,preview}:{state:State|null|undefined;match:Match;onSeek:(sequence:number)=>void;preview:boolean}){
 const points=matchMoments(state?.keyEvents??[],state?.turningPoints?.points??[],state?.throughSequence??0),names={home:short(match.home_team),draw:'Draw',away:short(match.away_team)};
 return <section className="panel turning-panel" aria-label="Match moments">
  <div className="turning-heading"><div><p className="eyebrow">WHEN THE OUTLOOK CHANGES</p><h3>Moments to revisit.</h3><p>Goals, dismissals and large probability changes.</p></div><span className="turning-count">{points.length.toString().padStart(2,'0')} <small>moments so far</small></span></div>
  {points.length?<div className="turning-list">{points.slice(-6).reverse().map(point=>{const shift=point.shift;return <article key={point.sequence}>
   <button className="turning-jump" onClick={()=>onSeek(point.sequence)} aria-label={`Replay ${point.kind.replace('_',' ')} at ${clock(point.atSeconds)}`}><span>{clock(point.atSeconds)}</span>↗</button>
   <div><h4>{point.kind==='goal'?'Goal':point.kind==='red_card'?'Dismissal':'A shot moves the estimate'}</h4>{shift?<><p>{names[shift.shiftedOutcome]} {shift.shiftedOutcome==='draw'?'probability':'win probability'} · {(shift.before[shift.shiftedOutcome]*100).toFixed(1)}% → {(shift.after[shift.shiftedOutcome]*100).toFixed(1)}%</p><details><summary>Model evidence · Event {point.sequence}</summary><p>Same clock, before and after this event. {(['home','draw','away'] as const).map(key=>`${names[key]}: ${(shift.before[key]*100).toFixed(1)}% → ${(shift.after[key]*100).toFixed(1)}%`).join(' · ')}. The shift includes the observed score, shot xG or red card update; it does not establish a tactical cause.</p></details></>:<p>Recorded event · below the 8-point shift threshold.</p>}</div>
   {shift&&<strong className="turning-delta">{(shift.largestShift*100).toFixed(1)}<small>percentage points</small></strong>}
  </article>;})}</div>:<p className="turning-empty">{preview?'Turning-point analysis is available in the connected match library.':!state?'Loading match evidence…':'No goals, dismissals or large shifts yet.'}</p>}
  <details className="room-details"><summary>About detected shifts</summary><p>{points.length>6?`Showing the latest 6 of ${points.length} moments. `:''}Goals and dismissals are recorded events. Other candidates require an 8-point model shift; this is not proof of tactical importance. Time passing and the full-time whistle are excluded. Future events are hidden when you rewind. <a href="/turning-point-evaluation.json" target="_blank" rel="noreferrer">Reference evaluation ↗</a></p></details>
 </section>;
}
