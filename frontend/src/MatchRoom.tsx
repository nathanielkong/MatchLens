import {MatchAnalysisPanel} from './MatchAnalysisPanel';
import {ProducerPanel} from './ProducerPanel';
import {TurningPointsPanel} from './TurningPointsPanel';
import {useEffect,useRef,useState} from 'react';
import {Pitch} from './Pitch';
import {useReplay} from './useReplay';
import {get,type Match,type Event,type TeamStats} from './types';
import type {Frame,VisualEvent} from './motion';
import {gsap,ScrollTrigger,useGSAP} from './StudioMotion';
import {ProbabilityPanel} from './ProbabilityPanel';
import {InsightsPanel} from './InsightsPanel';
const emptyFrames:Frame[]=[],emptyEvents:VisualEvent[]=[];
const short=(name:string)=>name.replace('MatchLens ','');
const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const matchClock=(period:number,seconds:number)=>{
 const normal=period===1?seconds:2700+seconds,boundary=period===1?2700:5400;
 return normal>boundary?`${period===1?45:90}+${clock(normal-boundary)}`:clock(normal);
};
const preview=new URLSearchParams(window.location.search).get('preview')==='sample';
function Icon({name}:{name:string}){
 const paths:Record<string,string>={arrow:'M5 12h14m-6-6 6 6-6 6',external:'M7 17 17 7M7 7h10v10',play:'m9 5 11 7-11 7V5',pause:'M8 5v14M16 5v14',reset:'M3 10a9 9 0 1 1 2 8M3 4v6h6',next:'m5 5 10 7-10 7V5M19 5v14',close:'m6 6 12 12M18 6 6 18',ball:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5 4 3-1 5H9l-1-5 4-3Z',help:'M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'};
 return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.arrow}/></svg>;
}
export default function MatchRoom(){
 const root=useRef<HTMLDivElement>(null),about=useRef<HTMLDialogElement>(null);
 const [activeSection,setActiveSection]=useState(window.location.hash==='#events'?'events':'workspace');
 useEffect(()=>{const update=()=>setActiveSection(window.location.hash==='#events'?'events':'workspace');window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const [matches,setMatches]=useState<Match[]>([]),[selected,setSelected]=useState('');
 const [libraryError,setLibraryError]=useState(''),[libraryLoading,setLibraryLoading]=useState(true),[retry,setRetry]=useState(0),[moments,setMoments]=useState(true);
 const match=matches.find(m=>m.id===selected);
 const {cursor,timeline,playing,speed,time,state,visual,players,error:replayError,busy,seek,jump,toggle,setSpeed}=useReplay(match,retry);
 const error=libraryError||replayError,loading=libraryLoading||Boolean(match&&busy);
 useEffect(()=>{const c=new AbortController();setLibraryError('');get<{matches:Match[]}>('/matches',c.signal).then(d=>{
  setMatches(d.matches.map(m=>({...m,home_color:'#7564d9',away_color:'#cf8d58'})));setSelected(id=>d.matches.some(m=>m.id===id)?id:d.matches[0]?.id??'');setLibraryLoading(false);
  if(!d.matches.length)setLibraryError('No showcase matches are available.');
 }).catch(e=>{if(!c.signal.aborted){setLibraryError('The match library is offline. Reconnect, or explore the public sample.');setLibraryLoading(false);}});return()=>c.abort();},[retry]);
 useGSAP(()=>{
  if(!match)return;const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{
   gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(el=>gsap.from(el,{y:16,autoAlpha:0,duration:.6,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 94%',once:true}}));
  });ScrollTrigger.refresh();return()=>mm.revert();
 },{scope:root,dependencies:[Boolean(match)],revertOnUpdate:true});
 const stats=state?.statistics.teams??[],home=stats[0],away=stats[1];
 const visibleEvents=(moments?state?.keyEvents:state?.events)??[];
 const describe=(e:Event)=>{
  const name=players.find(p=>p.player_id===e.player_id)?.name;
  if(e.type==='shot')return `${e.outcome==='goal'?'Goal':e.outcome==='saved'?'Shot saved':e.outcome==='blocked'?'Shot blocked':'Shot off target'}${name?` · ${name}`:''}`;
  if(e.type==='substitution'){const incoming=players.find(p=>p.player_id===e.details.inPlayerId)?.name;return `${incoming??'Substitute'} on · ${name??'Player'} off`;}
  if(e.type==='tactic_change')return `Tactical change · ${String(e.details.tactic??'').replaceAll('_',' ')}`;
  return `${e.type.replaceAll('_',' ')}${name?` · ${name}`:''}`;
 };
 function row(label:string,key:keyof TeamStats,format:(n:number)=>string=String){
  const h=home?.[key],a=away?.[key],hn=typeof h==='number'?h:0,an=typeof a==='number'?a:0;
  return <div className="stat-row" key={label}><div><strong>{typeof h==='number'?format(h):'—'}</strong><span>{label}</span><strong>{typeof a==='number'?format(a):'—'}</strong></div><div className="bar"><i style={{width:`${hn+an?hn/(hn+an)*100:50}%`,background:match?.home_color}}/><i style={{flex:1,background:match?.away_color}}/></div></div>;
 }
 const phase=!state?'Loading match…':state.phase==='sample_complete'?'SAMPLE COMPLETE':state.phase==='fulltime'?'FULL TIME':state.phase==='halftime'?'HALF TIME':`${state.period===2?'2ND':'1ST'} HALF · ${matchClock(state.period,state.periodClockSeconds+Math.max(0,time-state.atSeconds))}`;
 return <div ref={root} className="match-room-page">
  <header className="topbar"><div className="nav-inner"><a className="brand" href="/" aria-label="MatchLens home"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 25V7l12 13L28 7v18M10 25V15m12 10V15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></svg>matchlens<span className="brand-sub">STUDIO</span></a><nav aria-label="Main navigation"><a href="/">Home</a><a href="#workspace" className={activeSection==='workspace'?'nav-active':''} aria-current={activeSection==='workspace'?'location':undefined}>Workspace</a><a href="#events" className={activeSection==='events'?'nav-active':''} aria-current={activeSection==='events'?'location':undefined}>Match events</a><button onClick={()=>about.current?.showModal()}>About the data</button></nav><span className="status"><i/>{preview?'Sample preview':'Replay studio'}</span></div></header>
  <main id="top">
   <section className="workspace" id="workspace" aria-label="Replay workspace"><div className="section-top"><div><p className="eyebrow muted">REPLAY / EXPLORE / UNDERSTAND</p><h1>The match room.</h1></div><label className="match-select"><span>CHOOSE YOUR MATCH</span><select value={selected} onChange={e=>setSelected(e.target.value)} disabled={!matches.length}>{matches.length?matches.map((m,i)=><option value={m.id} key={m.id}>{String(i+1).padStart(2,'0')} · {short(m.home_team)} vs {short(m.away_team)}</option>):<option>Match library unavailable</option>}</select></label></div>
   {preview&&<div className="sample-notice"><span><b>Public sample</b> · 100 events, limited position samples. A short preview, independent of Azure.</span><a href="/match-room">Connect match library <Icon name="external"/></a></div>}
   {error&&<div className="error" role="alert"><span>{error}</span><div><button onClick={()=>setRetry(n=>n+1)}>Try again</button>{!preview&&<a className="primary-link" href="/match-room?preview=sample#workspace">Open sample replay <Icon name="arrow"/></a>}</div></div>}
   {!match?<div className="empty-library panel"><span className="empty-orbit"><Icon name="ball"/></span><h3>{loading?'Getting your match ready.':'The game will be here.'}</h3><p>{loading?'Loading the replay library…':'Your saved matches are safe. Reconnect when you’re ready, or take the sample for a spin.'}</p>{!loading&&<a className="primary-link" href="/match-room?preview=sample#workspace">Explore the sample <Icon name="arrow"/></a>}</div>:<>
   <section className="scoreboard" aria-label="Match score" data-reveal><div className="team"><span className="team-symbol" style={{background:match.home_color}}>{short(match.home_team).slice(0,2).toUpperCase()}</span><div><small>HOME SIDE</small><h3>{short(match.home_team)}</h3></div></div><div className="score"><span className="replay-badge">{preview?'SAMPLE REPLAY':'MATCH REPLAY'}</span><div><b>{state?.statistics.score.home??'—'}</b><span>:</span><b>{state?.statistics.score.away??'—'}</b></div><span className="clock">{phase}</span></div><div className="team away"><div><small>AWAY SIDE</small><h3>{short(match.away_team)}</h3></div><span className="team-symbol" style={{background:match.away_color}}>{short(match.away_team).slice(0,2).toUpperCase()}</span></div></section>
   <ProbabilityPanel state={state} match={match} onSeek={seek}/>
   <MatchAnalysisPanel state={state} match={match}/>
   <TurningPointsPanel state={state} match={match} onSeek={sequence=>jump(sequence)} preview={preview}/>
   <InsightsPanel matchId={match.id} state={state} onSeek={sequence=>jump(sequence)} onPause={()=>{if(playing)toggle();}} preview={preview}/>
   <ProducerPanel matchId={match.id} state={state} onSeek={sequence=>jump(sequence)} onPause={()=>{if(playing)toggle();}} preview={preview}/>
   <div className="replay-grid"><section className="panel pitch-panel" aria-label="Pitch and replay controls" data-reveal><div className="panel-heading"><div><span className="live-dot"/> <h3>On the pitch</h3></div><span className="pitch-label">Sampled positions · interpolated</span></div><Pitch frames={visual?.frames??emptyFrames} events={visual?.events??emptyEvents} match={match} players={players} cursor={cursor}/><div className="pitch-caption"><span><i style={{background:match.home_color}}/>{short(match.home_team)}<i style={{background:match.away_color}}/>{short(match.away_team)}</span><span>{visual?'Approximate motion · amber = incomplete · ring = receiver':'Loading visual samples…'}</span></div><div className="transport"><div className="timeline-labels"><strong>{clock(time)}</strong><span>{clock(match.duration_seconds)} {preview?'· SAMPLE':'· ELAPSED'}</span></div><input aria-label="Replay timeline" type="range" min="0" max={match.duration_seconds} ref={timeline} defaultValue="0" step="any" onInput={e=>seek(Number(e.currentTarget.value))}/><div className="transport-buttons"><div><button className="icon-button" aria-label="Restart replay" title="Restart replay" onClick={()=>seek(0)}><Icon name="reset"/></button><button className="back-button" aria-label="Back 30 seconds" onClick={()=>seek(Math.max(0,time-30))}>−30s</button><button className="play" disabled={!state||!visual||!!error} onClick={toggle}><Icon name={playing?'pause':'play'}/>{playing?'Pause':'Play'}</button><button className="next-button" aria-label="Next event" disabled={!state||busy||time>=match.duration_seconds} onClick={()=>jump((state?.throughSequence??0)+1)}>Next event <Icon name="next"/></button></div><label className="speed-label">Speed <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2,4,8,16,32].map(n=><option key={n} value={n}>{n}×</option>)}</select></label></div></div></section>
   <section className="panel statistics" id="statistics" data-reveal><div className="panel-heading"><div><p className="eyebrow muted">THE NUMBERS</p><h3>A closer look.</h3></div><button className="help-button" aria-label="Explain these statistics" onClick={()=>about.current?.showModal()}><Icon name="help"/></button></div><p className="evidence-time"><span/>{state?`Evidence through ${clock(state.atSeconds)}`:'Loading evidence…'}</p><div className="stat-team-labels"><span><i style={{background:match.home_color}}/>{short(match.home_team)}</span><span>{short(match.away_team)}<i style={{background:match.away_color}}/></span></div>{row('Possession estimate*','possessionEstimate',n=>`${n.toFixed(1)}%`)}{row('Shots','shots')}{row('On target','shotsOnTarget')}{row('Synthetic xG','xg',n=>n.toFixed(2))}{row('Pass accuracy','passAccuracy',n=>`${n.toFixed(1)}%`)}{row('Passes completed','completedPasses')}{row('Pressing sequences','pressingSequences')}{row('Yellow cards','yellowCards')}{row('Red cards','redCards')}<p className="method-note">*Possession uses recorded action time, excluding stoppages. xG is synthetic. Visual interpolation is never statistical evidence.</p></section></div>
   <section className="panel events-panel" id="events" data-reveal><div className="panel-heading"><div><p className="eyebrow muted">02 / THE STORY SO FAR</p><h3>Moment by moment.</h3><span>Every event linked to its place in the match.</span></div><div className="segmented"><button aria-pressed={moments} onClick={()=>setMoments(true)}>Key moments</button><button aria-pressed={!moments} onClick={()=>setMoments(false)}>All events</button></div></div><div className="event-list" data-lenis-prevent>{visibleEvents.length?visibleEvents.map(e=><button className="event" key={e.sequence} onClick={()=>jump(e.sequence,e.clock_seconds)}><span className="event-time">{matchClock(e.period,Number(e.details.periodClockSeconds??0))}</span><span className={`event-icon ${e.outcome==='goal'?'goal':''}`}><Icon name={e.type==='shot'?'ball':'arrow'}/></span><span className="event-description">{describe(e)}<small>{e.team_id===match.home_team_id?short(match.home_team):e.team_id===match.away_team_id?short(match.away_team):'Match'} · Event {e.sequence}</small></span><span className="event-link">Go to moment <Icon name="external"/></span></button>):<div className="empty">{state?'The story is just starting. Play the replay or move along the timeline.':'Loading match events…'}</div>}</div><div className="feed-footer"><span className="live-dot"/>{moments?'All key moments through the selected time.':'The latest 100 events through the selected time.'}<span>Evidence first. Always.</span></div></section>
   </>}
   </section><footer className="workspace-footer"><a className="brand footer-brand" href="#top">matchlens<span>↗</span></a><span>Football is full of stories. Take a closer look.</span><span>FICTIONAL TEAMS. ORIGINAL PERSPECTIVE.</span></footer>
  </main>
  <dialog ref={about} className="about-dialog" aria-labelledby="about-title" data-lenis-prevent onClick={e=>{if(e.target===e.currentTarget)about.current?.close();}}><button className="dialog-close icon-button" aria-label="Close data explanation" onClick={()=>about.current?.close()}><Icon name="close"/></button><p className="eyebrow muted">A NOTE ON THE NUMBERS</p><h2 id="about-title">A simulation.<br/>With sources.</h2><p>These are fictional teams playing synthetic matches. Every score and statistic follows timestamped events at your selected replay moment.</p><dl><dt>Possession estimate</dt><dd>The share of recorded action time, excluding restarts and stoppages.</dd><dt>Synthetic xG</dt><dd>A simulated shot-quality measure. It is not calibrated on real football.</dd><dt>Pressing sequences</dt><dd>Repeated pressure observations grouped by team, possession and period, with no more than ten seconds between observations.</dd><dt>Pitch movement</dt><dd>Interpolated simulated samples. The visual may use the next position sample; statistics use only events through the selected time.</dd></dl><p className="dialog-note">Result probabilities use a Poisson simulation model evaluated on held-out synthetic matches, not real football. AI summaries and match Q&A include evidence and a separate model review. Turning-point candidates mark large model shifts; producer recaps are still in development.</p></dialog>
 </div>;
}
