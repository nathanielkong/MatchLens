import {detailedMatchFacts} from './detailed-facts.js';
import {evidenceClock} from './clocks.js';
import {periodAnalysis} from '../analytics/periods.js';
import {probabilityHistory} from '../probability/inference.js';
import type {ReplayEvent} from '../analytics/statistics.js';
import type {EvidenceMatch,Fact} from './evidence.js';
export type EvidencePlayer={id:string;teamId:string;name:string;shirt:number;starter:boolean;position?:string;role?:string};
export type MatchContext={players?:EvidencePlayer[];homeFormation?:string;awayFormation?:string;question?:string;focusPlayerIds?:string[];focusChangeSequences?:number[];inheritedWindow?:{from:number;to:number}};
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
export function additionalMatchFacts(match:EvidenceMatch,events:ReplayEvent[],context:MatchContext):Fact[]{
 const last=events.at(-1)!;const facts:Fact[]=[],roster=context.players??[];
 const team=(id:string|null)=>id===match.home_team_id?match.home_team:id===match.away_team_id?match.away_team:'Unknown team';
 const player=(id:unknown)=>roster.find(p=>p.id===id)?.name??'unnamed player';
 const add=(id:string,text:string,relevant:ReplayEvent[]= [last])=>facts.push({id,text,evidenceSequences:relevant.slice(-6).map(e=>e.sequence),prefix:{fromSequence:events[0].sequence,throughSequence:last.sequence}});
 const tactics=events.filter(e=>e.type==='tactic_change'),subs=events.filter(e=>e.type==='substitution'),goals=events.filter(e=>e.type==='shot'&&e.outcome==='goal');
 const instructions:Record<string,string>={attack:'attack',protect_lead:'protect the lead',balanced:'balanced',compact:'compact'};
 const observed=tactics.filter(e=>typeof e.details.tactic==='string'&&instructions[e.details.tactic]);
 if(observed.length)add('tactics',observed.slice(-6).map(e=>`${team(e.team_id)} at elapsed ${clock(e.clock_seconds)}: recorded instruction to ${instructions[String(e.details.tactic)]}`).join('; ')+'. Recorded instructions do not establish their effect on the result.',observed);
 const changes=[...subs,...tactics].sort((a,b)=>a.sequence-b.sequence);
 add('changes',`${subs.length} substitutions and ${tactics.length} tactical-change events have been recorded so far. No later changes are included.`,changes.length?changes:[last]);
 const contributions=(id:string,after=0)=>{
  const actions=events.filter(e=>e.sequence>after&&e.player_id===id),shots=actions.filter(e=>e.type==='shot'),passes=actions.filter(e=>e.type==='pass');
  return `${shots.length} shots, ${shots.filter(e=>e.outcome==='goal').length} goals, ${goals.filter(e=>e.sequence>after&&e.details.assistPlayerId===id).length} recorded assists, ${passes.filter(e=>e.outcome==='complete').length} completed passes from ${passes.length}`;
 };
 if(subs.length)add('substitutions',subs.slice(-6).map(e=>`${team(e.team_id)} at elapsed ${clock(e.clock_seconds)}: ${player(e.details.inPlayerId)} on for ${player(e.details.outPlayerId)}${e.details.reason==='fresh_legs'?' (recorded reason: fresh legs)':''}; incoming player's recorded contribution since entering: ${contributions(String(e.details.inPlayerId),e.sequence)}`).join('. ')+'. Contributions are observed counts, not proof a substitution caused a change.',subs);
 if(goals.length)add('goals',goals.map(e=>`${evidenceClock(e)}: ${team(e.team_id)}, ${player(e.player_id)} scored${e.details.assistPlayerId?`, assist by ${player(e.details.assistPlayerId)}`:''}; score ${e.home_score}–${e.away_score}`).join('. ')+'. Only goals recorded through the cutoff. Elapsed time includes previous-half added time; use the supplied half clock and classification.',goals);
 if(context.homeFormation&&context.awayFormation&&[context.homeFormation,context.awayFormation].every(s=>/^\d(?:-\d){2,4}$/.test(s)))add('formations',`Recorded starting formations: ${match.home_team} ${context.homeFormation}; ${match.away_team} ${context.awayFormation}. The current simulator keeps these formations fixed; tactical instruction changes are separate from formation changes.`);
 const p=probabilityHistory(events,match.home_team_id,last.clock_seconds).current;
 add('probabilities',`Simulation estimates at this moment: ${match.home_team} win ${(p.home*100).toFixed(1)}%, draw ${(p.draw*100).toFixed(1)}%, ${match.away_team} win ${(p.away*100).toFixed(1)}%. These are synthetic-model estimates, not real-football odds or a guaranteed outcome.`);
 const periods=periodAnalysis(events,[match.home_team_id,match.away_team_id],last.sequence).periods;
 add('periods',periods.map(p=>`${p.period===1?'First':'Second'} half: ${p.status==='not_started'?'not started':`${p.status==='complete'?'complete':'partial'}, ${clock(p.observedSeconds)} observed; `+p.teams.map(t=>`${team(t.teamId)} ${t.goals} goals, ${t.shots} shots, ${t.xg.toFixed(3)} synthetic xG, ${t.completedPasses} completed passes`).join('; ')}`).join('. ')+'. Unfinished halves have unequal exposure; xG is simulated.');
 if(roster.length){
  const named=context.question?roster.filter(p=>context.question!.toLowerCase().includes(p.name.toLowerCase())):[];
  const selected=named.length?named.slice(0,3):roster.filter(p=>events.some(e=>e.player_id===p.id&&e.type==='shot')).sort((a,b)=>goals.filter(e=>e.player_id===b.id).length-goals.filter(e=>e.player_id===a.id).length||events.filter(e=>e.type==='shot'&&e.player_id===b.id).length-events.filter(e=>e.type==='shot'&&e.player_id===a.id).length).slice(0,3);
  if(selected.length){
   const relevant=events.filter(e=>selected.some(p=>e.player_id===p.id||e.details.inPlayerId===p.id||e.details.outPlayerId===p.id||e.details.assistPlayerId===p.id));
   add('players',selected.map(p=>{const entry=subs.find(e=>e.details.inPlayerId===p.id),exit=subs.find(e=>e.details.outPlayerId===p.id),red=events.find(e=>e.type==='red_card'&&e.player_id===p.id);return `${p.name} (${team(p.teamId)}, shirt ${p.shirt}): ${p.starter?'started':entry?`entered at elapsed ${clock(entry.clock_seconds)}`:'has not entered'}${exit?`, substituted off at elapsed ${clock(exit.clock_seconds)}`:''}${red?`, sent off at elapsed ${clock(red.clock_seconds)}`:''}; ${contributions(p.id)}`;}).join('. ')+'. These are recorded contributions, not player ratings or proof of causal impact.',relevant.length?relevant:[last]);
  }
 }
 facts.push(...detailedMatchFacts(match,events,context));
 return facts;
}
