import {tacticalMeanings as meanings} from '../analytics/tactical-rules.js';
import type {MatchDetails} from '../analytics/match-details.js';
import type {ReplayEvent} from '../analytics/statistics.js';
import type {EvidenceMatch,Fact} from './evidence.js';
import type {MatchContext} from './match-facts.js';
const clock=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
export function tacticalFacts(match:EvidenceMatch,events:ReplayEvent[],context:MatchContext,d:MatchDetails):Fact[]{
 const last=events.at(-1)!,roster=context.players??[],ids=[match.home_team_id,match.away_team_id],q=(context.question??'').toLowerCase();
 const team=(id:string|null)=>id===ids[0]?match.home_team:match.away_team,player=(id:unknown)=>roster.find(p=>p.id===id);
 const named=roster.filter(p=>q.includes(p.name.toLowerCase())).map(p=>p.id),focus=named.length?named:context.focusPlayerIds??[];
 const namedTeams=ids.filter(id=>q.includes(team(id).toLowerCase()));
 const facts:Fact[]=[];
 const add=(id:string,text:string,changes:ReplayEvent[])=>{
  const anchors=changes.flatMap(e=>[e.sequence,...events.filter(a=>a.period===e.period&&Math.abs(a.clock_seconds-e.clock_seconds)<=300&&a.type==='shot').map(a=>a.sequence)]);
  facts.push({id,text,evidenceSequences:[...new Set(anchors)].sort((a,b)=>a-b).slice(-8),prefix:{fromSequence:events[0].sequence,throughSequence:last.sequence}});
 };
 const windows=(e:ReplayEvent)=>{
  const c=d.comparisons.find(c=>c.sequence===e.sequence)!;
  const rows=ids.map(id=>{const b=c.before.teams.find(t=>t.teamId===id)!,a=c.after.teams.find(t=>t.teamId===id)!;
   return `${team(id)}: shots ${b.shots} before/${a.shots} after, synthetic xG ${b.xg.toFixed(3)} before/${a.xg.toFixed(3)} after, completed passes ${b.completedPasses}/${b.passes} before and ${a.completedPasses}/${a.passes} after, grouped presses ${b.pressingSequences} before/${a.pressingSequences} after, goals ${b.goals} before/${a.goals} after`;
  }).join('; ');
  const exposure=c.before.observedSeconds===c.after.observedSeconds?'The windows have equal observed duration.':'The windows have unequal observed duration; raw counts have different exposure.';
  return `Same-half windows: ${clock(c.before.observedSeconds)} before, ${clock(c.after.observedSeconds)} after${c.after.partial?' (after window incomplete)':''}. ${exposure} ${rows}.`;
 };
 const tactics=events.filter(e=>e.type==='tactic_change'&&typeof e.details.tactic==='string'&&meanings[e.details.tactic]&&(!namedTeams.length||namedTeams.includes(e.team_id!)));
 if(tactics.length){
  const focused=tactics.filter(e=>context.focusChangeSequences?.includes(e.sequence)),selected=(context.question&&focused.length?focused:tactics).slice(-4);
  add('tactical-context',selected.map(e=>`${team(e.team_id)} at elapsed ${clock(e.clock_seconds)} (event ${e.sequence}), score ${match.home_team} ${e.home_score}–${e.away_score} ${match.away_team}: instruction ${String(e.details.tactic).replaceAll('_',' ')}; recorded reason ${String(e.details.reason??'unspecified').replaceAll('_',' ')}. ${meanings[String(e.details.tactic)]} ${windows(e)}`).join('\n')+' These are observed before/after counts and the simulator’s instruction rules. They do not demonstrate that the instruction caused later events. Formations stay fixed and no positional tracking enters these calculations.',selected);
 }
 const subs=events.filter(e=>e.type==='substitution'&&(!namedTeams.length||namedTeams.includes(e.team_id!)));
 if(subs.length){
  const namedChanges=subs.filter(e=>focus.includes(String(e.details.inPlayerId))||focus.includes(String(e.details.outPlayerId))),referenced=subs.filter(e=>context.focusChangeSequences?.includes(e.sequence)),selected=(namedChanges.length?namedChanges:context.question&&referenced.length?referenced:subs).slice(-3);
  add('substitution-impact',selected.map(e=>{
   const incoming=player(e.details.inPlayerId),outgoing=player(e.details.outPlayerId),p=d.players.find(p=>p.id===e.details.inPlayerId)!;
   const after=events.filter(a=>a.sequence>e.sequence&&a.player_id===e.details.inPlayerId),shots=after.filter(a=>a.type==='shot'),passes=after.filter(a=>a.type==='pass');
   return `${team(e.team_id)} at elapsed ${clock(e.clock_seconds)} (event ${e.sequence}), score ${e.home_score}–${e.away_score}: ${incoming?.name??'unnamed player'} (${incoming?.position??'position unrecorded'}) replaced ${outgoing?.name??'unnamed player'} (${outgoing?.position??'position unrecorded'}), recorded reason ${String(e.details.reason??'unspecified').replaceAll('_',' ')}. Incoming player's observed playing time ${clock(p?.observedSeconds??0)}; contribution from entry through this cutoff: ${shots.filter(a=>a.outcome==='goal').length} goals, ${p?.assists??0} assists, ${shots.length} shots, ${passes.filter(a=>a.outcome==='complete').length}/${passes.length} completed passes, ${p?.keyPasses??0} key passes, ${p?.interceptions??0} interceptions. ${windows(e)}`;
  }).join('\n')+' Fresh legs is a recorded simulator reason; a fitness improvement or game-changing causal impact was not measured. A same-position replacement does not establish a formation change. Counts after entry stop at the current cutoff or the player’s exit.',selected);
 }
 return facts;
}
