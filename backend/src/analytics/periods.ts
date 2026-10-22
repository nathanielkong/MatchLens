import {calculateStatistics,groupPressing,type ReplayEvent} from './statistics.ts';
// Split and group only after restricting the supplied events to the replay prefix.
export function periodAnalysis(source:ReplayEvent[],teamIds:string[],throughSequence:number,atSeconds?:number){
 const events=source.filter(e=>e.sequence<=throughSequence).sort((a,b)=>a.sequence-b.sequence);
 const last=events.at(-1),activePeriod=last?.period??1;
 const periods=([1,2] as const).map(period=>{
  const prefix=events.filter(e=>e.period===period),end=prefix.at(-1);
  const complete=period===1?events.some(e=>e.type==='halftime'||e.period===2):prefix.some(e=>e.type==='fulltime');
  const status=!prefix.length?'not_started':complete?'complete':'in_progress';
  const baseClock=end?Number(end.details.periodClockSeconds??(period===1?end.clock_seconds:0)):0;
  const observedSeconds=Math.max(0,baseClock+(status==='in_progress'&&period===activePeriod?Math.max(0,(atSeconds??end?.clock_seconds??0)-(end?.clock_seconds??0)):0));
  const teams=prefix.length?calculateStatistics(prefix,teamIds,groupPressing(prefix)).teams.map(team=>({...team,goals:prefix.filter(e=>e.type==='shot'&&e.outcome==='goal'&&e.team_id===team.teamId).length})):[];
  return {period,status,observedSeconds,throughSequence:end?.sequence??0,eventCount:prefix.length,teams};
 });
 return {version:'period-analysis-v1',throughSequence:last?.sequence??0,periods,limitations:'Observed period totals; unfinished halves are partial and have unequal exposure. Possession uses recorded action duration. xG is synthetic.'};
}
