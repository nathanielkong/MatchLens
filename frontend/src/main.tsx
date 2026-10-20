import {StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Match={id:string;home_team_id:string;away_team_id:string;home_team:string;away_team:string;home_color:string;away_color:string;duration_seconds:number};
type Player={player_id:string;team_id:string;name:string;shirt_number:number};
type Event={sequence:number;clock_seconds:number;period:number;type:string;team_id:string|null;player_id:string|null;outcome:string|null;details:Record<string,unknown>};
type TeamStats={teamId:string;shots:number;shotsOnTarget:number;xg:number;passes:number;completedPasses:number;passAccuracy:number|null;possessionEstimate:number|null;pressingSequences:number;yellowCards:number;redCards:number};
type Frame={through_sequence:number;clock_seconds:number;ball:{x:number;y:number};positions:{playerId:string;teamId:string;x:number;y:number}[]};
type State={matchId:string;atSeconds:number;throughSequence:number;period:number;periodClockSeconds:number;phase:string;statistics:{score:{home:number;away:number};possessionTeamId:string|null;teams:TeamStats[]};events:Event[];keyEvents:Event[];frame:Frame|null};
const short=(name:string)=>name.replace('MatchLens ','');
const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const matchClock=(period:number,seconds:number)=>{
 const normal=period===1?seconds:2700+seconds;
 const boundary=period===1?2700:5400;
 return normal>boundary?`${period===1?45:90}+${clock(normal-boundary)}`:clock(normal);
};
async function get<T>(path:string,signal?:AbortSignal):Promise<T>{
 for(let attempt=0;;attempt++){
  const res=await fetch(`/api${path}`,{signal});
  if([502,503].includes(res.status)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));continue;}
  if(!res.ok)throw new Error(`Unable to load match data (${res.status}). Please retry.`);
  return res.json();
 }
}
function Pitch({frame,match,players}:{frame:Frame|null;match:Match;players:Player[]}){
 return <svg className="pitch" viewBox="-6 -6 117 80" role="img" aria-label="Sampled football pitch with player shirt numbers and ball">
  <defs><pattern id="stripes" width="21" height="68" patternUnits="userSpaceOnUse"><rect width="10.5" height="68" fill="#fff" opacity=".025"/></pattern></defs>
  <rect x="-6" y="-6" width="117" height="80" rx="2" fill="#123c32"/><rect width="105" height="68" fill="url(#stripes)"/>
  <g fill="none" stroke="#c8e7d2" strokeOpacity=".36" strokeWidth=".32"><rect width="105" height="68"/><path d="M52.5 0V68"/><circle cx="52.5" cy="34" r="9.15"/><circle cx="52.5" cy="34" r=".5" fill="#c8e7d2"/>
   <path d="M0 13.84H16.5V54.16H0M105 13.84H88.5V54.16H105M0 24.84H5.5V43.16H0M105 24.84H99.5V43.16H105M0 30.34H-2V37.66H0M105 30.34H107V37.66H105"/><circle cx="11" cy="34" r=".5"/><circle cx="94" cy="34" r=".5"/></g>
  {frame?.positions.map(p=><g key={p.playerId} transform={`translate(${p.x*1.05},${p.y*.68})`}><title>{players.find(a=>a.player_id===p.playerId)?.name??p.playerId}</title><circle r="1.8" fill={p.teamId===match.home_team_id?match.home_color:match.away_color} stroke="#eef5f2" strokeWidth=".35"/><text textAnchor="middle" dominantBaseline="central" fontSize="1.65" fontWeight="700" fill="white">{players.find(a=>a.player_id===p.playerId)?.shirt_number}</text></g>)}
  {frame&&<g transform={`translate(${frame.ball.x*1.05},${frame.ball.y*.68})`}><circle r="1.3" fill="white" stroke="#10251d" strokeWidth=".4"/><circle r=".35" fill="#10251d"/></g>}
 </svg>;
}
function App(){
 const [matches,setMatches]=useState<Match[]>([]),[selected,setSelected]=useState(''),[players,setPlayers]=useState<Player[]>([]);
 const [state,setState]=useState<State|null>(null),[target,setTarget]=useState({atSeconds:0} as {atSeconds?:number;throughSequence?:number});
 const [playing,setPlaying]=useState(false),[speed,setSpeed]=useState(12),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[moments,setMoments]=useState(true);
 const match=matches.find(m=>m.id===selected);
 useEffect(()=>{const c=new AbortController();get<{matches:Match[]}>('/matches',c.signal).then(d=>{setMatches(d.matches);setSelected(d.matches[0]?.id??'');if(!d.matches.length){setLoading(false);setError('No showcase matches are available.');}}).catch(e=>{if(!c.signal.aborted){setError(e.message);setLoading(false);}});return()=>c.abort();},[retry]);
 useEffect(()=>{if(!selected)return;const c=new AbortController();setPlayers([]);get<{lineups:Player[]}>(`/matches/${selected}/lineups`,c.signal).then(d=>setPlayers(d.lineups)).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[selected,retry]);
 useEffect(()=>{if(!selected)return;const c=new AbortController();setLoading(true);setError('');
  get<State>(`/matches/${selected}/state?${new URLSearchParams(Object.entries(target).map(([k,v])=>[k,String(v)]))}`,c.signal)
   .then(d=>{if(!c.signal.aborted){setState(d);setLoading(false);if(d.phase==='fulltime')setPlaying(false);}})
   .catch(e=>{if(!c.signal.aborted){setError(e.message);setLoading(false);setPlaying(false);}});return()=>c.abort();
 },[selected,target,retry]);
 // Advance only after the current frame arrives: requests cannot overtake playback.
 useEffect(()=>{if(!playing||loading||!match||!state||error)return;
  const timer=setTimeout(()=>setTarget({atSeconds:Math.min(match.duration_seconds,state.atSeconds+speed)}),700);
  return()=>clearTimeout(timer);
 },[playing,loading,match,state,speed,error]);
 const choose=(id:string)=>{setPlaying(false);setState(null);setSelected(id);setTarget({atSeconds:0});};
 const seek=(seconds:number)=>{setPlaying(false);setTarget({atSeconds:seconds});};
 const jump=(sequence:number)=>{setPlaying(false);setTarget({throughSequence:Math.max(0,sequence)});};
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
   <section className="scoreboard panel" aria-label="Match score"><div className="team"><span className="team-symbol" style={{background:match.home_color}}>{short(match.home_team).slice(0,2).toUpperCase()}</span><div><small>HOME</small><h2>{short(match.home_team)}</h2></div></div><div className="score"><div><b>{state?.statistics.score.home??'—'}</b><span>:</span><b>{state?.statistics.score.away??'—'}</b></div><span className="clock">{state?.phase==='fulltime'?'FULL TIME':state?.phase==='halftime'?'HALF TIME':`${state?.period===2?'2ND':'1ST'} HALF · ${matchClock(state?.period??1,state?.periodClockSeconds??0)}`}</span></div><div className="team away"><div><small>AWAY</small><h2>{short(match.away_team)}</h2></div><span className="team-symbol" style={{background:match.away_color}}>{short(match.away_team).slice(0,2).toUpperCase()}</span></div></section>
   <div className="replay-grid"><section className="panel pitch-panel"><div className="panel-heading"><h3>Pitch view</h3><span>{loading?'Updating…':'Sampled positions'}</span></div><Pitch frame={state?.frame??null} match={match} players={players}/><div className="pitch-caption"><span><i style={{background:match.home_color}}/>{short(match.home_team)}<i style={{background:match.away_color}}/>{short(match.away_team)}</span><span>{state?.frame?`Position sample · ${clock(state.frame.clock_seconds)} elapsed`:'No position sample at this point'}</span></div>
    <div className="transport"><input aria-label="Replay timeline" type="range" min="0" max={match.duration_seconds} value={target.atSeconds??state?.atSeconds??0} onChange={e=>seek(Number(e.target.value))}/><div className="timeline-labels"><span>{clock(state?.atSeconds??0)} elapsed</span><span>{clock(match.duration_seconds)}</span></div><div className="transport-buttons"><div><button aria-label="Restart replay" onClick={()=>seek(0)}>↺</button><button aria-label="Back 30 seconds" onClick={()=>seek(Math.max(0,(state?.atSeconds??0)-30))}>−30s</button><button className="play" disabled={!state||!!error} onClick={()=>{if(state?.phase==='fulltime')seek(0);setPlaying(v=>!v);}}>{playing?'Ⅱ Pause':'▶ Play'}</button><button aria-label="Next event" disabled={loading||state?.phase==='fulltime'} onClick={()=>jump((state?.throughSequence??0)+1)}>Next event →</button></div><label>Speed <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,6,12,30].map(n=><option key={n} value={n}>{n}s / step</option>)}</select></label></div></div>
   </section><section className="panel statistics"><div className="panel-heading"><h3>Match statistics</h3><span>At replay time</span></div><div className="stat-team-labels"><span>{short(match.home_team)}</span><span>{short(match.away_team)}</span></div>{row('Possession estimate*','possessionEstimate',n=>`${n.toFixed(1)}%`)}{row('Shots','shots')}{row('On target','shotsOnTarget')}{row('Synthetic xG','xg',n=>n.toFixed(2))}{row('Pass accuracy','passAccuracy',n=>`${n.toFixed(1)}%`)}{row('Passes completed','completedPasses')}{row('Pressing sequences','pressingSequences')}{row('Yellow cards','yellowCards')}{row('Red cards','redCards')}<p className="method-note">*Share of recorded action time, excluding restarts and stoppages. xG and positions are simulated.</p></section></div>
   <section className="panel events-panel"><div className="panel-heading"><div><h3>Event feed</h3><span>Only events through this replay moment</span></div><div className="segmented"><button aria-pressed={moments} onClick={()=>setMoments(true)}>Key events</button><button aria-pressed={!moments} onClick={()=>setMoments(false)}>All events</button></div></div><div className="event-list">{visibleEvents.length?visibleEvents.map(e=><button className="event" key={e.sequence} onClick={()=>jump(e.sequence)}><span className="event-time">{matchClock(e.period,Number(e.details.periodClockSeconds??0))}</span><span className={`event-icon ${e.outcome==='goal'?'goal':''}`}>{e.type==='shot'?'◎':e.type.includes('card')?'▰':e.type==='tactic_change'?'⇄':'·'}</span><span className="event-description">{describe(e)}<small>{e.team_id===match.home_team_id?short(match.home_team):e.team_id===match.away_team_id?short(match.away_team):'Match'} · Event {e.sequence}</small></span><span className="event-link">View moment ↗</span></button>):<div className="empty">{state?'No events in this filter yet. Play or seek forward.':'Loading match state…'}</div>}</div><div className="feed-footer">{moments?'All key events through this replay moment.':'Showing up to 100 recent events.'} Select an event to inspect its exact moment.</div></section>
   <footer className="workspace-footer"><span>FICTIONAL TEAMS · SYNTHETIC DATA</span><span>Evidence first. Every statistic follows the replay.</span></footer>
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
