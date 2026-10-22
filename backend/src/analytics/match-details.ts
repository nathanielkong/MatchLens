import {calculateStatistics,groupPressing,type ReplayEvent} from './statistics.js';
export type MatchPlayer={id:string;teamId:string;name:string;shirt:number;starter:boolean;position?:string;role?:string};
const round=(n:number)=>Math.round(n*1000)/1000;
export function matchDetails(source:ReplayEvent[],teamIds:string[],roster:MatchPlayer[],throughSequence:number,atSeconds?:number){
 const events=source.filter(e=>e.sequence<=throughSequence).sort((a,b)=>a.sequence-b.sequence),last=events.at(-1),time=Math.max(last?.clock_seconds??0,atSeconds??0);
 const stats=(rows:ReplayEvent[])=>calculateStatistics(rows,teamIds,groupPressing(rows)).teams;
 const goals=events.filter(e=>e.type==='shot'&&e.outcome==='goal'),subs=events.filter(e=>e.type==='substitution');
 const players=roster.map(p=>{
  const entry=subs.find(e=>e.details.inPlayerId===p.id),exit=subs.find(e=>e.details.outPlayerId===p.id),red=events.find(e=>e.type==='red_card'&&e.player_id===p.id);
  const start=p.starter?0:entry?.clock_seconds,end=Math.min(exit?.clock_seconds??time,red?.clock_seconds??time,time);
  const actions=events.filter(e=>e.player_id===p.id),shots=actions.filter(e=>e.type==='shot'),passes=actions.filter(e=>e.type==='pass'),carries=actions.filter(e=>e.type==='carry');
  const assists=goals.filter(e=>e.details.assistPlayerId===p.id),keyPasses=events.filter(e=>e.type==='shot'&&e.details.keyPassPlayerId===p.id);
  const relevant=events.filter(e=>e.player_id===p.id||e.details.assistPlayerId===p.id||e.details.keyPassPlayerId===p.id||e.details.inPlayerId===p.id||e.details.outPlayerId===p.id);
  return {...p,status:red?'sent_off':exit?'substituted_off':start===undefined?'bench':'on_pitch',enteredAt:start??null,leftAt:exit?.clock_seconds??red?.clock_seconds??null,
   observedSeconds:start===undefined?0:Math.max(0,end-start),goals:shots.filter(e=>e.outcome==='goal').length,assists:assists.length,shots:shots.length,shotsOnTarget:shots.filter(e=>['goal','saved'].includes(e.outcome??'')).length,
   xg:round(shots.reduce((sum,e)=>sum+(typeof e.details.xg==='number'?e.details.xg:0),0)),passes:passes.length,completedPasses:passes.filter(e=>e.outcome==='complete').length,
   keyPasses:keyPasses.length,progressivePasses:passes.filter(e=>e.outcome==='complete'&&Number(e.details.progressiveMetres)>=10).length,carries:carries.length,carryMetres:round(carries.reduce((sum,e)=>sum+Number(e.details.distanceMetres??0),0)),
   tackles:actions.filter(e=>e.type==='tackle').length,interceptions:actions.filter(e=>e.type==='interception').length,blocks:actions.filter(e=>e.type==='block').length,recoveries:actions.filter(e=>e.type==='recovery').length,
   fouls:actions.filter(e=>e.type==='foul').length,yellowCards:actions.filter(e=>e.type==='yellow_card').length,redCards:red?1:0,saves:actions.filter(e=>e.type==='save').length,
   savesHeld:actions.filter(e=>e.type==='save'&&e.outcome==='held').length,savesParried:actions.filter(e=>e.type==='save'&&e.outcome==='parried').length,
   evidenceSequences:relevant.slice(-8).map(e=>e.sequence)};
 });
 const teams=stats(events).map(t=>{
  const rows=events.filter(e=>e.team_id===t.teamId),passes=rows.filter(e=>e.type==='pass'),carries=rows.filter(e=>e.type==='carry');
  return {...t,goals:goals.filter(e=>e.team_id===t.teamId).length,
   tackles:rows.filter(e=>e.type==='tackle').length,interceptions:rows.filter(e=>e.type==='interception').length,blocks:rows.filter(e=>e.type==='block').length,recoveries:rows.filter(e=>e.type==='recovery').length,fouls:rows.filter(e=>e.type==='foul').length,
   saves:rows.filter(e=>e.type==='save').length,corners:rows.filter(e=>e.type==='corner').length,freeKicks:rows.filter(e=>e.type==='free_kick').length,throwIns:rows.filter(e=>e.type==='throw_in').length,goalKicks:rows.filter(e=>e.type==='goal_kick').length,
   carries:carries.length,carryMetres:round(carries.reduce((sum,e)=>sum+Number(e.details.distanceMetres??0),0)),progressivePasses:passes.filter(e=>e.outcome==='complete'&&Number(e.details.progressiveMetres)>=10).length};
 });
 const phases=([1,2] as const).flatMap(period=>{
  const rows=events.filter(e=>e.period===period),end=rows.at(-1);if(!end)return [];
  const complete=rows.some(e=>e.type===(period===1?'halftime':'fulltime'));
  const observed=Number(end.details.periodClockSeconds??(period===1?end.clock_seconds:0))+(last?.period===period?Math.max(0,time-end.clock_seconds):0);
  return [0,1,2].filter(i=>observed>=i*900).map(i=>{
   const selected=rows.filter(e=>Math.min(2,Math.floor(Number(e.details.periodClockSeconds??0)/900))===i),seconds=Math.max(0,Math.min(i===2?observed:900,observed-i*900));
   return {period,index:i,label:period===1?['0–15','15–30','30–HT'][i]:['45–60','60–75','75–FT'][i],observedSeconds:seconds,complete:i<2?observed>=(i+1)*900:complete,
    throughSequence:selected.at(-1)?.sequence??0,teams:stats(selected).map(t=>({...t,goals:selected.filter(e=>e.team_id===t.teamId&&e.type==='shot'&&e.outcome==='goal').length})),evidenceSequences:selected.filter(e=>e.type==='shot'||e.type==='red_card').slice(-6).map(e=>e.sequence)};
  });
 });
 const timeline=events.filter(e=>e.type==='shot'&&e.outcome==='goal'||['red_card','yellow_card','substitution','tactic_change','halftime','fulltime'].includes(e.type)).map(e=>({sequence:e.sequence,atSeconds:e.clock_seconds,period:e.period,periodClockSeconds:Number(e.details.periodClockSeconds??0),type:e.type,teamId:e.team_id,playerId:e.player_id,
  player:roster.find(p=>p.id===e.player_id)?.name??null,inPlayer:roster.find(p=>p.id===e.details.inPlayerId)?.name??null,outPlayer:roster.find(p=>p.id===e.details.outPlayerId)?.name??null,
  assist:roster.find(p=>p.id===e.details.assistPlayerId)?.name??null,tactic:typeof e.details.tactic==='string'?e.details.tactic:null,reason:typeof e.details.reason==='string'?e.details.reason:null,formation:typeof e.details.formation==='string'?e.details.formation:null,score:{home:e.home_score,away:e.away_score}}));
 const comparisons=events.filter(e=>['substitution','tactic_change','red_card'].includes(e.type)).map(change=>{
  const periodRows=events.filter(e=>e.period===change.period),start=periodRows[0]?.clock_seconds??0,end=last?.period===change.period?time:periodRows.at(-1)!.clock_seconds;
  const beforeStart=Math.max(start,change.clock_seconds-300),afterEnd=Math.min(end,change.clock_seconds+300);
  const before=periodRows.filter(e=>e.sequence<change.sequence&&e.clock_seconds>=beforeStart),after=periodRows.filter(e=>e.sequence>change.sequence&&e.clock_seconds<=afterEnd);
  return {sequence:change.sequence,type:change.type,teamId:change.team_id,before:{observedSeconds:change.clock_seconds-beforeStart,teams:stats(before).map(t=>({...t,goals:before.filter(e=>e.team_id===t.teamId&&e.type==='shot'&&e.outcome==='goal').length}))},
   after:{observedSeconds:Math.max(0,afterEnd-change.clock_seconds),partial:afterEnd-change.clock_seconds<300,teams:stats(after).map(t=>({...t,goals:after.filter(e=>e.team_id===t.teamId&&e.type==='shot'&&e.outcome==='goal').length}))},evidenceSequences:[change.sequence,...after.filter(e=>e.type==='shot').slice(-5).map(e=>e.sequence)]};
 });
 const links=new Map<string,{teamId:string;from:string;to:string;completed:number;attempted:number;sequences:number[]}>();
 for(const e of events.filter(e=>e.type==='pass'&&e.player_id&&typeof e.details.recipientId==='string')){
  const to=String(e.details.recipientId),key=e.player_id+':'+to,l=links.get(key)??{teamId:e.team_id!,from:e.player_id!,to,completed:0,attempted:0,sequences:[]};l.attempted++;if(e.outcome==='complete')l.completed++;l.sequences.push(e.sequence);links.set(key,l);
 }
 const passingLinks=[...links.values()].sort((a,b)=>b.completed-a.completed||a.from.localeCompare(b.from)).slice(0,12).map(({sequences,...l})=>({...l,fromName:roster.find(p=>p.id===l.from)?.name??l.from,toName:roster.find(p=>p.id===l.to)?.name??l.to,evidenceSequences:sequences.slice(-6)}));
 return {version:'match-details-v1',throughSequence:last?.sequence??0,atSeconds:time,eventCount:events.length,fulltime:last?.type==='fulltime',teams,players,phases,timeline,comparisons,passingLinks,
  limitations:'Synthetic event-derived counts. Phase and change windows include only observed time. Before/after comparisons describe association, not causal tactical or substitution impact. Positions never enter these calculations.'};
}
export type MatchDetails=ReturnType<typeof matchDetails>;
