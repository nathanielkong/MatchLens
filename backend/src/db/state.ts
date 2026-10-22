import {matchDetails} from '../analytics/match-details.js';
import {periodAnalysis} from '../analytics/periods.js';
import {detectTurningPoints,turningPointMethod} from '../analytics/turning-points.js';
import {probabilityHistory} from '../probability/inference.js';
import {Router} from 'express';
import {z} from 'zod';
import type {Pool} from 'pg';
import {calculateStatistics,groupPressing} from '../analytics/statistics.js';
import {replayStore} from './replay-store.js';
const cutoff=z.object({atSeconds:z.coerce.number().int().min(0).max(7200).optional(),
 throughSequence:z.coerce.number().int().min(0).max(100000).optional(),includeFrame:z.enum(['true','false']).default('true')})
 .refine(v=>(v.atSeconds===undefined)!==(v.throughSequence===undefined));
export function stateRoutes(database:Pick<Pool,'query'>){
 const router=Router(),load=replayStore(database);
 // Explicitly visual-only: this route contains future position/ball keyframes.
 // Agents and probability tools must use /state and the cutoff-safe event routes.
 router.get('/:id/visual-replay',async(req,res)=>{
  const replay=await load(req.params.id);
  if(!replay){res.status(404).json({error:'Match not found'});return;}
  res.json({purpose:'visual-only',containsFutureSamples:true,coordinateFrame:replay.match.metadata.trackingCoordinateFrame,
   label:'Interpolated simulated samples; approximate motion, not continuous tracking',frames:replay.frames,
   events:replay.events.filter(e=>['pass','carry','shot','substitution','red_card','kickoff','throw_in','goal_kick','corner','free_kick'].includes(e.type)).map(e=>({
    sequence:e.sequence,clock_seconds:e.clock_seconds,period:e.period,type:e.type,team_id:e.team_id,player_id:e.player_id,outcome:e.outcome,
    x:e.x??null,y:e.y??null,
    end_x:e.end_x??null,end_y:e.end_y??null,
    details:{recipientId:e.details.recipientId,durationSeconds:e.details.durationSeconds,attackDirection:e.details.attackDirection,
     ballSpeedKmh:e.details.ballSpeedKmh,shotSpeedKmh:e.details.shotSpeedKmh,
     outPlayerId:e.details.outPlayerId,inPlayerId:e.details.inPlayerId}}))});
 });
 // Rich event-derived analysis is separate from the per-second playback payload.
 router.get('/:id/analysis',async(req,res)=>{
  const parsed=cutoff.safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:'Provide exactly one valid atSeconds or throughSequence cutoff'});return;}
  const replay=await load(req.params.id);if(!replay){res.status(404).json({error:'Match not found'});return;}
  const time=parsed.data.atSeconds===undefined?undefined:Math.min(parsed.data.atSeconds,replay.match.duration_seconds);
  const seq=parsed.data.throughSequence??replay.events.filter(e=>e.clock_seconds<=time!).at(-1)?.sequence??0;
  res.json({matchId:replay.match.id,...matchDetails(replay.events,[replay.match.home_team_id,replay.match.away_team_id],replay.players,seq,time)});
 });
 router.get('/:id/state',async(req,res)=>{
  const parsed=cutoff.safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:'Provide exactly one valid atSeconds or throughSequence cutoff'});return;}
  const replay=await load(req.params.id);
  if(!replay){res.status(404).json({error:'Match not found'});return;}
  const {match}=replay,requested=parsed.data;
  // Filter BEFORE grouping statistics or exposing evidence. The renderer and its
  // interpolated positions never enter this calculation.
  const events=replay.events.filter(e=>requested.throughSequence!==undefined?e.sequence<=requested.throughSequence:
   e.clock_seconds<=Math.min(requested.atSeconds!,match.duration_seconds));
  const last=events.at(-1),resolvedSequence=last?.sequence??0;
  const atSeconds=requested.atSeconds===undefined?(last?.clock_seconds??0):Math.min(requested.atSeconds,match.duration_seconds);
  const phase=last?.type==='fulltime'?'fulltime':last?.type==='halftime'?'halftime':last?'playing':'not_started';
  const period=last?.period??1;
  const periodClock=Number(last?.details.periodClockSeconds??0)+Math.max(0,atSeconds-(last?.clock_seconds??atSeconds));
  res.json({matchId:match.id,atSeconds,throughSequence:resolvedSequence,period,periodClockSeconds:periodClock,phase,
   turningPoints:{...turningPointMethod,points:detectTurningPoints(events,match.home_team_id,resolvedSequence)},
   analysis:periodAnalysis(events,[match.home_team_id,match.away_team_id],resolvedSequence,atSeconds),
   probabilities:probabilityHistory(events,match.home_team_id,atSeconds),
   statistics:calculateStatistics(events,[match.home_team_id,match.away_team_id],groupPressing(events)),
   events:events.slice(-100).reverse(),keyEvents:events.filter(e=>['shot','save','red_card','yellow_card','substitution','tactic_change','halftime','fulltime','kickoff'].includes(e.type)).reverse(),
   frame:requested.includeFrame==='false'?null:[...replay.frames].reverse().find(f=>f.through_sequence<=resolvedSequence)??null,
   coordinateFrame:match.metadata.trackingCoordinateFrame,sampling:match.metadata.trackingKind});
 });
 return router;
}
