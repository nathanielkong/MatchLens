import {Router} from 'express';
import {z} from 'zod';
import type {Pool} from 'pg';
import {calculateStatistics,type ReplayEvent,type PressingSequence} from '../analytics/statistics.js';
const cutoff=z.object({atSeconds:z.coerce.number().int().min(0).max(7200).optional(),
 throughSequence:z.coerce.number().int().min(0).max(100000).optional()})
 .refine(v=>(v.atSeconds===undefined)!==(v.throughSequence===undefined));
export function stateRoutes(database:Pick<Pool,'query'>){
 const router=Router();
 router.get('/:id/state',async(req,res)=>{
  const parsed=cutoff.safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:'Provide exactly one valid atSeconds or throughSequence cutoff'});return;}
  const match=(await database.query('SELECT * FROM replay_matches WHERE id=$1',[req.params.id])).rows[0];
  if(!match){res.status(404).json({error:'Match not found'});return;}
  const requested=parsed.data;
  let throughSequence=requested.throughSequence;
  if(throughSequence===undefined){
   throughSequence=(await database.query('SELECT coalesce(max(sequence),0)::int AS cutoff FROM replay_events WHERE match_id=$1 AND clock_seconds<=$2',[match.id,Math.min(requested.atSeconds!,match.duration_seconds)])).rows[0].cutoff;
  }
  const [eventResult,frameResult,pressingResult]=await Promise.all([
   database.query<ReplayEvent>('SELECT * FROM replay_events WHERE match_id=$1 AND sequence<=$2 ORDER BY sequence',[match.id,throughSequence]),
   database.query('SELECT * FROM replay_tracking WHERE match_id=$1 AND through_sequence<=$2 ORDER BY through_sequence DESC LIMIT 1',[match.id,throughSequence]),
   database.query<PressingSequence>('SELECT * FROM replay_pressing_sequences($1,$2)',[match.id,throughSequence])
  ]);
  const events=eventResult.rows,last=events.at(-1),resolvedSequence=last?.sequence??0;
  const atSeconds=requested.atSeconds===undefined?(last?.clock_seconds??0):Math.min(requested.atSeconds,match.duration_seconds);
  const phase=last?.type==='fulltime'?'fulltime':last?.type==='halftime'?'halftime':last?'playing':'not_started';
  const period=last?.period??1;
  const periodClock=Number(last?.details.periodClockSeconds??0)+Math.max(0,atSeconds-(last?.clock_seconds??atSeconds));
  res.json({matchId:match.id,atSeconds,throughSequence:resolvedSequence,period,periodClockSeconds:periodClock,phase,
   statistics:calculateStatistics(events,[match.home_team_id,match.away_team_id],pressingResult.rows),
   events:events.slice(-100).reverse(),keyEvents:events.filter(e=>['shot','save','red_card','yellow_card','substitution','tactic_change','halftime','fulltime','kickoff'].includes(e.type)).reverse(),frame:frameResult.rows[0]??null,
   coordinateFrame:match.metadata.trackingCoordinateFrame,sampling:match.metadata.trackingKind});
 });
 return router;
}
