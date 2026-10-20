import {StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {Pitch} from './Pitch';
import {useReplay} from './useReplay';
import {get,type Match,type Event,type TeamStats} from './types';
import type {Frame,VisualEvent} from './motion';
const emptyFrames:Frame[]=[],emptyEvents:VisualEvent[]=[];
const short=(name:string)=>name.replace('MatchLens ','');
const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const matchClock=(period:number,seconds:number)=>{
 const normal=period===1?seconds:2700+seconds;
 const boundary=period===1?2700:5400;
 return normal>boundary?`${period===1?45:90}+${clock(normal-boundary)}`:clock(normal);
};
function App(){
 const [matches,setMatches]=useState<Match[]>([]),[selected,setSelected]=useState('');
 const [libraryError,setLibraryError]=useState(''),[libraryLoading,setLibraryLoading]=useState(true),[retry,setRetry]=useState(0),[moments,setMoments]=useState(true);
 const match=matches.find(m=>m.id===selected);
 const {cursor,timeline,playing,speed,time,state,visual,players,error:replayError,busy,seek,jump,toggle,setSpeed}=useReplay(match,retry);
 const error=libraryError||replayError,loading=libraryLoading||busy;
 useEffect(()=>{const c=new AbortController();setLibraryError('');get<{matches:Match[]}>('/matches',c.signal).then(d=>{
  setMatches(d.matches);setSelected(id=>d.matches.some(m=>m.id===id)?id:d.matches[0]?.id??'');setLibraryLoading(false);
  if(!d.matches.length)setLibraryError('No showcase matches are available.');
 }).catch(e=>{if(!c.signal.aborted){setLibraryError(e.message);setLibraryLoading(false);}});return()=>c.abort();},[retry]);
 const choose=(id:string)=>setSelected(id);
 const stats=state?.statistics.teams??[],home=stats[0],away=stats[1];
 const visibleEvents=(moments?state?.keyEvents:state?.events)??[];
 const describe=(e:Event)=>{
  const name=players.find(p=>p.player_id===e.player_id)?.name;
  if(e.type==='shot')return `${e.outcome==='goal'?'Goal':e.outcome==='saved'?'Shot saved':e.outcome==='blocked'?'Shot blocked':'Shot off target'}${name?` · ${name}`:''}`;
  if(e.type==='substitution')return `Substitution · ${name??''}`;
  if(e.type==='tactic_change')return `Tactical change · ${String(e.details.tactic??'').replaceAll('_',' ')}`;
  return `${e.type.replaceAll('_',' ')}${name?` · ${name}`:''}`;
 };
 function row(label:string,key:keyof TeamStats,format:(n:number)=>string=String){
  const h=home?.[key],a=away?.[key];const hn=typeof h==='number'?h:0,an=typeof a==='number'?a:0;
  return <div className="stat-row" key={label}><div><strong>{typeof h==='number'?format(h):'—'}</strong><span>{label}</span><strong>{typeof a==='number'?format(a):'—'}</strong></div><div className="bar"><i style={{width:`${hn+an?hn/(hn+an)*100:50}%`,background:match?.home_color}}/><i style={{flex:1,background:match?.away_color}}/></div></div>;
 }
 return <main>
  <header className="topbar"><a className="brand" href="/" aria-label="MatchLens home"><span className="brand-mark">M<span>↗</span></span>MatchLens<span className="brand-sub">STUDIO</span></a><span className="status"><i/> Synthetic match replay</span></header>
  <div className="intro"><div><p className="eyebrow">THE MATCH, IN FOCUS</p><h1>Replay workspace</h1><p>Follow the game. Inspect every moment.</p></div><label className="match-select">SHOWCASE MATCH<select value={selected} onChange={e=>choose(e.target.value)} disabled={!matches.length}>{matches.map((m,i)=><option value={m.id} key={m.id}>{String(i+1).padStart(2,'0')} · {short(m.home_team)} vs {short(m.away_team)}</option>)}</select></label></div>
  {error&&<div className="error" role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
  {!match?<section className="panel empty">{loading?'Connecting to the match library…':'No match selected.'}</section>:<>
   <section className="scoreboard panel" aria-label="Match score"><div className="team"><span className="team-symbol" style={{background:match.home_color}}>{short(match.home_team).slice(0,2).toUpperCase()}</span><div><small>HOME</small><h2>{short(match.home_team)}</h2></div></div><div className="score"><div><b>{state?.statistics.score.home??'—'}</b><span>:</span><b>{state?.statistics.score.away??'—'}</b></div><span className="clock">{!state?'Loading evidence…':state.phase==='fulltime'?'FULL TIME':state.phase==='halftime'?'HALF TIME':`${state?.period===2?'2ND':'1ST'} HALF · ${matchClock(state?.period??1,(state?.periodClockSeconds??0)+Math.max(0,time-(state?.atSeconds??time)))}`}</span></div><div className="team away"><div><small>AWAY</small><h2>{short(match.away_team)}</h2></div><span className="team-symbol" style={{background:match.away_color}}>{short(match.away_team).slice(0,2).toUpperCase()}</span></div></section>
   <div className="replay-grid"><section className="panel pitch-panel"><div className="panel-heading"><h3>Pitch view</h3><span>{!visual?'Loading positions…':'Sampled positions · interpolated'}</span></div><Pitch frames={visual?.frames??emptyFrames} events={visual?.events??emptyEvents} match={match} players={players} cursor={cursor}/><div className="pitch-caption"><span><i style={{background:match.home_color}}/>{short(match.home_team)}<i style={{background:match.away_color}}/>{short(match.away_team)}</span><span>{visual?`Approximate motion · ${clock(time)} elapsed`:'Loading visual samples…'}</span></div>
    <div className="transport"><input aria-label="Replay timeline" type="range" min="0" max={match.duration_seconds} ref={timeline} defaultValue="0" step="any" onInput={e=>seek(Number(e.currentTarget.value))}/><div className="timeline-labels"><span>{clock(time)} elapsed</span><span>{clock(match.duration_seconds)}</span></div><div className="transport-buttons"><div><button aria-label="Restart replay" onClick={()=>seek(0)}>↺</button><button aria-label="Back 30 seconds" onClick={()=>seek(Math.max(0,time-30))}>−30s</button><button className="play" disabled={!state||!visual||!!error} onClick={toggle}>{playing?'Ⅱ Pause':'▶ Play'}</button><button aria-label="Next event" disabled={!state||busy||time>=match.duration_seconds} onClick={()=>jump((state?.throughSequence??0)+1)}>Next event →</button></div><label>Speed <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2,4,8,16,32].map(n=><option key={n} value={n}>{n}×</option>)}</select></label></div></div>
   </section><section className="panel statistics"><div className="panel-heading"><h3>Match statistics</h3><span>{state?`Evidence at ${clock(state.atSeconds)}`:'Loading evidence…'}</span></div><div className="stat-team-labels"><span>{short(match.home_team)}</span><span>{short(match.away_team)}</span></div>{row('Possession estimate*','possessionEstimate',n=>`${n.toFixed(1)}%`)}{row('Shots','shots')}{row('On target','shotsOnTarget')}{row('Synthetic xG','xg',n=>n.toFixed(2))}{row('Pass accuracy','passAccuracy',n=>`${n.toFixed(1)}%`)}{row('Passes completed','completedPasses')}{row('Pressing sequences','pressingSequences')}{row('Yellow cards','yellowCards')}{row('Red cards','redCards')}<p className="method-note">*Share of recorded action time, excluding restarts and stoppages. xG is synthetic. Pitch motion is interpolated for display only.</p></section></div>
   <section className="panel events-panel"><div className="panel-heading"><div><h3>Event feed</h3><span>Only events through this replay moment</span></div><div className="segmented"><button aria-pressed={moments} onClick={()=>setMoments(true)}>Key events</button><button aria-pressed={!moments} onClick={()=>setMoments(false)}>All events</button></div></div><div className="event-list">{visibleEvents.length?visibleEvents.map(e=><button className="event" key={e.sequence} onClick={()=>jump(e.sequence,e.clock_seconds)}><span className="event-time">{matchClock(e.period,Number(e.details.periodClockSeconds??0))}</span><span className={`event-icon ${e.outcome==='goal'?'goal':''}`}>{e.type==='shot'?'◎':e.type.includes('card')?'▰':e.type==='tactic_change'?'⇄':'·'}</span><span className="event-description">{describe(e)}<small>{e.team_id===match.home_team_id?short(match.home_team):e.team_id===match.away_team_id?short(match.away_team):'Match'} · Event {e.sequence}</small></span><span className="event-link">View moment ↗</span></button>):<div className="empty">{state?'No events in this filter yet. Play or seek forward.':'Loading match state…'}</div>}</div><div className="feed-footer">{moments?'All key events through this replay moment.':'Showing up to 100 recent events.'} Select an event to inspect its exact moment.</div></section>
   <footer className="workspace-footer"><span>FICTIONAL TEAMS · SYNTHETIC DATA</span><span>Evidence first. Every statistic follows the replay.</span></footer>
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
