import type {Pool} from 'pg';
import type {ReplayEvent} from '../analytics/statistics.js';
import {reviewedWorkflow} from './reviews.js';
import {postgresBudget} from './budget.js';
import {AIError,ProjectAgentClient,projectConfig} from './project.js';
import {evidencePacket,type Audience,type EvidenceMatch} from './evidence.js';
export function insightService(db:Pick<Pool,'query'>){
 let agent:ProjectAgentClient|undefined;
 return async(matchId:string,cutoff:number,audience:Audience,clientId:string,question?:string,purpose:'talking_point'|'recap'|'summary'='summary')=>{
  if(process.env.AI_PROVIDER!=='foundry-agent')throw new AIError('AI_NOT_CONFIGURED');
  const config=projectConfig();if(!config.enabled)throw new AIError('AI_DISABLED');
  const match=(await db.query<EvidenceMatch>(`SELECT m.id,m.home_team_id,m.away_team_id,h.name AS home_team,a.name AS away_team
   FROM replay_matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id WHERE m.id=$1`,[matchId])).rows[0];
  if(!match)throw new AIError('AI_MATCH_NOT_FOUND',404);
  // Only the explicit prefix is queried; never load tracking or hidden truth.
  // Whitelist event detail fields so generator metadata cannot enter the prompt.
  const events=(await db.query<ReplayEvent>(`SELECT sequence,clock_seconds,period,type,team_id,player_id,possession_id,outcome,home_score,away_score,
   jsonb_build_object('periodClockSeconds',details->'periodClockSeconds','xg',details->'xg','durationSeconds',details->'durationSeconds','possessionTeamId',details->'possessionTeamId') AS details
   FROM replay_events WHERE match_id=$1 AND sequence<=$2 ORDER BY sequence`,[matchId,cutoff])).rows;
  const packet=evidencePacket(match,events,cutoff,audience);
  agent??=new ProjectAgentClient(config,postgresBudget(db));
  const answer=await reviewedWorkflow(db,agent,packet,clientId,question,purpose);
  if(purpose==='summary')return answer;
  const kind=purpose==='talking_point'?'talking_point':events.at(-1)?.type==='fulltime'?'fulltime':events.at(-1)?.type==='halftime'?'halftime':'catchup';
  const document={...answer.result,label:kind==='talking_point'?'Producer talking points':kind==='fulltime'?'Full-time recap':kind==='halftime'?'Half-time recap':'Replay recap',publicationKind:kind};
  const saved=await db.query('SELECT publish_producer_document($1,$2) AS id',[JSON.stringify(document),kind]);
  return {...answer,result:document,publishedId:String(saved.rows[0].id)};
 };
}
