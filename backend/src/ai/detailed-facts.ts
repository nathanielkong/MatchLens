import {tacticalFacts} from './tactical-facts.js';
import {matchDetails} from '../analytics/match-details.js';
import {calculateStatistics,groupPressing,type ReplayEvent} from '../analytics/statistics.js';
import type {EvidenceMatch,Fact} from './evidence.js';
import type {MatchContext} from './match-facts.js';
const clock=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
// A bounded, explicit elapsed-time window. No model-generated SQL or access to
// a future prefix is permitted, even if the question requests future minutes.
export function questionWindow(question:string,atSeconds:number):{from:number;to:number;requestedTo:number}|null{
 const q=question.toLowerCase();let from:number,to:number;
 const range=q.match(/(?:between|from|minutes?)\s*(\d{1,3})(?::(\d{2}))?\s*(?:and|to|[-–])\s*(\d{1,3})(?::(\d{2}))?/);
 const last=q.match(/(?:last|past|previous)\s+(\d{1,3})\s*(?:minutes?|mins?)/);
 if(range){from=Number(range[1])*60+Number(range[2]??0);to=Number(range[3])*60+Number(range[4]??0);}
 else if(last){from=Math.max(0,atSeconds-Number(last[1])*60);to=atSeconds;}
 else return null;
 if(from<0||from>=to||from>atSeconds||to>7200)return null;
 return {from,to:Math.min(to,atSeconds),requestedTo:to};
}
export function detailedMatchFacts(match:EvidenceMatch,events:ReplayEvent[],context:MatchContext):Fact[]{
 const last=events.at(-1)!;const roster=context.players??[],ids=[match.home_team_id,match.away_team_id],d=matchDetails(events,ids,roster,last.sequence),facts:Fact[]=[];
 const team=(id:string)=>id===ids[0]?match.home_team:match.away_team;
 const add=(id:string,text:string,seq:number[]=[last.sequence])=>facts.push({id,text,evidenceSequences:[...new Set(seq)].slice(-8),prefix:{fromSequence:events[0].sequence,throughSequence:last.sequence}});
 add('coverage',`Coverage: kickoff at 0:00 through elapsed ${clock(last.clock_seconds)}, ${events.length} recorded events, ${last.type==='fulltime'?'recorded full time reached':last.type==='halftime'?'recorded half time reached; second half not yet observed':'match still in progress at this cutoff'}. Summary and recap cover the whole observed prefix, not just the latest event. No events after sequence ${last.sequence}.`);
 add('phases',d.phases.map(p=>`${p.period===1?'First':'Second'} half ${p.label} match minutes (${clock(p.observedSeconds)} observed, ${p.complete?'complete':'partial'}): ${p.teams.map(t=>`${team(t.teamId)} ${t.goals} goals, ${t.shots} shots, ${t.xg.toFixed(3)} synthetic xG, ${t.completedPasses}/${t.passes} passes`).join('; ')}`).join('. ')+'. Bins use each half’s clock; the last bin includes added time. Partial windows cover different durations.',d.phases.flatMap(p=>p.evidenceSequences).length?d.phases.flatMap(p=>p.evidenceSequences):[last.sequence]);
 const refs=(types:string[])=>events.filter(e=>types.includes(e.type)).slice(-8).map(e=>e.sequence);
 add('defending',d.teams.map(t=>`${team(t.teamId)}: ${t.tackles} tackle events, ${t.interceptions} interceptions, ${t.blocks} blocks, ${t.recoveries} recoveries, ${t.fouls} fouls`).join('; ')+'. Recorded action counts do not measure defensive quality or success rates.',refs(['tackle','interception','block','recovery','foul']).length?refs(['tackle','interception','block','recovery','foul']):[last.sequence]);
 const keepers=d.players.filter(p=>p.position==='GK'&&p.status!=='bench'||p.saves>0);
 if(keepers.length)add('goalkeepers',keepers.map(p=>`${p.name} (${team(p.teamId)}): ${p.saves} saves, ${p.savesHeld} held and ${p.savesParried} parried; ${p.completedPasses}/${p.passes} passes`).join('; ')+'. Save events are separate from shots on target; goals are not saves.',refs(['save']).length?refs(['save']):[last.sequence]);
 add('restarts',d.teams.map(t=>`${team(t.teamId)}: ${t.corners} corners, ${t.freeKicks} free kicks, ${t.throwIns} throw-ins, ${t.goalKicks} goal kicks`).join('; ')+'. These counts alone do not establish chances created from restarts.',refs(['corner','free_kick','throw_in','goal_kick']).length?refs(['corner','free_kick','throw_in','goal_kick']):[last.sequence]);
 add('progression',d.teams.map(t=>`${team(t.teamId)}: ${t.progressivePasses} completed progressive passes advancing at least 10 metres, ${t.carries} carries covering ${t.carryMetres.toFixed(1)} metres`).join('; ')+'. Progression uses recorded attacking-direction distances, not visual interpolation.',refs(['pass','carry']).length?refs(['pass','carry']):[last.sequence]);
 if(d.comparisons.length)add('change-windows',d.comparisons.slice(context.question?-12:-6).map(c=>{const event=d.timeline.find(e=>e.sequence===c.sequence)!;return `${team(c.teamId!)} ${c.type.replace('_',' ')} at elapsed ${clock(event.atSeconds)} (event ${c.sequence}): ${clock(c.before.observedSeconds)} before, ${clock(c.after.observedSeconds)} after${c.after.partial?' (after window partial)':''}; ${ids.map(id=>{const b=c.before.teams.find(t=>t.teamId===id)!,a=c.after.teams.find(t=>t.teamId===id)!;return `${team(id)} shots ${b.shots} before/${a.shots} after, synthetic xG ${b.xg.toFixed(3)} before/${a.xg.toFixed(3)} after, goals ${b.goals} before/${a.goals} after`;}).join('; ')}`;}).join('. ')+'. Windows are up to 5 minutes on each side within the same half and observed cutoff. Unequal windows are not rate comparisons. Association never proves a substitution or tactic caused the change.',d.comparisons.slice(context.question?-12:-6).flatMap(c=>c.evidenceSequences));
 if(d.passingLinks.length)add('passing-links',d.passingLinks.slice(0,5).map(l=>`${l.fromName} to ${l.toName} (${team(l.teamId)}): ${l.completed} completed of ${l.attempted} attempted passes`).join('; ')+'. Highest completed directed links in the observed prefix; not a full positional passing network.',d.passingLinks.slice(0,5).flatMap(l=>l.evidenceSequences));
 if(roster.length){
  add('lineups',ids.map(id=>`${team(id)} starters: ${roster.filter(p=>p.teamId===id&&p.starter).map(p=>`${p.name} (${[p.position,p.role].filter(Boolean).join('/')||'role unrecorded'}, shirt ${p.shirt})`).join(', ')}. Bench: ${roster.filter(p=>p.teamId===id&&!p.starter).map(p=>`${p.name} (shirt ${p.shirt})`).join(', ')}`).join('. ')+'. Starting roles do not establish live positional changes.');
  const q=(context.question??'').toLowerCase();
  const named=d.players.filter(p=>q.includes(p.name.toLowerCase())||q.includes(p.id.toLowerCase()));
  const metric=/intercept/.test(q)?'interceptions':/tackl/.test(q)?'tackles':/block/.test(q)?'blocks':/key pass/.test(q)?'keyPasses':/progressive/.test(q)?'progressivePasses':/pass/.test(q)?'completedPasses':/carr/.test(q)?'carryMetres':/assist/.test(q)?'assists':/save|keeper/.test(q)?'saves':/shot|attempt/.test(q)?'shots':'goals';
  const ranked=[...d.players].filter(p=>p.observedSeconds>0).sort((a,b)=>b[metric]-a[metric]||b.goals-a.goals||b.assists-a.assists||b.shots-a.shots||b.keyPasses-a.keyPasses||b.interceptions-a.interceptions);
  const focus=d.players.filter(p=>context.focusPlayerIds?.includes(p.id));
  const selected=named.length?named.slice(0,4):focus.length?focus.slice(0,4):ranked.slice(0,4);
  if(selected.length)add('player-details',selected.map(p=>`${p.name} (${team(p.teamId)}, shirt ${p.shirt}, ${[p.position,p.role].filter(Boolean).join('/')||'role unrecorded'}): ${p.status.replaceAll('_',' ')}, ${clock(p.observedSeconds)} observed on field; ${p.goals} goals, ${p.assists} assists, ${p.shots} shots, ${p.shotsOnTarget} on target, ${p.xg.toFixed(3)} synthetic xG, ${p.keyPasses} key passes linked to a shot, ${p.completedPasses}/${p.passes} passes, ${p.progressivePasses} progressive passes, ${p.carries} carries (${p.carryMetres.toFixed(1)} metres), ${p.tackles} tackles, ${p.interceptions} interceptions, ${p.blocks} blocks, ${p.saves} saves, ${p.yellowCards} yellows, ${p.redCards} reds`).join('. ')+'. Observed contributions are not ratings or causal impact. Named players are matched to the roster; otherwise players are ranked by the question’s metric with goals/assists/shots as tie-breakers. This is a selected set, not the entire roster.',selected.flatMap(p=>p.evidenceSequences).length?selected.flatMap(p=>p.evidenceSequences):[last.sequence]);
 }
 const inherited=context.inheritedWindow;
 const w=questionWindow(context.question??'',last.clock_seconds)??(inherited&&inherited.from<last.clock_seconds?{from:inherited.from,to:Math.min(inherited.to,last.clock_seconds),requestedTo:inherited.to}:null);
 if(w){
  const rows=events.filter(e=>e.clock_seconds>=w.from&&e.clock_seconds<=w.to),s=calculateStatistics(rows,ids,groupPressing(rows));
  add('time-window',`Requested elapsed window ${clock(w.from)}–${clock(w.requestedTo)}; observed through ${clock(w.to)}${w.requestedTo>w.to?' only; the requested remainder is future and unavailable':''}, ${rows.length} events. ${s.teams.map(t=>`${team(t.teamId)}: ${rows.filter(e=>e.team_id===t.teamId&&e.type==='shot'&&e.outcome==='goal').length} goals, ${t.shots} shots, ${t.shotsOnTarget} on target, ${t.xg.toFixed(3)} synthetic xG, ${t.completedPasses}/${t.passes} passes, ${t.pressingSequences} grouped presses, ${t.yellowCards} yellows, ${t.redCards} reds`).join('; ')}. Recorded goals, dismissals, substitutions and tactical changes: ${rows.filter(e=>e.type==='shot'&&e.outcome==='goal'||['red_card','substitution','tactic_change'].includes(e.type)).slice(-10).map(e=>`${clock(e.clock_seconds)} ${team(e.team_id!)} ${e.type==='shot'?'goal':e.type.replace('_',' ')}${e.player_id?` (${roster.find(p=>p.id===e.player_id)?.name??'unnamed'})`:''}`).join('; ')||'none recorded'}. Window counts only, not cumulative match totals.`,rows.filter(e=>e.type!=='pressure').slice(-8).map(e=>e.sequence).length?rows.filter(e=>e.type!=='pressure').slice(-8).map(e=>e.sequence):[last.sequence]);
 }
 facts.push(...tacticalFacts(match,events,context,d));
 return facts;
}
