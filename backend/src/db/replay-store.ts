import type {Pool} from 'pg';
import type {MatchPlayer} from '../analytics/match-details.js';
import type {ReplayEvent} from '../analytics/statistics.js';
export type StoredFrame={through_sequence:number;clock_seconds:number;period:number;ball:unknown;positions:unknown[]};
type Match={id:string;duration_seconds:number;home_team_id:string;away_team_id:string;metadata:Record<string,unknown>};
export type Replay={match:Match;events:ReplayEvent[];frames:StoredFrame[];players:MatchPlayer[]};
// Showcase data is immutable. Bound memory and expire after five minutes. Only
// approved replay views are loaded; private simulation labels are never cached.
export function replayStore(database:Pick<Pool,'query'>){
 const cache=new Map<string,{loadedAt:number;data:Promise<Replay|null>}>();
 return async(id:string)=>{
  const existing=cache.get(id);if(existing&&Date.now()-existing.loadedAt<300000)return existing.data;
  const entry={loadedAt:Date.now(),data:(async()=>{
   const match=(await database.query<Match>('SELECT * FROM replay_matches WHERE id=$1',[id])).rows[0];
   if(!match)return null;
   const [events,frames,players]=await Promise.all([
    database.query<ReplayEvent>('SELECT * FROM replay_events WHERE match_id=$1 ORDER BY sequence',[id]),
    database.query<StoredFrame>('SELECT * FROM replay_tracking WHERE match_id=$1 ORDER BY through_sequence',[id]),
    database.query<MatchPlayer>('SELECT p.id,p.team_id AS "teamId",p.name,p.shirt_number AS shirt,p.position,l.starter,l.role FROM replay_lineups l JOIN players p ON p.id=l.player_id WHERE l.match_id=$1 ORDER BY p.id',[id])
   ]);
   return {match,events:events.rows,frames:frames.rows,players:players.rows};
  })()};
  cache.delete(id);cache.set(id,entry);
  while(cache.size>4)cache.delete(cache.keys().next().value!);
  try{return await entry.data;}catch(error){if(cache.get(id)===entry)cache.delete(id);throw error;}
 };
}
