import { Router } from 'express';
import { z } from 'zod';
import { connect } from './connection.js';
export const database = connect('app');
export const matchRoutes=Router();
matchRoutes.get('/',async(_req,res)=>{
  const {rows}=await database.query(`SELECT m.*,h.name AS home_team,a.name AS away_team FROM replay_matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id ORDER BY m.id`);
  res.json({matches:rows});
});
matchRoutes.get('/:id/lineups',async(req,res)=>{
  const {rows}=await database.query('SELECT l.*,p.name,p.position,p.shirt_number FROM replay_lineups l JOIN players p ON p.id=l.player_id WHERE l.match_id=$1 ORDER BY l.team_id,p.shirt_number',[req.params.id]);
  if(!rows.length) {res.status(404).json({error:'Match not found'});return;}
  res.json({lineups:rows});
});
// The caller explicitly chooses the replay cutoff; no final score or generator labels are returned.
matchRoutes.get('/:id/events',async(req,res)=>{
  const parsed=z.object({throughSequence:z.coerce.number().int().min(0).max(100000),afterSequence:z.coerce.number().int().min(0).default(0)}).safeParse(req.query);
  if(!parsed.success) {res.status(400).json({error:'Provide a valid throughSequence (and optional afterSequence)'});return;}
  const {throughSequence,afterSequence}=parsed.data;
  const match=await database.query('SELECT 1 FROM replay_matches WHERE id=$1',[req.params.id]);
  if(!match.rowCount) {res.status(404).json({error:'Match not found'});return;}
  const {rows}=await database.query(`SELECT * FROM replay_events WHERE match_id=$1 AND sequence>$2 AND sequence<=$3 ORDER BY sequence LIMIT 1000`,[req.params.id,afterSequence,throughSequence]);
  res.json({throughSequence,events:rows,nextAfterSequence:rows.at(-1)?.sequence??afterSequence});
});

matchRoutes.get('/:id/tracking',async(req,res)=>{
 const parsed=z.object({throughSequence:z.coerce.number().int().min(0).max(100000),afterSequence:z.coerce.number().int().min(0).default(0)}).safeParse(req.query);
 if(!parsed.success){res.status(400).json({error:'Provide a valid throughSequence (and optional afterSequence)'});return;}
 const match=await database.query('SELECT metadata FROM replay_matches WHERE id=$1',[req.params.id]);
 if(!match.rowCount){res.status(404).json({error:'Match not found'});return;}
 const {throughSequence,afterSequence}=parsed.data;
 const {rows}=await database.query(`SELECT * FROM replay_tracking WHERE match_id=$1 AND through_sequence>$2 AND through_sequence<=$3 ORDER BY through_sequence LIMIT 200`,[req.params.id,afterSequence,throughSequence]);
 res.json({throughSequence,coordinateFrame:match.rows[0].metadata.trackingCoordinateFrame,sampling:match.rows[0].metadata.trackingKind,frames:rows,nextAfterSequence:rows.at(-1)?.through_sequence??afterSequence});
});

matchRoutes.get('/:id/pressing',async(req,res)=>{
 const parsed=z.object({throughSequence:z.coerce.number().int().min(0).max(100000)}).safeParse(req.query);
 if(!parsed.success){res.status(400).json({error:'Provide a valid throughSequence'});return;}
 if(!(await database.query('SELECT 1 FROM replay_matches WHERE id=$1',[req.params.id])).rowCount){res.status(404).json({error:'Match not found'});return;}
 const {throughSequence}=parsed.data;
 const {rows}=await database.query('SELECT * FROM replay_pressing_sequences($1,$2)',[req.params.id,throughSequence]);
 res.json({throughSequence,calculationVersion:'press-v1',definition:'Same defending team, possession and period; maximum 10 seconds between observations',sequenceCount:rows.length,sequences:rows});
});
matchRoutes.get('/:id/producer-feed',async(req,res)=>{
 const parsed=z.object({throughSequence:z.coerce.number().int().min(0).max(100000)}).safeParse(req.query);
 if(!parsed.success){res.status(400).json({error:'Provide a valid throughSequence'});return;}
 if(!(await database.query('SELECT 1 FROM replay_matches WHERE id=$1',[req.params.id])).rowCount){res.status(404).json({error:'Match not found'});return;}
 const {throughSequence}=parsed.data;
 const {rows}=await database.query('SELECT * FROM replay_producer_feed WHERE match_id=$1 AND through_sequence<=$2 ORDER BY through_sequence,id',[req.params.id,throughSequence]);
 res.json({throughSequence,insights:rows});
});
