// Explicit offline design preview, using only the committed, partial public sample.
import {probabilityHistory} from '../../backend/src/probability/inference.ts';
import sample from '../../samples/showcase-prefix.json' with {type:'json'};
import {calculateStatistics,groupPressing,type ReplayEvent} from '../../backend/src/analytics/statistics.ts';
export function sampleResponse(path:string):unknown{
 const url=new URL(path,'https://sample.invalid'),id=sample.match.id;
 const duration=sample.events.at(-1)!.clock_seconds;
 if(url.pathname==='/matches')return {matches:[{...sample.match,duration_seconds:duration,
  home_team:sample.teams.find(t=>t.id===sample.match.home_team_id)!.name,
  away_team:sample.teams.find(t=>t.id===sample.match.away_team_id)!.name,
  home_color:sample.teams.find(t=>t.id===sample.match.home_team_id)!.metadata.color,
  away_color:sample.teams.find(t=>t.id===sample.match.away_team_id)!.metadata.color}]};
 if(url.pathname===`/matches/${id}/lineups`)return {lineups:sample.lineups.map(l=>({...l,...sample.players.find(p=>p.id===l.player_id)}))};
 if(url.pathname===`/matches/${id}/visual-replay`)return {purpose:'visual-only',containsFutureSamples:true,
  frames:sample.frames,events:sample.events.filter(e=>['pass','carry','shot','substitution','red_card','kickoff','throw_in','goal_kick','corner','free_kick'].includes(e.type)).map(e=>({
   sequence:e.sequence,clock_seconds:e.clock_seconds,period:e.period,type:e.type,team_id:e.team_id,player_id:e.player_id,outcome:e.outcome,
   x:e.x,y:e.y,end_x:e.end_x,end_y:e.end_y,
   details:{recipientId:(e.details as Record<string,unknown>).recipientId,durationSeconds:(e.details as Record<string,unknown>).durationSeconds,attackDirection:e.details.attackDirection,
    ballSpeedKmh:(e.details as Record<string,unknown>).ballSpeedKmh,shotSpeedKmh:(e.details as Record<string,unknown>).shotSpeedKmh,
    outPlayerId:(e.details as Record<string,unknown>).outPlayerId,inPlayerId:(e.details as Record<string,unknown>).inPlayerId}}))};
 if(url.pathname===`/matches/${id}/state`){
  const seq=url.searchParams.get('throughSequence');
  const events=sample.events.filter(e=>seq!==null?e.sequence<=Number(seq):e.clock_seconds<=Number(url.searchParams.get('atSeconds')));
  const last=events.at(-1),time=seq!==null?(last?.clock_seconds??0):Math.min(duration,Number(url.searchParams.get('atSeconds')));
  const evidence=events as unknown as ReplayEvent[];
  return {matchId:id,atSeconds:time,throughSequence:last?.sequence??0,period:1,periodClockSeconds:time,
   probabilities:probabilityHistory(evidence,sample.match.home_team_id,time),
   phase:time>=duration?'sample_complete':'playing',statistics:calculateStatistics(evidence,[sample.match.home_team_id,sample.match.away_team_id],groupPressing(evidence)),
   events:events.slice(-100).reverse(),keyEvents:events.filter(e=>['shot','save','red_card','yellow_card','substitution','tactic_change','halftime','fulltime','kickoff'].includes(e.type)).reverse()};
 }
 throw new Error('This feature is unavailable in the public sample.');
}
