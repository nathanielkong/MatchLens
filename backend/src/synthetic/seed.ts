import {connect} from '../db/connection.js';
import {generate,random} from './generator.js';
import {abilities,players,teams,teamProfiles,VERSION,datasetPlans,scenarios,roleForSlot} from './catalog.js';
import {validateMatch,VALIDATOR_VERSION} from './validate.js';
const pool=connect(),client=await pool.connect();
const insertEvents=`INSERT INTO events(match_id,sequence,clock_seconds,period,type,team_id,player_id,possession_id,x,y,end_x,end_y,outcome,details,home_score,away_score)
 SELECT $1,e.sequence,e.clock,e.period,e.type,e."teamId",e."playerId",e.possession,e.x,e.y,e."endX",e."endY",e.outcome,e.details,e."homeScore",e."awayScore"
 FROM jsonb_to_recordset($2::jsonb) AS e(sequence int,clock int,period smallint,type text,"teamId" text,"playerId" text,possession int,x real,y real,"endX" real,"endY" real,outcome text,details jsonb,"homeScore" int,"awayScore" int)`;
try {
 // Lock is session scoped: each match commits independently so interrupted runs can resume.
 await client.query('SELECT pg_advisory_lock(718042)');
 for(const t of teams)await client.query(`INSERT INTO teams(id,name,metadata) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,metadata=EXCLUDED.metadata`,[t.id,t.name,{color:t.color,fictional:true}]);
 for(const p of players){
  await client.query('INSERT INTO players(id,team_id,name,position,shirt_number) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[p.id,p.teamId,p.name,p.position,p.shirt]);
  await client.query('INSERT INTO simulation_private.player_attributes VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.id,VERSION,abilities.get(p.id)]);
 }
 for(const p of teamProfiles)await client.query('INSERT INTO simulation_private.team_parameters VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.teamId,VERSION,p]);
 let added=0,totalEvents=0;
 for(const plan of datasetPlans){
  const datasetId=`${plan.split}-v${VERSION}`;
  await client.query(`INSERT INTO datasets(id,split,generator_version,seed,active,configuration) VALUES($1,$2,$3,$4,false,$5) ON CONFLICT DO NOTHING`,[datasetId,plan.split,VERSION,plan.seed,{count:plan.count,selection:'independent-seeded-random',trackingIntervalSeconds:plan.split==='showcase'?0:30,evaluationStressFraction:plan.split==='evaluation'?.2:0}]);
  const existing=new Set((await client.query('SELECT id FROM matches WHERE dataset_id=$1',[datasetId])).rows.map(r=>r.id));
  for(let i=0;i<plan.count;i++){
   const id=`${datasetId}-${i+1}`;if(existing.has(id))continue;
   // Team pairing, scenario and RNG seeds are independently selected; no team identifies a scenario.
   const choose=random(plan.seed+i+10000000),home=Math.floor(choose()*teams.length),away=(home+1+Math.floor(choose()*(teams.length-1)))%teams.length;
   const scenario=plan.split==='showcase'?scenarios[i%scenarios.length]:scenarios[Math.floor(choose()*scenarios.length)];
   const regime=plan.split==='evaluation'&&i%5===0?'stress':'standard';
   const m=generate(plan.seed+i,scenario,home,away,{tracking:true,trackingIntervalSeconds:plan.split==='showcase'?0:30,regime});
   validateMatch(m);
   await client.query('BEGIN');
   try{
    await client.query('INSERT INTO matches(id,dataset_id,home_team_id,away_team_id,duration_seconds,metadata,kickoff_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,datasetId,m.home.id,m.away.id,m.duration,m.metadata,new Date(Date.UTC(2026,0,1)+i*86400000)]);
    const lineup=m.roster.flatMap((roster,s)=>roster.map((p,j)=>({team_id:p.teamId,player_id:p.id,starter:j<11,role:j<11?roleForSlot(m.profiles[s].formation,j):p.position})));
    await client.query(`INSERT INTO lineups(match_id,team_id,player_id,starter,role) SELECT $1,l.team_id,l.player_id,l.starter,l.role
     FROM jsonb_to_recordset($2::jsonb) AS l(team_id text,player_id text,starter boolean,role text)`,[id,JSON.stringify(lineup)]);
    await client.query(insertEvents,[id,JSON.stringify(m.events)]);
    await client.query(`INSERT INTO tracking_frames(match_id,through_sequence,clock_seconds,period,ball,positions)
     SELECT $1,f.sequence,f.clock,f.period,f.ball,f.positions FROM jsonb_to_recordset($2::jsonb) AS f(sequence int,clock int,period smallint,ball jsonb,positions jsonb)`,[id,JSON.stringify(m.frames)]);
    await client.query('INSERT INTO simulation_private.match_truth(match_id,seed,scenario,home_strength,away_strength,final_home_score,final_away_score,configuration) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,m.seed,m.scenario,...m.strength,...m.score,{regime,firstHalfEnd:m.firstEnd,profiles:m.profiles}]);
    await client.query('COMMIT');added++;totalEvents+=m.events.length;
   }catch(error){await client.query('ROLLBACK');throw error;}
   if((i+1)%100===0||i===plan.count-1)console.log(`${plan.split}: ${i+1}/${plan.count} matches ready`);
  }
  const summary=(await client.query(`SELECT count(*)::int AS matches,sum((SELECT count(*) FROM events e WHERE e.match_id=m.id))::int AS events,
   sum((SELECT count(*) FROM tracking_frames f WHERE f.match_id=m.id))::int AS tracking_frames,
   round(avg(t.final_home_score+t.final_away_score),3) AS mean_goals,
   sum((SELECT count(*) FROM events e WHERE e.match_id=m.id AND e.type='red_card'))::int AS red_cards
   FROM matches m JOIN simulation_private.match_truth t ON t.match_id=m.id WHERE m.dataset_id=$1`,[datasetId])).rows[0];
  await client.query(`INSERT INTO dataset_quality_reports VALUES($1,$2,$3,now()) ON CONFLICT(dataset_id) DO UPDATE SET validator_version=EXCLUDED.validator_version,summary=EXCLUDED.summary,created_at=now()`,[datasetId,VALIDATOR_VERSION,{...summary,checks:'sequence,clock,score,active players,coordinates,shot links,restarts,tracking',probabilitiesCalibrated:false,simulationNotRealWorldValidation:true}]);
 }
 // Publish v2 only when every split has been generated and validated.
 await client.query('BEGIN');
 await client.query("UPDATE datasets SET active=false WHERE generator_version='1.0.0'");
 await client.query('UPDATE datasets SET active=true WHERE generator_version=$1',[VERSION]);
 await client.query('COMMIT');
 console.log(`Added ${added} v${VERSION} matches and ${totalEvents} events. Previous data retained.`);
}finally{await client.query('SELECT pg_advisory_unlock(718042)');client.release();await pool.end();}
