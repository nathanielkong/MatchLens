import {additionalMatchFacts,type MatchContext} from './match-facts.js';
import {evidenceClock} from './clocks.js';
import {detectTurningPoints} from '../analytics/turning-points.js';
import {z} from 'zod';
import {calculateStatistics,groupPressing,type ReplayEvent} from '../analytics/statistics.js';
import {AIError} from './project.js';
export type Audience='casual'|'analyst';
export type EvidenceMatch={id:string;home_team_id:string;away_team_id:string;home_team:string;away_team:string};
export type Fact={id:string;text:string;evidenceSequences:number[];prefix:{fromSequence:number;throughSequence:number}};
export const evidenceVersion='evidence-catalog-v6';
export function evidencePacket(match:EvidenceMatch,source:ReplayEvent[],cutoff:number,audience:Audience,context:MatchContext={}){
 match={...match,home_team:match.home_team.replace(/^MatchLens /,''),away_team:match.away_team.replace(/^MatchLens /,'')};
 const events=source.filter(e=>e.sequence<=cutoff).sort((a,b)=>a.sequence-b.sequence);
 const last=events.at(-1);if(!last)throw new AIError('AI_NO_EVIDENCE',400);
 const stats=calculateStatistics(events,[match.home_team_id,match.away_team_id],groupPressing(events));
 const [home,away]=stats.teams,fromSequence=events[0].sequence,throughSequence=last.sequence;
 const facts:Fact[]=[];
 const add=(id:string,text:string,relevant:ReplayEvent[])=>facts.push({id,text,evidenceSequences:relevant.slice(-6).map(e=>e.sequence),prefix:{fromSequence,throughSequence}});
 add('score',`${match.home_team} ${stats.score.home}–${stats.score.away} ${match.away_team}. ${last.type==='fulltime'?'This is the recorded full-time result.':last.type==='halftime'?'This is the recorded half-time score; the final result remains unknown.':'This is the score at the selected replay moment, not a prediction of the final result.'}`, [last]);
 const shots=events.filter(e=>e.type==='shot');
 if(shots.length){
  const comparison=home.shots===away.shots?'Both teams have taken the same number of shots.':`${home.shots>away.shots?match.home_team:match.away_team} has produced more attempts so far; that alone does not establish control of the match.`;
  add('chances',`${match.home_team}: ${home.shots} shots, ${home.shotsOnTarget} on target, ${home.xg.toFixed(3)} synthetic xG. ${match.away_team}: ${away.shots} shots, ${away.shotsOnTarget} on target, ${away.xg.toFixed(3)} synthetic xG. ${comparison} Synthetic xG is not calibrated on real football.`,shots);
 }
 const pressure=events.filter(e=>e.type==='pressure');
 if(pressure.length)add('pressing',audience==='analyst'?`Grouped pressing sequences: ${match.home_team} ${home.pressingSequences}, ${match.away_team} ${away.pressingSequences}. Repeated observations are grouped within the same defending team, possession and period, with a maximum 10-second gap. These counts do not measure pressing success.`:`${match.home_team} has ${home.pressingSequences} distinct pressing sequences and ${match.away_team} has ${away.pressingSequences}. Repeated pressure records are grouped, so a burst of observations is not counted as many separate presses.`,pressure);
 const passes=events.filter(e=>e.type==='pass');
 if(passes.length)add('passing',`${match.home_team} has completed ${home.completedPasses} of ${home.passes} passes${home.passAccuracy===null?'':` (${home.passAccuracy.toFixed(1)}%)`}; ${match.away_team} has completed ${away.completedPasses} of ${away.passes}${away.passAccuracy===null?'':` (${away.passAccuracy.toFixed(1)}%)`}. Completion describes ball retention, not necessarily attacking threat.`,passes);
 const red=events.filter(e=>e.type==='red_card'||e.type==='yellow_card');
 if(red.length)add('discipline',`${match.home_team} has ${home.redCards} red cards and ${home.yellowCards} yellow cards; ${match.away_team} has ${away.redCards} red cards and ${away.yellowCards} yellow cards. A dismissal changes the available players; it does not guarantee the match outcome.`,red);
 const goal=shots.filter(e=>e.outcome==='goal').at(-1);
 if(goal)add('latest-goal',`The latest recorded goal was for ${goal.team_id===match.home_team_id?match.home_team:match.away_team}, at ${evidenceClock(goal)}. The score after that event was ${goal.home_score}–${goal.away_score}. It changed the scoreline; a wider tactical explanation needs additional evidence.`,[goal]);
 const shift=detectTurningPoints(events,match.home_team_id,throughSequence).at(-1);
 if(shift){const label=shift.shiftedOutcome==='home'?`${match.home_team} win`:shift.shiftedOutcome==='away'?`${match.away_team} win`:'draw';
  add('turning-point',`At elapsed ${Math.floor(shift.atSeconds/60)}:${String(shift.atSeconds%60).padStart(2,'0')}, a ${shift.kind.replace('_',' ')} changed the model's ${label} probability from ${(shift.before[shift.shiftedOutcome]*100).toFixed(1)}% to ${(shift.after[shift.shiftedOutcome]*100).toFixed(1)}%. This is a same-clock model shift of ${(shift.largestShift*100).toFixed(1)} percentage points, not proof of tactical causality or real-football odds.`,events.filter(e=>e.sequence===shift.sequence));
 }
 facts.push(...additionalMatchFacts(match,events,context));
 return {version:evidenceVersion,matchId:match.id,audience,throughSequence,atSeconds:last.clock_seconds,synthetic:true as const,facts};
}
export type EvidencePacket=ReturnType<typeof evidencePacket>;
export function evidencePrompt(packet:EvidencePacket){
 return `Select the most useful supported talking points for a football studio producer in ${packet.audience} mode.\nReturn ONLY JSON with this shape: {"factIds":["score","chances"]}. Select between 1 and 3 DISTINCT fact IDs from the packet. Prefer a recent goal or dismissal when available. Do not write new prose or add any fields. Only the approved fact text will be displayed; unsupported IDs will be rejected. The packet contains all available evidence through the selected cutoff. Never infer future outcomes or use outside football knowledge.\n${JSON.stringify(packet)}`;
}
const selection=z.object({factIds:z.array(z.string()).min(1).max(3)}).strict();
export function verifySelection(raw:string,packet:EvidencePacket){
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new AIError('AI_VERIFICATION_FAILED',422);}
 const selected=selection.safeParse(parsed);
 if(!selected.success||new Set(selected.data.factIds).size!==selected.data.factIds.length)throw new AIError('AI_VERIFICATION_FAILED',422);
 const facts=selected.data.factIds.map(id=>packet.facts.find(f=>f.id===id));
 if(facts.some(f=>!f||f.evidenceSequences.some(n=>n>packet.throughSequence)||f.prefix.throughSequence>packet.throughSequence))throw new AIError('AI_VERIFICATION_FAILED',422);
 return {matchId:packet.matchId,throughSequence:packet.throughSequence,atSeconds:packet.atSeconds,audience:packet.audience,
  label:'AI-selected evidence summary',synthetic:true,claims:facts as Fact[],
  verification:{accepted:true,version:evidenceVersion,method:'AI selects approved computed facts; server validates IDs and renders the original fact text. No free-form model prose is published.'}};
}
