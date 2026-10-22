import type {Pool} from 'pg';
import type {ReplayEvent} from '../analytics/statistics.js';
import {reviewedWorkflow} from './reviews.js';
import {postgresBudget} from './budget.js';
import {AIError,ProjectAgentClient,projectConfig} from './project.js';
import {conversationStore} from './conversation.js';
import {questionWindow} from './detailed-facts.js';
import type {MatchContext,EvidencePlayer} from './match-facts.js';
import {evidencePacket,type Audience,type EvidenceMatch} from './evidence.js';
export async function loadEvidencePacket(db:Pick<Pool,'query'>,matchId:string,cutoff:number,audience:Audience,question?:string,hints:Pick<MatchContext,'focusPlayerIds'|'focusChangeSequences'|'inheritedWindow'>={}){
  const match=(await db.query<EvidenceMatch&{home_formation:string;away_formation:string}>(`SELECT m.id,m.home_team_id,m.away_team_id,h.name AS home_team,a.name AS away_team,m.metadata->>'homeFormation' AS home_formation,m.metadata->>'awayFormation' AS away_formation
   FROM replay_matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id WHERE m.id=$1`,[matchId])).rows[0];
  if(!match)throw new AIError('AI_MATCH_NOT_FOUND',404);
  // Only the explicit prefix is queried; never load tracking or hidden truth.
  // Whitelist event detail fields so generator metadata cannot enter the prompt.
  const events=(await db.query<ReplayEvent>(`SELECT sequence,clock_seconds,period,type,team_id,player_id,possession_id,outcome,home_score,away_score,
   jsonb_build_object('periodClockSeconds',details->'periodClockSeconds','xg',details->'xg','durationSeconds',details->'durationSeconds','possessionTeamId',details->'possessionTeamId','tactic',details->'tactic','reason',details->'reason','inPlayerId',details->'inPlayerId','outPlayerId',details->'outPlayerId','assistPlayerId',details->'assistPlayerId','keyPassPlayerId',details->'keyPassPlayerId','goalkeeperId',details->'goalkeeperId','recipientId',details->'recipientId','distanceMetres',details->'distanceMetres','progressiveMetres',details->'progressiveMetres','formation',details->'formation') AS details
   FROM replay_events WHERE match_id=$1 AND sequence<=$2 ORDER BY sequence`,[matchId,cutoff])).rows;
  const players=(await db.query<EvidencePlayer>('SELECT p.id,p.team_id AS "teamId",p.name,p.shirt_number AS shirt,p.position,l.starter,l.role FROM replay_lineups l JOIN players p ON p.id=l.player_id WHERE l.match_id=$1 ORDER BY p.id',[matchId])).rows;
  const packet=evidencePacket(match,events,cutoff,audience,{players,homeFormation:match.home_formation,awayFormation:match.away_formation,question,...hints});
 return {packet,events,players};
}
export function insightService(db:Pick<Pool,'query'>){
 let agent:ProjectAgentClient|undefined;const chat=conversationStore();
 return async(matchId:string,cutoff:number,audience:Audience,clientId:string,question?:string,purpose:'talking_point'|'recap'|'summary'='summary',historyIds:string[]=[])=>{
  if(process.env.AI_PROVIDER!=='foundry-agent')throw new AIError('AI_NOT_CONFIGURED');
  const config=projectConfig();if(!config.enabled)throw new AIError('AI_DISABLED');
  const scope={matchId,audience,throughSequence:cutoff,owner:clientId},previous=chat.read(question?historyIds:[],scope),lastTurn=previous.context.at(-1);
  const follows=!!question&&(/\b(?:he|him|his|she|her|they|them|their|that|those|afterwards|earlier|same)\b/i.test(question)||/^(?:why|how so|and\b|what about\b)[?!. ]*$/i.test(question));
  const inheritedWindow=question&&/that (?:period|window|spell)|same (?:period|window)|during that/i.test(question)?lastTurn?.window:undefined;
  const {packet,events,players}=await loadEvidencePacket(db,matchId,cutoff,audience,question,{focusPlayerIds:follows?lastTurn?.playerIds:undefined,focusChangeSequences:follows?lastTurn?.eventSequences:undefined,inheritedWindow});
  agent??=new ProjectAgentClient(config,postgresBudget(db));
  const answer=await reviewedWorkflow(db,agent,packet,clientId,question,purpose,previous.context);
  if(question){
   const result=answer.result,resolved='resolvedQuestion' in result?String(result.resolvedQuestion):question,text=result.claims.map(c=>c.text).join(' '),mentioned=(resolved+' '+text).toLowerCase();
   const window=questionWindow(resolved,packet.atSeconds)??inheritedWindow;
   const conversationId=chat.remember({...scope,throughSequence:packet.throughSequence},{question:resolved,answer:text||('refusal' in result?String(result.refusal):''),throughSequence:packet.throughSequence,factIds:result.claims.map(c=>c.id),playerIds:players.filter(p=>mentioned.includes(p.name.toLowerCase())).map(p=>p.id),eventSequences:[...new Set(result.claims.flatMap(c=>c.evidenceSequences))],window:window?{from:window.from,to:window.to}:undefined});
   return {...answer,conversationId,contextReset:previous.reset};
  }
  if(purpose==='summary')return answer;
  const kind=purpose==='talking_point'?'talking_point':events.at(-1)?.type==='fulltime'?'fulltime':events.at(-1)?.type==='halftime'?'halftime':'catchup';
  const document={...answer.result,label:kind==='talking_point'?'Producer talking points':kind==='fulltime'?'Full-time recap':kind==='halftime'?'Half-time recap':'Replay recap',publicationKind:kind};
  const saved=await db.query('SELECT publish_producer_document($1,$2) AS id',[JSON.stringify(document),kind]);
  return {...answer,result:document,publishedId:String(saved.rows[0].id)};
 };
}
